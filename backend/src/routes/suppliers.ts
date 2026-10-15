import { Router, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../services/firebase';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { recomputeLastContact } from '../utils/date';
import { isNotFound } from '../utils/firestore';
import * as crypto from 'crypto';
import { sendEmail, GMAIL_TOKEN_ERROR } from '../services/gmail';
import { generateSupplierOrderPdf } from '../services/pdf';
import { saveUploadFile, deleteUploadFile, isUserUploadFilename } from '../services/uploadStore';
import {
  ORDER_UNITS, OrderItem, SupplierOrderEntry, buildOrderItems, buildOrderEntry, buildManualOrderEntry, orderInteraction,
  orderPdfLayout, orderPdfFilename, orderPdfLocationFromUrl, orderBodyToHtml, sentDateError, pdfDateFrom,
  orderAttachmentName, isValidRecipient,
} from '../services/supplierOrders';
import { isAdmin } from '../services/admins';
import { uploadFilenameOf } from '../services/collageFiles';
import {
  MaterialImage, SUPPLIER_IMAGE_MAX_BYTES, SUPPLIER_IMAGE_SUBDIR, checkUploadedImage, supplierImageFilenames,
  imageFilesOf, validateImageLink, buildUploadedImage, buildLinkImage, mergeMaterialImages, replaceMaterialImage,
} from '../services/supplierImages';

const router = Router();
router.use(authenticate);

const COLLECTION = 'suppliers';
const ORDERS = 'orders';
const ORDER_LOCKS = 'orderLocks'; // znaczniki wysyłki (requestId) — ten sam podgląd nie wyśle maila dwa razy
const ORDERS_DIR = 'orders';      // kopie PDF zamówień: uploads/orders/

// Kasuje dokumenty porcjami — batch Firestore przyjmuje najwyżej 500 operacji.
const deleteDocs = async (docs: FirebaseFirestore.QueryDocumentSnapshot[]): Promise<void> => {
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
};

const deleteOrderPdf = async (pdfUrl: unknown): Promise<void> => {
  const loc = orderPdfLocationFromUrl(typeof pdfUrl === 'string' ? pdfUrl : null);
  if (!loc) return;
  await deleteUploadFile(loc.filename, loc.subdir).catch(err =>
    console.error(`[suppliers] nie usunięto PDF zamówienia ${loc.filename}:`, err));
};

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
  // Samo .optional() i bez walidacji: serwer i tak ignoruje to pole i bierze zdjęcie z bazy
  // (mergeMaterialImages) — zmieniają je tylko trasy …/materials/:materialId/image niżej.
  // Walidacja tutaj blokowałaby zapis dostawcy, gdyby zapisane zdjęcie jej nie spełniało.
  image: z.unknown().optional(),
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

// Kasuje pliki wgranego zdjęcia towaru (zdjęcie + miniatura); link nie ma plików. Nigdy nie rzuca.
const deleteImageFiles = async (image: MaterialImage | null | undefined): Promise<void> => {
  for (const file of imageFilesOf(image)) {
    await deleteUploadFile(file, SUPPLIER_IMAGE_SUBDIR).catch(err =>
      console.error(`[suppliers] nie usunięto zdjęcia towaru ${file}:`, err));
  }
};

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
    // Nowy dostawca nie ma jeszcze zdjęć towarów (zdjęcie dodaje się do zapisanego towaru)
    const materials = mergeMaterialImages([], parsed.data.materials).materials;
    const data = { ...parsed.data, materials, lastContactAt: null, createdAt: now, updatedAt: now };
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
    // Zdjęcia towarów zostają z bazy; pliki zdjęć towarów usuniętych z katalogu sprzątamy po zapisie.
    const ref = db.collection(COLLECTION).doc(id);
    const orphaned = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const merged = mergeMaterialImages(snap.data()?.materials, parsed.data.materials);
      tx.update(ref, { ...parsed.data, materials: merged.materials, updatedAt: new Date().toISOString() });
      return merged.orphaned;
    });
    if (!orphaned) {
      res.status(404).json({ error: 'Dostawca nie istnieje' });
      return;
    }
    for (const image of orphaned) await deleteImageFiles(image);
    const updated = await ref.get();
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
    const ref = db.collection(COLLECTION).doc(id);
    const supplierSnap = await ref.get();
    if (!supplierSnap.exists) return res.status(404).json({ error: 'Dostawca nie istnieje' });

    // Historia zamówień jest niezmienna — dostawcę z zamówieniami usuwa tylko administrator (#015)
    const ordersSnap = await ref.collection(ORDERS).get();
    if (!ordersSnap.empty && !isAdmin(req.user?.email)) {
      return res.status(403).json({
        error: `Ten dostawca ma ${ordersSnap.size} zamówień w historii — usunąć go może tylko administrator`,
      });
    }

    // Najpierw lista plików, potem dokumenty (Firestore nie usuwa podkolekcji sam), na końcu pliki —
    // błąd w połowie nie zostawi wpisów bez plików.
    const data = supplierSnap.data() ?? {};
    const pdfUrls = ordersSnap.docs.map(d => d.data().pdfUrl);
    const materials: Array<{ image?: MaterialImage }> = Array.isArray(data.materials) ? data.materials : [];
    const files: Array<{ url?: string }> = Array.isArray(data.files) ? data.files : [];

    const interactionsSnap = await ref.collection('interactions').get();
    const locksSnap = await ref.collection(ORDER_LOCKS).get();
    await deleteDocs([...interactionsSnap.docs, ...ordersSnap.docs, ...locksSnap.docs]);
    await ref.delete();

    for (const url of pdfUrls) await deleteOrderPdf(url);
    for (const m of materials) await deleteImageFiles(m.image);
    // Pliki z karty dostawcy (cenniki, załączniki) — tylko wgrane przez /api/upload (`produkt-…`),
    // żeby adres podsunięty w `files` nie skasował np. kolażu wysłanej kampanii.
    for (const f of files) {
      const filename = uploadFilenameOf(f.url);
      if (!isUserUploadFilename(filename)) continue;
      await deleteUploadFile(filename).catch(err =>
        console.error(`[suppliers] nie usunięto pliku dostawcy ${filename}:`, err));
    }

    res.status(204).send();
  } catch (err) {
    console.error('[suppliers] DELETE /:id błąd:', err);
    res.status(500).json({ error: 'Błąd usuwania dostawcy' });
  }
});

// --- ZDJĘCIE TOWARU (surowca) ---
// Przeglądarka zmniejsza zdjęcie (≤ 1600 px) i robi miniaturę; serwer sprawdza typ po zawartości i wymiary.

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SUPPLIER_IMAGE_MAX_BYTES, files: 2, fields: 0 },
}).fields([{ name: 'image', maxCount: 1 }, { name: 'thumb', maxCount: 1 }]);

type ImageChange = { status: 'ok'; previous: MaterialImage | null } | { status: 'no-supplier' | 'no-material' };

// Ustawia (null = usuwa) zdjęcie towaru w transakcji; pliki poprzedniego zdjęcia kasuje finishImageChange.
const setMaterialImage = (supplierId: string, materialId: string, image: MaterialImage | null): Promise<ImageChange> => {
  const ref = db.collection(COLLECTION).doc(supplierId);
  return db.runTransaction(async (tx): Promise<ImageChange> => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { status: 'no-supplier' };
    const materials = Array.isArray(snap.data()?.materials) ? snap.data()!.materials : [];
    const result = replaceMaterialImage(materials, materialId, image);
    if (!result) return { status: 'no-material' };
    tx.update(ref, { materials: result.materials, updatedAt: new Date().toISOString() });
    return { status: 'ok', previous: result.previous };
  });
};

// 404 albo sprzątnięcie plików poprzedniego zdjęcia i aktualny dostawca w odpowiedzi.
const finishImageChange = async (res: Response, supplierId: string, change: ImageChange) => {
  if (change.status !== 'ok') {
    const error = change.status === 'no-supplier' ? 'Dostawca nie istnieje' : 'Towaru nie ma już w katalogu — odśwież kartę';
    return res.status(404).json({ error });
  }
  await deleteImageFiles(change.previous);
  const updated = await db.collection(COLLECTION).doc(supplierId).get();
  return res.json({ id: updated.id, ...updated.data() });
};

// POST /:id/materials/:materialId/image — multipart: `image` (≤ 1600 px) i `thumb` (miniatura)
router.post('/:id/materials/:materialId/image', (req: AuthenticatedRequest, res: Response) => {
  imageUpload(req, res, async (uploadErr) => {
    if (uploadErr instanceof multer.MulterError) {
      const msg = uploadErr.code === 'LIMIT_FILE_SIZE' ? 'Plik większy niż 8 MB' : `Błąd uploadu: ${uploadErr.message}`;
      return res.status(400).json({ error: msg });
    }
    if (uploadErr) {
      console.error('[suppliers] zdjęcie towaru — multer:', uploadErr);
      return res.status(400).json({ error: 'Nie udało się odebrać pliku' });
    }
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const image = files?.image?.[0];
    const thumb = files?.thumb?.[0];
    if (!image || !thumb) return res.status(400).json({ error: 'Brak zdjęcia lub miniatury' });

    const checkedImage = checkUploadedImage(image.buffer, 'image');
    if (!checkedImage.ok) return res.status(400).json({ error: checkedImage.error });
    const checkedThumb = checkUploadedImage(thumb.buffer, 'thumb');
    if (!checkedThumb.ok) return res.status(400).json({ error: checkedThumb.error });

    const { id, materialId } = req.params;
    const names = supplierImageFilenames(checkedImage.type, checkedThumb.type);
    const base = `${req.protocol}://${req.get('host')}/uploads/${SUPPLIER_IMAGE_SUBDIR}`;
    const entry = buildUploadedImage(`${base}/${names.image}`, `${base}/${names.thumb}`, new Date().toISOString());

    try {
      await saveUploadFile(names.image, image.buffer, SUPPLIER_IMAGE_SUBDIR);
      await saveUploadFile(names.thumb, thumb.buffer, SUPPLIER_IMAGE_SUBDIR);
    } catch (err) {
      await deleteImageFiles(entry);
      console.error('[suppliers] zdjęcie towaru — zapis pliku:', err);
      return res.status(500).json({ error: 'Nie udało się zapisać zdjęcia na serwerze' });
    }

    try {
      const change = await setMaterialImage(id, materialId, entry);
      if (change.status !== 'ok') await deleteImageFiles(entry);
      return await finishImageChange(res, id, change);
    } catch (err) {
      await deleteImageFiles(entry);
      console.error('[suppliers] zdjęcie towaru — zapis w bazie:', err);
      return res.status(500).json({ error: 'Nie udało się zapisać zdjęcia' });
    }
  });
});

// PUT /:id/materials/:materialId/image/link — { url } tylko https://; linku nie pobieramy na serwer
router.put('/:id/materials/:materialId/image/link', async (req: AuthenticatedRequest, res: Response) => {
  const link = validateImageLink(req.body?.url);
  if (!link.ok) return res.status(400).json({ error: link.error });
  const { id, materialId } = req.params;
  try {
    const change = await setMaterialImage(id, materialId, buildLinkImage(link.url, new Date().toISOString()));
    return await finishImageChange(res, id, change);
  } catch (err) {
    console.error('[suppliers] zdjęcie towaru — link:', err);
    return res.status(500).json({ error: 'Nie udało się zapisać linku do zdjęcia' });
  }
});

// DELETE /:id/materials/:materialId/image — usuwa zdjęcie (wgrane: razem z plikami)
router.delete('/:id/materials/:materialId/image', async (req: AuthenticatedRequest, res: Response) => {
  const { id, materialId } = req.params;
  try {
    const change = await setMaterialImage(id, materialId, null);
    return await finishImageChange(res, id, change);
  } catch (err) {
    console.error('[suppliers] zdjęcie towaru — usuwanie:', err);
    return res.status(500).json({ error: 'Nie udało się usunąć zdjęcia' });
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
// Wpis powstaje po udanej wysyłce z CRM albo po „Oznacz jako wysłane” i potem się go nie zmienia
// (brak PUT). Błędny wpis usuwa tylko administrator (ADMIN_EMAILS).

const OrderItemsSchema = z.array(z.object({
  materialId: z.string().max(100).optional(),
  name: z.string().trim().min(1).max(300),
  quantity: z.number().positive().max(1_000_000),
  unit: z.enum(ORDER_UNITS),
})).min(1, 'Zamówienie musi mieć co najmniej jedną pozycję').max(200);

const OrderSendSchema = z.object({
  subject: z.string().trim().min(1, 'Temat jest wymagany').max(300),
  body: z.string().trim().min(1, 'Treść maila jest wymagana').max(20000),
  notes: z.string().max(5000).optional(),
  items: OrderItemsSchema,
  // Identyfikator podglądu (UUID z przeglądarki) — drugie „Wyślij” z tym samym id nie wyśle maila ponownie.
  // Opcjonalny tylko dla starszej wersji frontu w pamięci PWA.
  requestId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional(),
});

const OrderPdfSchema = z.object({
  notes: z.string().max(5000).optional(),
  items: OrderItemsSchema,
});

const OrderMarkSentSchema = z.object({
  notes: z.string().max(5000).optional(),
  items: OrderItemsSchema,
  sentDate: z.string().max(10),
  note: z.string().max(2000).optional(),
  pdfDate: z.string().max(40).optional(), // chwila pobrania PDF — ta sama data na zapisanej kopii
});

type SupplierDoc = FirebaseFirestore.DocumentData;

const loadSupplier = async (id: string): Promise<SupplierDoc | null> => {
  const snap = await db.collection(COLLECTION).doc(id).get();
  return snap.exists ? (snap.data() ?? {}) : null;
};

const buildSupplierOrderPdf = (supplier: SupplierDoc, items: OrderItem[], notes: string, date: Date) =>
  generateSupplierOrderPdf(orderPdfLayout({
    supplier: { companyName: String(supplier.companyName ?? ''), email: String(supplier.email ?? ''), address: supplier.address },
    items, notes, date,
  }));

const catalogOf = (supplier: SupplierDoc) => (Array.isArray(supplier.materials) ? supplier.materials : []);

// POST /:id/orders/pdf — sam PDF do pobrania (przed wysyłką poza CRM). Nic nie zapisuje.
router.post('/:id/orders/pdf', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = OrderPdfSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  try {
    const supplier = await loadSupplier(req.params.id);
    if (!supplier) return res.status(404).json({ error: 'Dostawca nie istnieje' });
    const items = buildOrderItems(parsed.data.items, catalogOf(supplier));
    if (items.length === 0) return res.status(400).json({ error: 'Zamówienie musi mieć co najmniej jedną pozycję' });
    const now = new Date();
    const pdf = await buildSupplierOrderPdf(supplier, items, parsed.data.notes ?? '', now);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${orderAttachmentName(now)}"`);
    res.setHeader('X-Pdf-Date', now.toISOString());
    res.send(pdf);
  } catch (err) {
    console.error('[suppliers] POST /:id/orders/pdf błąd:', err);
    res.status(500).json({ error: 'Nie udało się przygotować PDF zamówienia' });
  }
});

// POST /:id/orders/mark-sent — „Oznacz jako wysłane” (zamówienie poszło poza CRM). Niczego nie wysyła.
router.post('/:id/orders/mark-sent', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = OrderMarkSentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  const now = new Date();
  const dateError = sentDateError(parsed.data.sentDate, now);
  if (dateError) return res.status(400).json({ error: dateError });
  const { id } = req.params;

  let supplier: SupplierDoc | null;
  try {
    supplier = await loadSupplier(id);
  } catch (err) {
    console.error('[suppliers] POST /:id/orders/mark-sent — odczyt dostawcy:', err);
    return res.status(500).json({ error: 'Błąd odczytu dostawcy' });
  }
  if (!supplier) return res.status(404).json({ error: 'Dostawca nie istnieje' });

  const items = buildOrderItems(parsed.data.items, catalogOf(supplier));
  if (items.length === 0) return res.status(400).json({ error: 'Zamówienie musi mieć co najmniej jedną pozycję' });
  const notes = parsed.data.notes ?? '';

  // Kopia PDF taka jak pobrana: te same pozycje, uwagi i data z chwili pobrania
  const pdfFilename = orderPdfFilename(now, crypto.randomBytes(12).toString('hex'));
  try {
    const pdf = await buildSupplierOrderPdf(supplier, items, notes, pdfDateFrom(parsed.data.pdfDate, now));
    await saveUploadFile(pdfFilename, pdf, ORDERS_DIR);
  } catch (err) {
    console.error('[suppliers] POST /:id/orders/mark-sent — PDF:', err);
    return res.status(500).json({ error: 'Nie udało się zapisać kopii PDF — wpis nie powstał' });
  }

  const entry = buildManualOrderEntry({
    sentDate: parsed.data.sentDate, recordedAt: now, to: String(supplier.email ?? '').trim(), items, notes,
    note: parsed.data.note ?? '', recordedBy: req.user?.email,
    pdfUrl: `${req.protocol}://${req.get('host')}/uploads/${ORDERS_DIR}/${pdfFilename}`, pdfFilename,
  });

  const supplierRef = db.collection(COLLECTION).doc(id);
  let orderId: string;
  try {
    orderId = (await supplierRef.collection(ORDERS).add(entry)).id;
  } catch (err) {
    await deleteUploadFile(pdfFilename, ORDERS_DIR).catch(() => undefined);
    console.error('[suppliers] POST /:id/orders/mark-sent — zapis:', err);
    return res.status(500).json({ error: 'Nie udało się zapisać wpisu w historii' });
  }

  const interaction = await addOrderInteraction(supplierRef, entry, orderId);
  res.status(201).json({ order: { id: orderId, ...entry }, interaction });
});

// DELETE /:id/orders/:orderId — błędny wpis, tylko administrator; sprząta kopię PDF i krótki wpis w kontaktach.
router.delete('/:id/orders/:orderId', async (req: AuthenticatedRequest, res: Response) => {
  if (!isAdmin(req.user?.email)) return res.status(403).json({ error: 'Wpis z historii zamówień może usunąć tylko administrator' });
  const { id, orderId } = req.params;
  try {
    const supplierRef = db.collection(COLLECTION).doc(id);
    const orderRef = supplierRef.collection(ORDERS).doc(orderId);
    const snap = await orderRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Wpis nie istnieje' });

    const linked = await supplierRef.collection('interactions').where('orderId', '==', orderId).get();
    const batch = db.batch();
    linked.docs.forEach(d => batch.delete(d.ref));
    batch.delete(orderRef);
    await batch.commit();
    // Plik dopiero po udanym zapisie w bazie — wpis nigdy nie zostaje bez swojego PDF
    await deleteOrderPdf(snap.data()?.pdfUrl);
    if (!linked.empty) await recomputeLastContact(supplierRef);

    console.info(`[suppliers] wpis zamówienia ${orderId} dostawcy ${id} usunięty przez ${req.user?.email}`);
    res.status(204).send();
  } catch (err) {
    console.error('[suppliers] DELETE /:id/orders/:orderId błąd:', err);
    res.status(500).json({ error: 'Błąd usuwania wpisu' });
  }
});

// Krótki wpis w historii kontaktów — jego błąd nie cofa zamówienia
const addOrderInteraction = async (
  supplierRef: FirebaseFirestore.DocumentReference, entry: SupplierOrderEntry, orderId: string,
): Promise<Record<string, unknown> | null> => {
  try {
    const data = { ...orderInteraction(entry), orderId, createdBy: entry.recordedBy, createdAt: entry.recordedAt };
    const ref = await supplierRef.collection('interactions').add(data);
    await recomputeLastContact(supplierRef);
    return { id: ref.id, ...data };
  } catch (err) {
    console.error(`[suppliers] wpis w historii kontaktów (zamówienie ${orderId}):`, err);
    return null;
  }
};

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
// Odpowiedź z `sent: true` = mail wyszedł (albo mógł wyjść) — front blokuje wtedy ponowną wysyłkę.
router.post('/:id/orders', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = OrderSendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  const { id } = req.params;
  const supplierRef = db.collection(COLLECTION).doc(id);

  let supplier: SupplierDoc | null;
  try {
    supplier = await loadSupplier(id);
  } catch (err) {
    console.error('[suppliers] POST /:id/orders — odczyt dostawcy:', err);
    return res.status(500).json({ error: 'Błąd odczytu dostawcy' });
  }
  if (!supplier) return res.status(404).json({ error: 'Dostawca nie istnieje' });

  // Adresat zawsze z karty dostawcy w bazie, nie z formularza
  const to = String(supplier.email ?? '').trim();
  if (!isValidRecipient(to)) return res.status(400).json({ error: 'Ten dostawca nie ma poprawnego adresu e-mail' });

  const items = buildOrderItems(parsed.data.items, catalogOf(supplier));
  if (items.length === 0) return res.status(400).json({ error: 'Zamówienie musi mieć co najmniej jedną pozycję' });

  // Znacznik wysyłki: create() się nie uda, jeśli ten podgląd już raz wysłał (np. odpowiedź nie dotarła do przeglądarki)
  const lockRef = parsed.data.requestId ? supplierRef.collection(ORDER_LOCKS).doc(parsed.data.requestId) : null;
  if (lockRef) {
    try {
      await lockRef.create({ status: 'sending', createdAt: new Date().toISOString(), by: req.user?.email ?? null });
    } catch (err) {
      if ((err as { code?: number }).code === 6) { // ALREADY_EXISTS
        return res.status(409).json({
          error: 'To zamówienie zostało już wysłane (albo właśnie się wysyła). Sprawdź Historię zamówień i „Wysłane” w Gmailu — nie wysyłaj ponownie.',
          sent: true,
        });
      }
      console.error('[suppliers] POST /:id/orders — znacznik wysyłki:', err);
      return res.status(500).json({ error: 'Nie udało się przygotować wysyłki — nic nie zostało wysłane' });
    }
  }
  const releaseLock = () => lockRef?.delete().catch(err => console.error('[suppliers] zwolnienie znacznika wysyłki:', err));

  const now = new Date();
  const notes = parsed.data.notes ?? '';
  const pdfFilename = orderPdfFilename(now, crypto.randomBytes(12).toString('hex'));
  let pdf: Buffer;
  try {
    pdf = await buildSupplierOrderPdf(supplier, items, notes, now);
    await saveUploadFile(pdfFilename, pdf, ORDERS_DIR);
  } catch (err) {
    await releaseLock();
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
      pdfFilename: orderAttachmentName(now),
    });
  } catch (err) {
    // Mail nie wyszedł — nic nie zapisujemy, PDF i znacznik sprzątamy (można spróbować ponownie)
    await deleteUploadFile(pdfFilename, ORDERS_DIR).catch(() => undefined);
    await releaseLock();
    const msg = (err as Error).message;
    console.error('[suppliers] POST /:id/orders — wysyłka:', msg);
    return res.status(502).json({
      error: msg === GMAIL_TOKEN_ERROR ? msg : `Nie udało się wysłać zamówienia (${msg}) — nic nie zostało zapisane`,
    });
  }
  await lockRef?.update({ status: 'sent', gmailMessageId: gmail.id }).catch(() => undefined);

  const entry = buildOrderEntry({
    sentAt: now, to, subject: parsed.data.subject, body: parsed.data.body, items, notes,
    sentBy: req.user?.email, gmail,
    pdfUrl: `${req.protocol}://${req.get('host')}/uploads/${ORDERS_DIR}/${pdfFilename}`, pdfFilename,
  });

  let orderId: string;
  try {
    orderId = (await supplierRef.collection(ORDERS).add(entry)).id;
  } catch (err) {
    // Mail już wyszedł — pełny wpis w logu, żeby dało się go odtworzyć
    console.error('[suppliers] POST /:id/orders — zamówienie WYSŁANE, zapis historii nieudany:', JSON.stringify({ supplierId: id, entry }), err);
    return res.status(500).json({
      error: 'Zamówienie zostało WYSŁANE, ale nie zapisało się w historii. Nie wysyłaj go ponownie — szczegóły są w logu serwera.',
      sent: true,
    });
  }

  const interaction = await addOrderInteraction(supplierRef, entry, orderId);
  res.status(201).json({ order: { id: orderId, ...entry }, interaction });
});

export default router;