// Kampanie, Etap 2 — telefony kontrolne: tworzenie follow-upów dla odbiorców bez
// odpowiedzi i zapis szybkiego wyniku rozmowy (historia kontaktów + wynik w kampanii).
import { db } from './firebase';
import { createFollowUp, setFollowUpStatus } from './followupService';
import { addWorkingDays, CallOutcome } from './campaignResults';
import { MeasuredRecipient, withResults } from './campaignMeasure';
import { todayISO, recomputeLastContact } from '../utils/date';

const FOLLOWUP_WORKING_DAYS = 2;

export const CALL_OUTCOME_LABEL: Record<CallOutcome, string> = {
  ordered: 'zamówił',
  callback: 'oddzwonić',
  not_now: 'nie teraz',
  no_answer: 'nie odebrał',
};

// „oddzwonić” i „nie odebrał” → kolejny telefon (decyzja Krzyśka 2026-09-29)
const NEEDS_NEXT_CALL: CallOutcome[] = ['callback', 'no_answer'];

interface CampaignLike { name: string; recipients: MeasuredRecipient[]; results?: Record<string, number> }

export const followupTitle = (campaignName: string) => `Telefon: ${campaignName}`;

/**
 * Follow-upy „Telefon: {kampania}” na +2 dni robocze dla wysłanych bez odpowiedzi,
 * bez prośby o wypis, bez wypisu na karcie i bez istniejącego zadania z tej kampanii.
 */
export const createCampaignFollowups = async (campaignId: string): Promise<{ created: number; skipped: number; dueDate: string }> => {
  const ref = db.collection('campaigns').doc(campaignId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Kampania nie istnieje');
  const c = snap.data() as CampaignLike;

  const candidates = (c.recipients ?? []).filter(r =>
    r.status === 'sent' && !r.replied && !r.unsubscribeRequest && !r.followupId);
  const clientSnaps = candidates.length
    ? await db.getAll(...candidates.map(r => db.collection('clients').doc(r.clientId)))
    : [];

  const dueDate = addWorkingDays(todayISO(), FOLLOWUP_WORKING_DAYS);
  const created = new Map<string, string>(); // clientId → followupId
  let skipped = (c.recipients ?? []).filter(r => r.status === 'sent').length - candidates.length;

  for (let i = 0; i < candidates.length; i++) {
    const r = candidates[i];
    const client = clientSnaps[i];
    if (!client.exists || client.data()!.noMarketing) { skipped++; continue; }
    const f = await createFollowUp({
      clientId: r.clientId,
      clientName: r.companyName || client.data()!.companyName || '',
      dueDate,
      reminderText: followupTitle(c.name),
      campaignId,
    });
    created.set(r.clientId, f.id);
  }

  if (created.size) {
    await db.runTransaction(async tx => {
      const fresh = (await tx.get(ref)).data() as CampaignLike;
      const recipients = (fresh.recipients ?? []).map(r =>
        created.has(r.clientId) && !r.followupId ? { ...r, followupId: created.get(r.clientId)! } : r);
      tx.update(ref, { recipients });
    });
  }
  return { created: created.size, skipped, dueDate };
};

/**
 * Szybki wynik rozmowy przy zadaniu: zamyka zadanie, wpis w historii kontaktów,
 * wynik u odbiorcy kampanii (+ przeliczenie wyników), ewentualnie kolejny telefon.
 */
export const recordCallOutcome = async (
  followupId: string,
  outcome: CallOutcome,
  note: string,
  userEmail: string,
): Promise<{ nextFollowupId: string | null; nextDueDate: string | null }> => {
  const fRef = db.collection('followups').doc(followupId);
  const fSnap = await fRef.get();
  if (!fSnap.exists) throw new Error('Zadanie nie istnieje');
  const f = fSnap.data() as { clientId: string; clientName: string; reminderText: string; campaignId?: string; status: string };
  if (f.status === 'zrealizowane') throw new Error('To zadanie jest już zamknięte');

  let campaignName = '';
  if (f.campaignId) {
    const cSnap = await db.collection('campaigns').doc(f.campaignId).get();
    campaignName = cSnap.exists ? (cSnap.data()!.name as string) : '';
  }

  await setFollowUpStatus(followupId, 'zrealizowane', { outcome, outcomeNote: note });

  // Historia kontaktów (kanał telefon)
  const today = todayISO();
  const clientRef = db.collection('clients').doc(f.clientId);
  try {
    await clientRef.collection('interactions').add({
      contactDate: today,
      channel: 'telefon',
      notes: campaignName
        ? `Telefon po kampanii ${campaignName}: ${CALL_OUTCOME_LABEL[outcome]}`
        : `Telefon: ${CALL_OUTCOME_LABEL[outcome]}`,
      tradeNotes: note,
      ...(f.campaignId ? { campaignId: f.campaignId } : {}),
      createdBy: userEmail,
      createdAt: new Date().toISOString(),
    });
    await recomputeLastContact(clientRef);
  } catch (histErr) {
    console.error(`[campaignFollowups] historia klienta ${f.clientId} nie zapisana:`, histErr);
  }

  // Kolejny telefon
  let next: { id: string } | null = null;
  const nextDueDate = NEEDS_NEXT_CALL.includes(outcome) ? addWorkingDays(today, FOLLOWUP_WORKING_DAYS) : null;
  if (nextDueDate) {
    next = await createFollowUp({
      clientId: f.clientId,
      clientName: f.clientName,
      dueDate: nextDueDate,
      reminderText: f.reminderText,
      ...(f.campaignId ? { campaignId: f.campaignId } : {}),
    });
  }

  // Wynik u odbiorcy kampanii
  if (f.campaignId) {
    const cRef = db.collection('campaigns').doc(f.campaignId);
    await db.runTransaction(async tx => {
      const s = await tx.get(cRef);
      if (!s.exists) return;
      const c = s.data() as CampaignLike;
      const recipients = (c.recipients ?? []).map(r => r.clientId !== f.clientId ? r : {
        ...r,
        callOutcome: outcome,
        callNote: note,
        calledAt: new Date().toISOString(),
        followupId: next ? next.id : r.followupId ?? followupId,
      });
      tx.update(cRef, { recipients, results: withResults(c.results, recipients) });
    });
  }

  return { nextFollowupId: next?.id ?? null, nextDueDate };
};
