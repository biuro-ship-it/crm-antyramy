import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../services/firebase';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticate);

const COLLECTION = 'clients';

const AddressSchema = z.object({
  province: z.string().default(''),
  zipCode: z.string().default(''),
  city: z.string().default(''),
  street: z.string().default(''),
  number: z.string().default(''),
});

const OrderSchema = z.object({
  id: z.string(),
  amount: z.number().nonnegative().default(0),
  date: z.string().min(1), // YYYY-MM-DD
  note: z.string().optional().default(''),
});

const ClientSchema = z.object({
  companyName: z.string().min(1, 'Nazwa firmy jest wymagana'),
  type: z.enum(['zakład', 'sklep', 'agencja', 'inne']),
  nip: z.string().default(''),
  contactPerson: z.string().default(''),
  email: z.string().optional().default(''),
  phone: z.string().default(''),
  address: AddressSchema,
  relationshipColor: z.string().optional().default('default'),
  route: z.string().optional().default(''),
  // UWAGA: bez .default() PUT klienta wykasowałby te pola (parsed.data je wycina)
  salesEnabled: z.boolean().optional().default(false),
  orders: z.array(OrderSchema).optional().default([]),
  // Dane z Białej listy VAT (Ministerstwo Finansów) — pobierane po NIP
  vatStatus: z.string().optional().default(''),
  regon: z.string().optional().default(''),
  bankAccount: z.string().optional().default(''),
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
    // Firestore nie usuwa subkolekcji automatycznie — batch delete interakcji
    const interactionsSnap = await db
      .collection(COLLECTION).doc(id).collection('interactions').get();

    if (!interactionsSnap.empty) {
      const batch = db.batch();
      interactionsSnap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

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