import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../services/firebase';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

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
    const data = {
      ...parsed.data,
      clientId,
      status: 'zaplanowane',
      createdAt: now,
    };
    const docRef = await db.collection(COLLECTION).add(data);
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
    const updateData: Record<string, string> = {
      status: parsed.data.status,
      updatedAt: new Date().toISOString(),
    };
    if (parsed.data.status === 'zrealizowane') {
      updateData.completedAt = new Date().toISOString();
    }
    await db.collection(COLLECTION).doc(id).update(updateData);
    res.status(200).json({ id, ...updateData });
  } catch (err) {
    res.status(500).json({ error: 'Błąd zmiany statusu zadania' });
  }
});

export default router;
