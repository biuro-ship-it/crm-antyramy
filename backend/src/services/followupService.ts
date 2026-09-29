// Follow-upy (zadania „zadzwoń”) — wspólne dla trasy /api/followups i kampanii.
// Synchronizacja z Google Calendar jak dotąd: błąd kalendarza nie blokuje zapisu.
import { db } from './firebase';
import { createEvent, deleteEvent } from './calendar';

const COLLECTION = 'followups';

export interface FollowUpInput {
  clientId: string;
  clientName: string;
  dueDate: string;        // YYYY-MM-DD
  reminderText: string;
  campaignId?: string;
}

export const createFollowUp = async (input: FollowUpInput): Promise<Record<string, unknown> & { id: string }> => {
  const data: Record<string, unknown> = {
    clientId: input.clientId,
    clientName: input.clientName,
    dueDate: input.dueDate,
    reminderText: input.reminderText,
    ...(input.campaignId ? { campaignId: input.campaignId } : {}),
    status: 'zaplanowane',
    createdAt: new Date().toISOString(),
  };
  const docRef = await db.collection(COLLECTION).add(data);

  try {
    const eventId = await createEvent({
      summary: `📞 ${input.clientName}`,
      description: input.reminderText,
      date: input.dueDate,
    });
    const syncedAt = new Date().toISOString();
    await docRef.update({ googleEventId: eventId, syncedAt });
    data.googleEventId = eventId;
    data.syncedAt = syncedAt;
  } catch (syncErr) {
    const msg = (syncErr as Error).message;
    console.error('[followups] sync Google Calendar nieudany:', msg);
    await docRef.update({ syncError: msg }).catch(() => undefined);
    data.syncError = msg;
  }

  return { id: docRef.id, ...data };
};

/** Zmiana statusu; „zrealizowane” usuwa wydarzenie z Google Calendar. */
export const setFollowUpStatus = async (
  id: string,
  status: 'zrealizowane' | 'przesunięte',
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> => {
  const docRef = db.collection(COLLECTION).doc(id);
  const snap = await docRef.get();
  const existing = snap.data() as { googleEventId?: string } | undefined;

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { status, updatedAt: now, ...extra };
  if (status === 'zrealizowane') updateData.completedAt = now;
  await docRef.update(updateData);

  if (status === 'zrealizowane' && existing?.googleEventId) {
    try {
      await deleteEvent(existing.googleEventId);
    } catch (syncErr) {
      console.error('[followups] usuwanie wydarzenia Google nieudane:', (syncErr as Error).message);
    }
  }
  return updateData;
};
