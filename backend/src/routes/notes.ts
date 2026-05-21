import { Router } from 'express';
import { db } from '../services/firebase';
import { verifyToken, AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const router = Router();
const COLLECTION = 'notes';

router.use(verifyToken);

// ==========================================
// SCHEMAT WALIDACJI ZOD
// ==========================================
const AttachmentSchema = z.object({
  name: z.string(),
  url: z.string().url('Niepoprawny format URL pliku'),
  type: z.string(),
});

const NoteSchema = z.object({
  title: z.string().min(1, 'Temat notatki jest wymagany').max(200),
  content: z.string().default(''), // HTML z edytora tekstu (np. TipTap)
  attachments: z.array(AttachmentSchema).optional().default([]),
  color: z.enum(['blue', 'yellow', 'red', 'green', 'default']).default('default'),
  isImportant: z.boolean().default(false), // Gwiazdka
  isUrgent: z.boolean().default(false),    // Dynamit
});

// ==========================================
// REST API CRUD DLA NOTATEK
// ==========================================

// Pobierz wszystkie notatki
router.get('/', async (_req, res) => {
  try {
    // Pobieramy całą kolekcję; sortowanie kaskadowe wykonamy na froncie dla wydajności,
    // lub wyciągamy domyślnie po dacie utworzenia.
    const snapshot = await db.collection(COLLECTION).orderBy('createdAt', 'desc').get();
    const notes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(notes);
  } catch (error) {
    console.error('[notes] GET / błąd Firestore:', error);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania notatek' });
  }
});

// Dodaj nową notatkę
router.post('/', async (req: AuthRequest, res) => {
  try {
    const parsed = NoteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

    const now = new Date().toISOString();
    const todayDate = now.split('T')[0]; // Format YYYY-MM-DD z automatu

    const newNote = {
      ...parsed.data,
      createdAt: todayDate,
      updatedAt: now,
      createdBy: req.user?.email || 'Nieznany',
    };

    const docRef = await db.collection(COLLECTION).add(newNote);
    res.status(201).json({ id: docRef.id, ...newNote });
  } catch (error) {
    console.error('[notes] POST / błąd:', error);
    res.status(500).json({ error: 'Nie udało się dodać notatki' });
  }
});

// Edytuj istniejącą notatkę
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const parsed = NoteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

    const updateData = {
      ...parsed.data,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user?.email || 'Nieznany',
    };

    await db.collection(COLLECTION).doc(id).update(updateData);
    res.json({ id, ...updateData });
  } catch (error) {
    console.error('[notes] PUT / błąd:', error);
    res.status(500).json({ error: 'Nie udało się zaktualizować notatki' });
  }
});

// Usuń notatkę
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection(COLLECTION).doc(id).delete();
    res.json({ message: 'Notatka usunięta pomyślnie' });
  } catch (error) {
    console.error('[notes] DELETE / błąd:', error);
    res.status(500).json({ error: 'Błąd serwera podczas usuwania notatki' });
  }
});

export default router;