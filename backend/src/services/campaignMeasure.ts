// Kampanie, Etap 2 — pomiar na danych: sprawdzanie odpowiedzi w Gmailu i przypisanie
// zamówień. Reguły (czyste funkcje) w campaignResults.ts; tu tylko odczyt/zapis.
// Nic tu nie wysyła maili — używa tego przycisk w raporcie i skrypt dzienny.
import { db } from './firebase';
import {
  getThreadMessages, listThreadIdsWithIncomingMail, listMessageRefs, getMessage, getThreadMessageIds,
  GMAIL_READ_SCOPE_ERROR, GMAIL_RATE_LIMIT_ERROR,
} from './gmail';
import {
  findReply, extractReplyText, incomingMailQuery, recipientMailQueries, repliesToAny, ThreadMessage, isUnsubscribeReply, attributeOrders, computeResults,
  AttributedOrder, AttributionCampaign, ClientOrder, CallOutcome,
} from './campaignResults';
import { recomputeLastContact } from '../utils/date';

const COLLECTION = 'campaigns';
const THREAD_PAUSE_MS = 150;
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

  const todo = (c.recipients ?? []).filter(r => r.status === 'sent' && !r.replied && !r.unsubscribeRequest);

  // Limit Gmaila to ok. 70 pobrań wątku na minutę (zmierzone 2026-10-14) — dlatego najpierw jedną
  // listą ustalamy, do których wątków w ogóle coś przyszło, i tylko te pobieramy.
  // Gdy zawężenie się nie uda, sprawdzamy wszystkie wątki jak dawniej.
  let withIncoming: Set<string> | null = null;
  const query = incomingMailQuery(todo.filter(r => r.gmailThreadId).map(r => r.sentAt || c.sentAt));
  if (query) {
    try {
      withIncoming = await listThreadIdsWithIncomingMail(query);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === GMAIL_READ_SCOPE_ERROR || msg === GMAIL_RATE_LIMIT_ERROR) throw err;
      console.error('[campaignMeasure] lista wiadomości — sprawdzam wszystkie wątki:', msg);
    }
  }

  const recordReply = async (r: MeasuredRecipient, reply: ThreadMessage) => {
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
  };

  // Przerwa między pobraniami — kampania na kilkadziesiąt adresów nie wyczerpie limitu na minutę
  let fetched = 0;
  const pause = async () => { if (fetched++ > 0) await new Promise(res => setTimeout(res, THREAD_PAUSE_MS)); };
  const isFatal = (err: unknown) => {
    const msg = (err as Error).message;
    return msg === GMAIL_READ_SCOPE_ERROR || msg === GMAIL_RATE_LIMIT_ERROR;
  };

  for (const r of todo) {
    if (!r.gmailThreadId) { summary.noThread++; continue; }
    summary.checked++;
    if (withIncoming && !withIncoming.has(r.gmailThreadId)) continue; // nic nie przyszło — brak odpowiedzi
    await pause();
    try {
      const messages = await getThreadMessages(r.gmailThreadId);
      const reply = findReply(messages, r.email, r.sentAt || c.sentAt || '');
      if (reply) await recordReply(r, reply);
    } catch (err) {
      if (isFatal(err)) throw err;
      console.error(`[campaignMeasure] wątek ${r.gmailThreadId} (${r.email}):`, (err as Error).message);
      summary.errors++;
    }
  }

  // Odpowiedź ze zmienionym tematem Gmail umieszcza w nowym wątku. Szukamy maili od odbiorców
  // bez odpowiedzi poza wątkami kampanii i liczymy te, których In-Reply-To / References
  // wskazują na nasz mail kampanii do tego odbiorcy (mail na inny temat się nie liczy).
  const pending = todo.filter(r => r.gmailThreadId && !updates.has(r.clientId));
  const byEmail = new Map(pending.map(r => [r.email.trim().toLowerCase(), r]));
  const campaignThreads = new Set(todo.map(r => r.gmailThreadId).filter(Boolean));
  const found = new Map<string, ThreadMessage>(); // clientId → najwcześniejsza odpowiedź
  const ourIds = new Map<string, string[]>();      // wątek kampanii → Message-ID naszych maili
  for (const q of recipientMailQueries([...byEmail.keys()], pending.map(r => r.sentAt || c.sentAt))) {
    let refs: Array<{ id: string; threadId: string }>;
    try {
      refs = await listMessageRefs(q);
    } catch (err) {
      if (isFatal(err)) throw err;
      console.error('[campaignMeasure] szukanie odpowiedzi w innych wątkach:', (err as Error).message);
      summary.errors++;
      continue;
    }
    for (const ref of refs) {
      if (campaignThreads.has(ref.threadId)) continue; // wątek kampanii — sprawdzony wyżej
      try {
        await pause();
        const msg = await getMessage(ref.id);
        const r = byEmail.get(msg.from);
        if (!r || !(msg.date > (r.sentAt || c.sentAt || ''))) continue;
        const prev = found.get(r.clientId);
        if (prev && prev.date <= msg.date) continue;
        if (!ourIds.has(r.gmailThreadId!)) { await pause(); ourIds.set(r.gmailThreadId!, await getThreadMessageIds(r.gmailThreadId!)); }
        if (repliesToAny(msg, ourIds.get(r.gmailThreadId!)!)) found.set(r.clientId, msg);
      } catch (err) {
        if (isFatal(err)) throw err;
        console.error(`[campaignMeasure] wiadomość ${ref.id}:`, (err as Error).message);
        summary.errors++;
      }
    }
  }
  for (const r of pending) {
    const reply = found.get(r.clientId);
    if (reply) await recordReply(r, reply);
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
