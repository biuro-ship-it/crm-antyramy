import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../services/firebase';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { recomputeLastContact } from '../utils/date';
import { isNotFound } from '../utils/firestore';
import * as crypto from 'crypto';
import { sendEmail, GMAIL_TOKEN_ERROR } from '../services/gmail';
import { generateSupplierOrderPdf } from '../services/pdf';
import { saveUploadFile, deleteUploadFile } from '../services/uploadStore';
import {
  ORDER_UNITS, buildOrderItems, buildOrderEntry, orderInteraction, orderPdfLayout,
  orderPdfFilename, orderPdfFilenameFromUrl, orderBodyToHtml,
} from '../services/supplierOrders';

const router = Router();
router.use(authenticate);

const COLLECTION = 'suppliers';
const ORDERS = 'orders';

const FileSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  size: z.string().optional(),
  uploadedAt: z.string(),
});

const MaterialSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  unit: z.enum(['szt', 'm²', 'ark.', 'kpl']).default('szt'),
  price: z.number().nonnegative().default(0),
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
  materials: z.array(MaterialSchema).default([]),
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
    console.error('[suppliers] GET / błąd:', err);
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
    console.error('[suppliers] POST / błąd:', err);
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
    if (isNotFound(err)) {
      res.status(404).json({ error: 'Dostawca nie istnieje' });
      return;
    }
    console.error('[suppliers] PUT /:id błąd:', err);
    res.status(500).json({ error: 'Błąd aktualizacji dostawcy' });
  }
});

router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    // Firestore nie usuwa subkolekcji automatycznie — bez tego historia kontaktów
    // usuniętego dostawcy zostawała w bazie na zawsze (tak jak w clients.ts).
    const interactionsSnap = await db
      .collection(COLLECTION).doc(id).collection('interactions').get();

    if (!interactionsSnap.empty) {
      const batch = db.batch();
      interactionsSnap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    // Historia zamówień znika razem z dostawcą — razem z PDF-ami z uploads.
    const ordersSnap = await db.collection(COLLECTION).doc(id).collection(ORDERS).get();
    for (const doc of ordersSnap.docs) {
      const filename = orderPdfFilenameFromUrl(doc.data().pdfUrl);
      if (filename) {
        await deleteUploadFile(filename).catch(err =>
          console.error(`[suppliers] nie usunięto PDF zamówienia ${filename}:`, err));
      }
    }
    if (!ordersSnap.empty) {
      const batch = db.batch();
      ordersSnap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    await db.collection(COLLECTION).doc(id).delete();
    res.status(204).send();
  } catch (err) {
    console.error('[suppliers] DELETE /:id błąd:', err);
    res.status(500).json({ error: 'Błąd usuwania dostawcy' });
  }
});

// --- HISTORIA KONTAKTÓW Z DOSTAWCĄ ---

router.get('/:id/interactions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snapshot = await db.collection(COLLECTION).doc(req.params.id).collection('interactions').orderBy('contactDate', 'desc').get();
    res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  } catch (err) {
    console.error('[suppliers] GET /:id/interactions błąd:', err);
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
    // Data ostatniego kontaktu = najpóźniejsza notatka, nie po prostu ta dopisana.
    await recomputeLastContact(db.collection(COLLECTION).doc(req.params.id));
    res.status(201).json({ id: docRef.id, ...data });
  } catch (err) {
    console.error('[suppliers] POST /:id/interactions błąd:', err);
    res.status(500).json({ error: 'Błąd dodawania notatki' });
  }
});

router.put('/:id/interactions/:interactionId', async (req: AuthenticatedRequest, res: Response) => {
  const { id, interactionId } = req.params;
  const parsed = InteractionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  try {
    const updateData = {
      ...parsed.data,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user?.email || 'Nieznany',
    };
    const ref = db.collection(COLLECTION).doc(id).collection('interactions').doc(interactionId);
    await ref.update(updateData);
    // Zmiana daty notatki musi przeliczyć „ostatni kontakt" na karcie dostawcy.
    await recomputeLastContact(db.collection(COLLECTION).doc(id));
    const updated = await ref.get();
    res.json({ id: interactionId, ...updated.data() });
  } catch (err) {
    console.error('[suppliers] PUT /:id/interactions/:interactionId błąd:', err);
    res.status(500).json({ error: 'Błąd aktualizacji notatki' });
  }
});

// --- HISTORIA ZAMÓWIEŃ (SPEC.md, „Zamówienia do dostawców”) ---
// Wpis powstaje tylko po udanej wysyłce i potem się go nie zmienia — dlatego nie ma tu PUT ani DELETE.

const OrderSendSchema = z.object({
  subject: z.string().trim().min(1, 'Temat jest wymagany').max(300),
  body: z.string().trim().min(1, 'Treść maila jest wymagana').max(20000),
  notes: z.string().max(5000).optional(),
  items: z.array(z.object({
    materialId: z.string().max(100).optional(),
    name: z.string().trim().min(1).max(300),
    quantity: z.number().positive().max(1_000_000),
    unit: z.enum(ORDER_UNITS),
  })).min(1, 'Zamówienie musi mieć co najmniej jedną pozycję').max(200),
});

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

router.get('/:id/orders', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snapshot = await db.collection(COLLECTION).doc(req.params.id).collection(ORDERS).orderBy('sentAt', 'desc').get();
    res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  } catch (err) {
    console.error('[suppliers] GET /:id/orders błąd:', err);
    res.status(500).json({ error: 'Błąd pobierania historii zamówień' });
  }
});

// POST /:id/orders — wysyła zamówienie (po kliknięciu „Wyślij” w podglądzie) i zapisuje je w historii.
router.post('/:id/orders', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = OrderSendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  const { id } = req.params;

  let supplier: FirebaseFirestore.DocumentData | undefined;
  try {
    const snap = await db.collection(COLLECTION).doc(id).get();
    if (!snap.exists) return res.status(404).json({ error: 'Dostawca nie istnieje' });
    supplier = snap.data();
  } catch (err) {
    console.error('[suppliers] POST /:id/orders — odczyt dostawcy:', err);
    return res.status(500).json({ error: 'Błąd odczytu dostawcy' });
  }

  // Adresat zawsze z karty dostawcy w bazie, nie z formularza
  const to = String(supplier?.email ?? '').trim();
  if (!EMAIL_RE.test(to)) return res.status(400).json({ error: 'Ten dostawca nie ma poprawnego adresu e-mail' });

  const items = buildOrderItems(parsed.data.items, Array.isArray(supplier?.materials) ? supplier.materials : []);
  if (items.length === 0) return res.status(400).json({ error: 'Zamówienie musi mieć co najmniej jedną pozycję' });

  const now = new Date();
  const notes = parsed.data.notes ?? '';
  const pdfFilename = orderPdfFilename(now, crypto.randomBytes(12).toString('hex'));
  let pdf: Buffer;
  try {
    pdf = await generateSupplierOrderPdf(orderPdfLayout({
      supplier: { companyName: String(supplier?.companyName ?? ''), email: to, address: supplier?.address },
      items, notes, date: now,
    }));
    await saveUploadFile(pdfFilename, pdf);
  } catch (err) {
    console.error('[suppliers] POST /:id/orders — PDF:', err);
    return res.status(500).json({ error: 'Nie udało się przygotować PDF zamówienia — nic nie zostało wysłane' });
  }

  let gmail: { id: string | null; threadId: string | null };
  try {
    gmail = await sendEmail({
      to,
      subject: parsed.data.subject,
      htmlBody: orderBodyToHtml(parsed.data.body),
      pdfBuffer: pdf,
      pdfFilename: `Zamowienie-${now.toISOString().slice(0, 10)}.pdf`,
    });
  } catch (err) {
    // Mail nie wyszedł — nic nie zapisujemy, PDF sprzątamy
    await deleteUploadFile(pdfFilename).catch(() => undefined);
    const msg = (err as Error).message;
    console.error('[suppliers] POST /:id/orders — wysyłka:', msg);
    return res.status(502).json({
      error: msg === GMAIL_TOKEN_ERROR ? msg : `Nie udało się wysłać zamówienia (${msg}) — nic nie zostało zapisane`,
    });
  }

  const entry = buildOrderEntry({
    sentAt: now, to, subject: parsed.data.subject, body: parsed.data.body, items, notes,
    sentBy: req.user?.email, gmail,
    pdfUrl: `${req.protocol}://${req.get('host')}/uploads/${pdfFilename}`, pdfFilename,
  });

  const supplierRef = db.collection(COLLECTION).doc(id);
  let orderId: string;
  try {
    orderId = (await supplierRef.collection(ORDERS).add(entry)).id;
  } catch (err) {
    // Mail już wyszedł — pełny wpis w logu, żeby dało się go odtworzyć
    console.error('[suppliers] POST /:id/orders — zamówienie WYSŁANE, zapis historii nieudany:', JSON.stringify({ supplierId: id, entry }), err);
    return res.status(500).json({
      error: 'Zamówienie zostało WYSŁANE, ale nie zapisało się w historii. Nie wysyłaj go ponownie — szczegóły są w logu serwera.',
    });
  }

  // Krótki wpis w historii kontaktów — jego błąd nie cofa zamówienia
  let interaction: Record<string, unknown> | null = null;
  try {
    const data = { ...orderInteraction(entry), orderId, createdBy: entry.sentBy, createdAt: entry.sentAt };
    const ref = await supplierRef.collection('interactions').add(data);
    await recomputeLastContact(supplierRef);
    interaction = { id: ref.id, ...data };
  } catch (err) {
    console.error(`[suppliers] POST /:id/orders — wpis w historii kontaktów (zamówienie ${orderId}):`, err);
  }

  res.status(201).json({ order: { id: orderId, ...entry }, interaction });
});

export default router;