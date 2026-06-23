import { Router, Response } from 'express';
import { db } from '../services/firebase';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const COLLECTION = 'kanbanTasks';

const TaskSchema = z.object({
  title: z.string().min(1, 'Tytuł zadania jest wymagany').max(200),
  description: z.string().optional().default(''),
  column: z.enum(['todo', 'doing', 'done']).default('todo'),
  order: z.number().optional().default(0),
  clientId: z.string().optional(),
  clientName: z.string().optional(),
  color: z.enum(['default', 'blue', 'yellow', 'red', 'green']).optional().default('default'),
  dueDate: z.string().optional(),
});

const MoveSchema = z.object({
  column: z.enum(['todo', 'doing', 'done']),
  order: z.number(),
});

// GET /api/kanban — wszystkie karty (front grupuje po kolumnie)
router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const snapshot = await db.collection(COLLECTION).orderBy('order', 'asc').get();
    const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(tasks);
  } catch (error) {
    console.error('[kanban] GET błąd:', error);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania zadań' });
  }
});

// POST /api/kanban — nowa karta
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = TaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const now = new Date().toISOString();
    const newTask = {
      ...parsed.data,
      // Nowa karta trafia na koniec kolumny — monotonicznie rosnący order
      // (front nie podaje order przy tworzeniu; .default(0) dawałby kolizje).
      order: Date.now(),
      createdAt: now,
      updatedAt: now,
      createdBy: req.user?.email || 'Nieznany',
    };
    const docRef = await db.collection(COLLECTION).add(newTask);
    res.status(201).json({ id: docRef.id, ...newTask });
  } catch (error) {
    console.error('[kanban] POST błąd:', error);
    res.status(500).json({ error: 'Nie udało się dodać zadania' });
  }
});

// PUT /api/kanban/:id — edycja treści karty
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const parsed = TaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const updateData = {
      ...parsed.data,
      updatedAt: new Date().toISOString(),
    };
    await db.collection(COLLECTION).doc(id).update(updateData);
    res.json({ id, ...updateData });
  } catch (error) {
    console.error('[kanban] PUT błąd:', error);
    res.status(500).json({ error: 'Nie udało się zaktualizować zadania' });
  }
});

// PATCH /api/kanban/:id/move — przeniesienie karty (kolumna + pozycja)
router.patch('/:id/move', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const parsed = MoveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Nieprawidłowe dane przeniesienia' });
    return;
  }
  try {
    const updateData = {
      column: parsed.data.column,
      order: parsed.data.order,
      updatedAt: new Date().toISOString(),
    };
    await db.collection(COLLECTION).doc(id).update(updateData);
    res.json({ id, ...updateData });
  } catch (error) {
    console.error('[kanban] PATCH move błąd:', error);
    res.status(500).json({ error: 'Nie udało się przenieść zadania' });
  }
});

// DELETE /api/kanban/:id — usuń kartę
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    await db.collection(COLLECTION).doc(id).delete();
    res.json({ message: 'Zadanie usunięte' });
  } catch (error) {
    console.error('[kanban] DELETE błąd:', error);
    res.status(500).json({ error: 'Błąd serwera podczas usuwania zadania' });
  }
});

export default router;
