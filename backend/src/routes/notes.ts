import { Router, Response } from 'express';
import { db } from '../services/firebase';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const COLLECTION = 'notes';

const AttachmentSchema = z.object({
  name: z.string(),
  url: z.string().url('Niepoprawny format URL pliku'),
  type: z.string(),
});

const NoteSchema = z.object({
  title: z.string().min(1, 'Temat notatki jest wymagany').max(200),
  content: z.string().default(''),
  attachments: z.array(AttachmentSchema).optional().default([]),
  color: z.enum(['blue', 'yellow', 'red', 'green', 'default']).default('default'),
  isImportant: z.boolean().default(false),
  isUrgent: z.boolean().default(false),
});

// GET /api/notes — pobierz wszystkie notatki
router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const snapshot = await db.collection(COLLECTION).orderBy('createdAt', 'desc').get();
    const notes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(notes);
  } catch (error) {
    console.error('[notes] GET błąd:', error);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania notatek' });
  }
});

// POST /api/notes — dodaj nową notatkę
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = NoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const now = new Date().toISOString();
    const todayDate = now.split('T')[0];
    const newNote = {
      ...parsed.data,
      createdAt: todayDate,
      updatedAt: now,
      createdBy: req.user?.email || 'Nieznany',
    };
    const docRef = await db.collection(COLLECTION).add(newNote);
    res.status(201).json({ id: docRef.id, ...newNote });
  } catch (error) {
    console.error('[notes] POST błąd:', error);
    res.status(500).json({ error: 'Nie udało się dodać notatki' });
  }
});

// PUT /api/notes/:id — edytuj notatkę
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const parsed = NoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const updateData = {
      ...parsed.data,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user?.email || 'Nieznany',
    };
    await db.collection(COLLECTION).doc(id).update(updateData);
    res.json({ id, ...updateData });
  } catch (error) {
    console.error('[notes] PUT błąd:', error);
    res.status(500).json({ error: 'Nie udało się zaktualizować notatki' });
  }
});

// DELETE /api/notes/:id — usuń notatkę
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    await db.collection(COLLECTION).doc(id).delete();
    res.json({ message: 'Notatka usunięta' });
  } catch (error) {
    console.error('[notes] DELETE błąd:', error);
    res.status(500).json({ error: 'Błąd serwera podczas usuwania notatki' });
  }
});

export default router;
