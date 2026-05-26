import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../services/firebase';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticate);

const COLLECTION = 'suppliers';

const FileSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  size: z.string().optional(),
  uploadedAt: z.string(),
});

const SupplierSchema = z.object({
  companyName: z.string().min(1, 'Nazwa firmy jest wymagana'),
  category: z.string().default('Inne'),
  email: z.string().default(''),
  phoneCompany: z.string().default(''),
  phoneSales: z.string().default(''),
  phoneOwner: z.string().default(''),
  whatsapp: z.string().default(''),
  messenger: z.string().default(''),
  notes: z.string().default(''),
  relationshipColor: z.string().default('default'),
  files: z.array(FileSchema).default([]),
  address: z.object({
    street: z.string().default(''),
    zipCode: z.string().default(''),
    city: z.string().default('')
  }).default({}),
  contactNames: z.object({
    company: z.string().default(''),
    sales: z.string().default(''),
    owner: z.string().default('')
  }).default({}),
  agreements: z.object({
    discount: z.string().default(''),
    paymentTerm: z.string().default(''),
    deliveryFreq: z.string().default('')
  }).default({})
});

const InteractionSchema = z.object({
  contactDate: z.string().min(1),
  channel: z.enum(['telefon', 'mail', 'spotkanie', 'inne']),
  notes: z.string().min(1, 'Notatka jest wymagana'),
  tradeNotes: z.string().optional(),
});

// --- DOSTAWCY ---

router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const snapshot = await db.collection(COLLECTION).orderBy('createdAt', 'desc').get();
    const suppliers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(suppliers);
  } catch (err) {
    res.status(500).json({ error: 'Błąd pobierania dostawców' });
  }
});

router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = SupplierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  
  try {
    const now = new Date().toISOString();
    const data = { ...parsed.data, lastContactAt: null, createdAt: now, updatedAt: now };
    const docRef = await db.collection(COLLECTION).add(data);
    res.status(201).json({ id: docRef.id, ...data });
  } catch (err) {
    res.status(500).json({ error: 'Błąd zapisu dostawcy' });
  }
});

router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const parsed = SupplierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  
  try {
    const updateData = { ...parsed.data, updatedAt: new Date().toISOString() };
    await db.collection(COLLECTION).doc(id).update(updateData);
    const updated = await db.collection(COLLECTION).doc(id).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (err) {
    res.status(500).json({ error: 'Błąd aktualizacji dostawcy' });
  }
});

router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await db.collection(COLLECTION).doc(req.params.id).delete();
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Błąd usuwania dostawcy' });
  }
});

// --- HISTORIA KONTAKTÓW Z DOSTAWCĄ ---

router.get('/:id/interactions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snapshot = await db.collection(COLLECTION).doc(req.params.id).collection('interactions').orderBy('contactDate', 'desc').get();
    res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  } catch (err) {
    res.status(500).json({ error: 'Błąd pobierania historii' });
  }
});

router.post('/:id/interactions', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = InteractionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  
  try {
    const now = new Date().toISOString();
    const data = { ...parsed.data, createdBy: req.user?.email || 'Nieznany', createdAt: now };
    const docRef = await db.collection(COLLECTION).doc(req.params.id).collection('interactions').add(data);
    await db.collection(COLLECTION).doc(req.params.id).update({ lastContactAt: parsed.data.contactDate, updatedAt: now });
    res.status(201).json({ id: docRef.id, ...data });
  } catch (err) {
    res.status(500).json({ error: 'Błąd dodawania notatki' });
  }
});

export default router;