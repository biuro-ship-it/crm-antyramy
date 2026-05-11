import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../services/firebase';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticate);

const COLLECTION = 'clients';

const AddressSchema = z.object({
  province: z.string().min(1),
  zipCode: z.string().min(1),
  city: z.string().min(1),
  street: z.string().min(1),
  number: z.string().min(1),
});

const ClientSchema = z.object({
  companyName: z.string().min(1, 'Nazwa firmy jest wymagana'),
  type: z.enum(['hurt', 'sklep']),
  contactPerson: z.string().min(1, 'Osoba kontaktowa jest wymagana'),
  email: z.string().email('Nieprawidłowy adres e-mail'),
  phone: z.string().min(1, 'Telefon jest wymagany'),
  address: AddressSchema,
});

const InteractionSchema = z.object({
  contactDate: z.string().min(1),
  channel: z.enum(['telefon', 'mail', 'spotkanie', 'inne']),
  notes: z.string().min(1, 'Notatka jest wymagana'),
  tradeNotes: z.string().optional(),
  products: z.array(z.string()).optional(),
});

// --- KLIENCI ---

router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const snapshot = await db.collection(COLLECTION).orderBy('createdAt', 'desc').get();
    const clients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: 'Błąd pobierania klientów' });
  }
});

router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = ClientSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const now = new Date().toISOString();
    const data = {
      ...parsed.data,
      lastContactAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const docRef = await db.collection(COLLECTION).add(data);
    res.status(201).json({ id: docRef.id, ...data });
  } catch (err) {
    res.status(500).json({ error: 'Błąd zapisu klienta' });
  }
});

router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const parsed = ClientSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const updateData = { ...parsed.data, updatedAt: new Date().toISOString() };
    await db.collection(COLLECTION).doc(id).update(updateData);
    const updated = await db.collection(COLLECTION).doc(id).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (err) {
    res.status(500).json({ error: 'Błąd aktualizacji klienta' });
  }
});

router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    await db.collection(COLLECTION).doc(id).delete();
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Błąd usuwania klienta' });
  }
});

// --- INTERAKCJE ---

router.get('/:id/interactions', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const snapshot = await db
      .collection(COLLECTION)
      .doc(id)
      .collection('interactions')
      .orderBy('contactDate', 'desc')
      .get();
    const interactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(interactions);
  } catch (err) {
    res.status(500).json({ error: 'Błąd pobierania historii kontaktów' });
  }
});

router.post('/:id/interactions', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const parsed = InteractionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const now = new Date().toISOString();
    const data = {
      ...parsed.data,
      createdBy: req.user?.email || 'Nieznany',
      createdAt: now,
    };
    const docRef = await db.collection(COLLECTION).doc(id).collection('interactions').add(data);

    // aktualizuj datę ostatniego kontaktu
    await db.collection(COLLECTION).doc(id).update({
      lastContactAt: parsed.data.contactDate,
      updatedAt: now,
    });

    res.status(201).json({ id: docRef.id, ...data });
  } catch (err) {
    res.status(500).json({ error: 'Błąd zapisu kontaktu' });
  }
});

router.put('/:id/interactions/:interactionId', async (req: AuthenticatedRequest, res: Response) => {
  const { id, interactionId } = req.params;
  const parsed = InteractionSchema.safeParse(req.body);
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
    const ref = db.collection(COLLECTION).doc(id).collection('interactions').doc(interactionId);
    await ref.update(updateData);
    const updated = await ref.get();
    res.json({ id: interactionId, ...updated.data() });
  } catch (err) {
    res.status(500).json({ error: 'Błąd aktualizacji notatki' });
  }
});

export default router;
