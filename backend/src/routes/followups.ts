import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../services/firebase';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { createFollowUp, setFollowUpStatus } from '../services/followupService';
import { recordCallOutcome } from '../services/campaignFollowups';
import { todayISO } from '../utils/date';

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
    const today = todayISO();
    const snapshot = await db
      .collection(COLLECTION)
      .where('status', '==', 'zaplanowane')
      .where('dueDate', '<=', today)
      .orderBy('dueDate', 'asc')
      .get();

    const followups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(followups);
  } catch (err) {
    console.error('[followups] GET /summary błąd:', err);
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
    const created = await createFollowUp({ ...parsed.data, clientId });
    res.status(201).json(created);
  } catch (err) {
    console.error('[followups] POST /client/:clientId błąd:', err);
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
    const updateData = await setFollowUpStatus(id, parsed.data.status);
    res.status(200).json({ id, ...updateData });
  } catch (err) {
    console.error('[followups] PATCH /:id/status błąd:', err);
    res.status(500).json({ error: 'Błąd zmiany statusu zadania' });
  }
});

// POST /api/followups/:id/outcome — szybki wynik telefonu (kampanie): zamyka zadanie,
// wpis w historii, wynik w kampanii; „oddzwonić” / „nie odebrał” → kolejny telefon.
const OutcomeSchema = z.object({
  outcome: z.enum(['ordered', 'callback', 'not_now', 'no_answer']),
  note: z.string().max(2000).default(''),
});

router.post('/:id/outcome', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = OutcomeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Nieprawidłowy wynik rozmowy' });
    return;
  }
  try {
    const result = await recordCallOutcome(req.params.id, parsed.data.outcome, parsed.data.note.trim(), req.user?.email || 'system');
    res.json(result);
  } catch (err) {
    console.error('[followups] POST /:id/outcome błąd:', err);
    res.status(400).json({ error: (err as Error).message || 'Błąd zapisu wyniku rozmowy' });
  }
});

export default router;
