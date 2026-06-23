import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../services/firebase';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { createEvent, deleteEvent } from '../services/calendar';

const router = Router();
router.use(authenticate);

const COLLECTION = 'followups';

const FollowUpSchema = z.object({
  clientName: z.string().min(1),
  dueDate: z.string().min(1),
  reminderText: z.string().min(1),
});

// Pobierz zadania na dziś i zaległe (status: zaplanowane)
router.get('/summary', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const snapshot = await db
      .collection(COLLECTION)
      .where('status', '==', 'zaplanowane')
      .where('dueDate', '<=', today)
      .orderBy('dueDate', 'asc')
      .get();

    const followups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(followups);
  } catch (err) {
    res.status(500).json({ error: 'Błąd pobierania zadań' });
  }
});

// Pobierz follow-upy z przedziału dat (widok kalendarza) — wszystkie statusy
// UWAGA: zapytanie zakresowe + orderBy może wymusić composite index w Firestore
// (runtime error zwróci link do utworzenia indeksu).
router.get('/range', async (req: AuthenticatedRequest, res: Response) => {
  const { from, to } = req.query;
  if (typeof from !== 'string' || typeof to !== 'string') {
    res.status(400).json({ error: 'Wymagane parametry from i to (YYYY-MM-DD)' });
    return;
  }
  try {
    const snapshot = await db
      .collection(COLLECTION)
      .where('dueDate', '>=', from)
      .where('dueDate', '<=', to)
      .orderBy('dueDate', 'asc')
      .get();

    const followups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(followups);
  } catch (err) {
    console.error('[followups] GET /range błąd:', err);
    res.status(500).json({ error: 'Błąd pobierania zadań z kalendarza' });
  }
});

// Utwórz follow-up dla klienta
router.post('/client/:clientId', async (req: AuthenticatedRequest, res: Response) => {
  const { clientId } = req.params;
  const parsed = FollowUpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const now = new Date().toISOString();
    const data: Record<string, unknown> = {
      ...parsed.data,
      clientId,
      status: 'zaplanowane',
      createdAt: now,
    };
    const docRef = await db.collection(COLLECTION).add(data);

    // Sync z Google Calendar — NIE może blokować zapisu follow-upa (try/catch).
    try {
      const eventId = await createEvent({
        summary: `📞 ${parsed.data.clientName}`,
        description: parsed.data.reminderText,
        date: parsed.data.dueDate,
      });
      await docRef.update({ googleEventId: eventId, syncedAt: new Date().toISOString() });
      data.googleEventId = eventId;
      data.syncedAt = new Date().toISOString();
    } catch (syncErr) {
      const msg = (syncErr as Error).message;
      console.error('[followups] sync Google Calendar nieudany:', msg);
      await docRef.update({ syncError: msg }).catch(() => undefined);
      data.syncError = msg;
    }

    res.status(201).json({ id: docRef.id, ...data });
  } catch (err) {
    res.status(500).json({ error: 'Błąd dodawania przypomnienia' });
  }
});

// Zmień status follow-up
router.patch('/:id/status', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const StatusSchema = z.object({
    status: z.enum(['zrealizowane', 'przesunięte']),
  });
  const parsed = StatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Nieprawidłowy status' });
    return;
  }
  try {
    const docRef = db.collection(COLLECTION).doc(id);
    const snap = await docRef.get();
    const existing = snap.data() as { googleEventId?: string } | undefined;

    const updateData: Record<string, string> = {
      status: parsed.data.status,
      updatedAt: new Date().toISOString(),
    };
    if (parsed.data.status === 'zrealizowane') {
      updateData.completedAt = new Date().toISOString();
    }
    await docRef.update(updateData);

    // Zrealizowane → usuń wydarzenie z kalendarza (już nie potrzeba przypomnienia).
    if (parsed.data.status === 'zrealizowane' && existing?.googleEventId) {
      try {
        await deleteEvent(existing.googleEventId);
      } catch (syncErr) {
        console.error('[followups] usuwanie wydarzenia Google nieudane:', (syncErr as Error).message);
      }
    }

    res.status(200).json({ id, ...updateData });
  } catch (err) {
    res.status(500).json({ error: 'Błąd zmiany statusu zadania' });
  }
});

export default router;
