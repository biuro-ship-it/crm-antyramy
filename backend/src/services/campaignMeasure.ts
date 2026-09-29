// Kampanie, Etap 2 — pomiar na danych: sprawdzanie odpowiedzi w Gmailu i przypisanie
// zamówień. Reguły (czyste funkcje) w campaignResults.ts; tu tylko odczyt/zapis.
// Nic tu nie wysyła maili — używa tego przycisk w raporcie i skrypt dzienny.
import { db } from './firebase';
import { getThreadMessages, GMAIL_READ_SCOPE_ERROR } from './gmail';
import {
  findReply, extractReplyText, isUnsubscribeReply, attributeOrders, computeResults,
  AttributedOrder, AttributionCampaign, ClientOrder, CallOutcome,
} from './campaignResults';
import { recomputeLastContact } from '../utils/date';

const COLLECTION = 'campaigns';
export const CAMPAIGN_SETTINGS_DOC = 'settings/campaigns';
export const DEFAULT_ATTRIBUTION_DAYS = 14;

export interface MeasuredRecipient {
  clientId: string;
  companyName: string;
  email: string;
  variant: 'A' | 'B';
  status: 'pending' | 'sent' | 'failed';
  sentAt?: string | null;
  gmailThreadId?: string | null;
  replied?: boolean;
  repliedAt?: string | null;
  replySnippet?: string;
  unsubscribeRequest?: boolean;
  orders?: AttributedOrder[];
  followupId?: string | null;
  callOutcome?: CallOutcome | null;
  callNote?: string;
  calledAt?: string | null;
  [key: string]: unknown;
}

interface MeasuredCampaign {
  name: string;
  status: string;
  sentAt: string | null;
  recipients: MeasuredRecipient[];
  results?: Record<string, number>;
}

export const getAttributionDays = async (): Promise<number> => {
  const snap = await db.doc(CAMPAIGN_SETTINGS_DOC).get();
  const n = Number(snap.exists ? snap.data()?.attributionDays : NaN);
  return Number.isFinite(n) && n >= 1 && n <= 90 ? n : DEFAULT_ATTRIBUTION_DAYS;
};

/** Przelicza `results` z listy odbiorców (zachowuje ewentualne inne pola). */
export const withResults = (prev: Record<string, number> | undefined, recipients: MeasuredRecipient[]) => ({
  ...(prev ?? {}),
  ...computeResults(recipients),
});

// ─── Odpowiedzi ─────────────────────────────────────────────────────────────

export interface ReplyCheckSummary {
  checked: number;
  newReplies: number;
  newUnsubscribeRequests: number;
  noThread: number;       // odbiorcy bez gmailThreadId (np. kampanie przeniesione z Promocji)
  errors: number;
}

export const checkReplies = async (campaignId: string): Promise<ReplyCheckSummary> => {
  const ref = db.collection(COLLECTION).doc(campaignId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Kampania nie istnieje');
  const c = snap.data() as MeasuredCampaign;

  const summary: ReplyCheckSummary = { checked: 0, newReplies: 0, newUnsubscribeRequests: 0, noThread: 0, errors: 0 };
  const updates = new Map<string, Partial<MeasuredRecipient>>();

  for (const r of c.recipients ?? []) {
    if (r.status !== 'sent' || r.replied || r.unsubscribeRequest) continue;
    if (!r.gmailThreadId) { summary.noThread++; continue; }
    summary.checked++;
    try {
      const messages = await getThreadMessages(r.gmailThreadId);
      const reply = findReply(messages, r.email, r.sentAt || c.sentAt || '');
      if (!reply) continue;
      const text = extractReplyText(reply.text);
      const unsubscribe = isUnsubscribeReply(text);
      const snippet = text.replace(/\s+/g, ' ').slice(0, 200);
      updates.set(r.clientId, {
        replied: !unsubscribe,
        unsubscribeRequest: unsubscribe,
        repliedAt: reply.date,
        replySnippet: snippet,
      });
      if (unsubscribe) summary.newUnsubscribeRequests++; else summary.newReplies++;

      // Historia kontaktów przy pierwszym wykryciu. Błąd historii nie blokuje wyniku.
      try {
        const clientRef = db.collection('clients').doc(r.clientId);
        await clientRef.collection('interactions').add({
          contactDate: reply.date.slice(0, 10),
          channel: 'mail',
          notes: unsubscribe
            ? `Prośba o wypis (odpowiedź NIE) — kampania: ${c.name}`
            : `Odpowiedź na kampanię: ${c.name}`,
          tradeNotes: snippet,
          campaignId,
          createdBy: 'kampanie (automatycznie)',
          createdAt: new Date().toISOString(),
        });
        await recomputeLastContact(clientRef);
      } catch (histErr) {
        console.error(`[campaignMeasure] historia klienta ${r.clientId} nie zapisana:`, histErr);
      }
    } catch (err) {
      if ((err as Error).message === GMAIL_READ_SCOPE_ERROR) throw err;
      console.error(`[campaignMeasure] wątek ${r.gmailThreadId} (${r.email}):`, (err as Error).message);
      summary.errors++;
    }
  }

  await db.runTransaction(async tx => {
    const fresh = (await tx.get(ref)).data() as MeasuredCampaign;
    const recipients = (fresh.recipients ?? []).map(r => {
      const u = updates.get(r.clientId);
      // Nie nadpisujemy, jeśli w międzyczasie ktoś oznaczył odpowiedź
      return u && !r.replied && !r.unsubscribeRequest ? { ...r, ...u } : r;
    });
    tx.update(ref, {
      recipients,
      results: withResults(fresh.results, recipients),
      repliesCheckedAt: new Date().toISOString(),
    });
  });

  return summary;
};

// ─── Zamówienia ─────────────────────────────────────────────────────────────

const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

const sameOrders = (a: AttributedOrder[] = [], b: AttributedOrder[] = []) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Przelicza przypisanie zamówień we WSZYSTKICH wysłanych kampaniach naraz
 * (reguła „ostatnia kampania przed zamówieniem” wymaga pełnego obrazu).
 * Zwraca liczbę kampanii, w których coś się zmieniło.
 */
export const recomputeOrders = async (): Promise<{ campaigns: number; changed: number }> => {
  const windowDays = await getAttributionDays();
  const snap = await db.collection(COLLECTION).where('status', 'in', ['sent', 'sending']).get();
  const campaigns: AttributionCampaign[] = snap.docs.map(d => {
    const c = d.data() as MeasuredCampaign;
    return { id: d.id, sentAt: c.sentAt, recipients: c.recipients ?? [] };
  });

  const clientIds = [...new Set(campaigns.flatMap(c => c.recipients.filter(r => r.status === 'sent').map(r => r.clientId)))];
  const ordersByClient = new Map<string, ClientOrder[]>();
  for (const part of chunk(clientIds, 100)) {
    const snaps = await db.getAll(...part.map(id => db.collection('clients').doc(id)));
    snaps.forEach(s => {
      if (s.exists) ordersByClient.set(s.id, ((s.data()!.orders ?? []) as ClientOrder[]));
    });
  }

  const attributed = attributeOrders(campaigns, ordersByClient, windowDays);
  let changed = 0;
  const now = new Date().toISOString();

  for (const doc of snap.docs) {
    const perClient = attributed.get(doc.id) ?? new Map<string, AttributedOrder[]>();
    await db.runTransaction(async tx => {
      const fresh = (await tx.get(doc.ref)).data() as MeasuredCampaign;
      let dirty = false;
      const recipients = (fresh.recipients ?? []).map(r => {
        const next = perClient.get(r.clientId) ?? [];
        if (sameOrders(r.orders, next)) return r;
        dirty = true;
        return { ...r, orders: next };
      });
      if (dirty) changed++;
      tx.update(doc.ref, {
        ...(dirty ? { recipients, results: withResults(fresh.results, recipients) } : {}),
        ordersComputedAt: now,
      });
    });
  }

  return { campaigns: snap.size, changed };
};

/** Ręczna decyzja o zamówieniu w raporcie: potwierdź / odrzuć / przywróć „auto”. */
export const setOrderStatus = async (
  campaignId: string,
  clientId: string,
  orderId: string,
  status: AttributedOrder['status'],
): Promise<void> => {
  const ref = db.collection(COLLECTION).doc(campaignId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('Kampania nie istnieje');
    const c = snap.data() as MeasuredCampaign;
    let found = false;
    const recipients = (c.recipients ?? []).map(r => {
      if (r.clientId !== clientId) return r;
      return {
        ...r,
        orders: (r.orders ?? []).map(o => {
          if (o.orderId !== orderId) return o;
          found = true;
          return { ...o, status };
        }),
      };
    });
    if (!found) throw new Error('Nie znaleziono zamówienia w tej kampanii');
    tx.update(ref, { recipients, results: withResults(c.results, recipients) });
  });
};
