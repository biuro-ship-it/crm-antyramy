import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../services/firebase';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { generatePromotionPdf } from '../services/pdf';
import { sendEmail } from '../services/gmail';
import { getSignatureHtml } from '../services/emailSignature';
import {
  CampaignProduct, CampaignRecipient, CampaignCounts, BatchResult, Variant, VariantB, VariantContent,
  renderForClient, renderPlaceholders, variantContent, pickPendingBatch, applyBatchResults,
  campaignContentError, testSubject,
} from '../services/campaignRender';
import { todayISO, recomputeLastContact } from '../utils/date';
import { isNotFound } from '../utils/firestore';
import { checkReplies, recomputeOrders, setOrderStatus } from '../services/campaignMeasure';
import { GMAIL_READ_SCOPE_ERROR } from '../services/gmail';
import { createCampaignFollowups } from '../services/campaignFollowups';
import { heroUrlPolicy, resolveHeroImageInput, planHeroImageChange, releaseCollageFile } from '../services/collageFiles';

// Kampanie — następca Promocji. Przebieg: szkic → start (zamrożenie odbiorców
// i produktów) → partie po 10 wysyłane na kliknięcie z przeglądarki → wysłana.
// Nic nie wychodzi bez jawnego POST /:id/start i /:id/send-batch z UI.

const router = Router();
router.use(authenticate);

const COLLECTION = 'campaigns';
const LOCK_MS = 120_000;      // blokada partii (druga karta nie wyśle równolegle)
const SEND_DELAY_MS = 200;    // jak w sendBulkEmails — ochrona przed limitem Gmail API
// Wysyłka testowa idzie zawsze tutaj — adres nigdy nie pochodzi z żądania
const CAMPAIGN_TEST_EMAIL = 'info@pluszek.pl';

interface CampaignDoc {
  name: string;
  status: 'draft' | 'sending' | 'sent';
  noProducts: boolean;
  productIds: string[];
  pdfTitle: string;
  productsSnapshot: CampaignProduct[] | null;
  variantA: VariantContent;
  variantB: VariantB | null;
  // Szkic trzyma tylko { clientId, variant }; start uzupełnia resztę pól
  recipients: Array<Partial<CampaignRecipient> & { clientId: string; variant: Variant }>;
  counts: CampaignCounts | null;
  results: typeof EMPTY_RESULTS;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  sentAt: string | null;
  sentBy: string | null;
  sendLockUntil: number | null;
  legacy?: boolean;
  heroImageUrl?: string | null; // kolaż nad treścią maila (null / brak = bez obrazka)
}

const EMPTY_RESULTS = {
  repliesA: 0, repliesB: 0, orders: 0, orderValueNet: 0, byPhone: 0,
  unsubscribeRequests: 0, ordersFromMail: 0, ordersFromPhone: 0,
};

// ─── Schematy ───────────────────────────────────────────────────────────────

const VariantASchema = z.object({ subject: z.string().max(300).default(''), content: z.string().max(20000).default('') });
const VariantBSchema = z.object({ subject: z.string().max(300), content: z.string().max(20000).nullable() });

const DraftSchema = z.object({
  name: z.string().trim().min(1, 'Nazwa kampanii jest wymagana').max(200),
  pdfTitle: z.string().max(200).default(''),
  noProducts: z.boolean().default(false),
  productIds: z.array(z.string()).max(50).default([]),
  variantA: VariantASchema,
  variantB: VariantBSchema.nullable().default(null),
  recipients: z.array(z.object({
    clientId: z.string().min(1),
    variant: z.enum(['A', 'B']),
  })).max(2000).default([]),
  // Brak klucza = bez zmian (zapis z innego kroku / starszy frontend), null lub '' = usunięcie
  heroImageUrl: z.string().max(500).nullable().optional(),
});

const PreviewSchema = z.object({
  clientId: z.string().nullable().default(null),
  pdfTitle: z.string().default(''),
  noProducts: z.boolean().default(false),
  productIds: z.array(z.string()).default([]),
  subject: z.string().default(''),
  content: z.string().default(''),
  heroImageUrl: z.string().max(500).nullable().optional(),
});

const SendTestSchema = z.object({ clientId: z.string().nullable().default(null) });

// ─── Pomocnicze ─────────────────────────────────────────────────────────────

const loadProducts = async (ids: string[]): Promise<CampaignProduct[]> => {
  if (ids.length === 0) return [];
  const snaps = await db.getAll(...ids.map(id => db.collection('products').doc(id)));
  return snaps.filter(s => s.exists).map(s => {
    const p = s.data()!;
    return { id: s.id, name: p.name || '', code: p.code || '', priceNetto: p.priceNetto || 0, imageUrl: p.imageUrl || '' };
  });
};

// Produkty kampanii: zamrożone przy starcie (wysłana / w toku) albo bieżące (szkic)
const campaignProducts = async (c: CampaignDoc): Promise<CampaignProduct[] | null> => {
  if (c.noProducts) return null;
  return c.productsSnapshot ?? await loadProducts(c.productIds);
};

const loadClient = async (id: string) => {
  const snap = await db.collection('clients').doc(id).get();
  return snap.exists ? (snap.data() as Record<string, any>) : null;
};

const sendPdf = (res: Response, buffer: Buffer, filename: string) => {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${filename}"`,
    'Content-Length': buffer.length,
  });
  res.send(buffer);
};

// PDF wspólny dla wszystkich odbiorców — placeholdery rozwinięte do tekstów zastępczych
const buildPdf = (c: { pdfTitle: string; variantA: VariantContent }, products: CampaignProduct[]) =>
  generatePromotionPdf(c.pdfTitle || 'Oferta', renderPlaceholders(c.variantA.content, null, { html: false }), products);

const EMPTY_COUNTS: CampaignCounts = { total: 0, sent: 0, failed: 0, skippedNoEmail: 0, skippedNoMarketing: 0 };

// Zapis wyniku JEDNEGO maila od razu po wysyłce (i przedłużenie blokady).
// Gdyby serwer przerwał żądanie w połowie partii, wysłani są już odnotowani
// i wznowienie nie wyśle im maila drugi raz.
const recordResult = async (ref: FirebaseFirestore.DocumentReference, result: BatchResult) => {
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const doc = snap.data() as CampaignDoc;
    const applied = applyBatchResults(doc.recipients as CampaignRecipient[], [result], doc.counts ?? EMPTY_COUNTS);
    tx.update(ref, {
      recipients: applied.recipients,
      counts: applied.counts,
      sendLockUntil: Date.now() + LOCK_MS,
    });
  });
};

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// heroImageUrl z żądania → adres kanoniczny / null / undefined; zły adres = 400.
// Host z nagłówka Host (bez portu) — na serwerze zawsze crm.antyramy.eu.
const resolveHero = (req: AuthenticatedRequest, input: string | null | undefined) => {
  const hostname = (req.get('host') ?? '').replace(/:\d+$/, '');
  const r = resolveHeroImageInput(input, heroUrlPolicy(hostname));
  if (!r.ok) throw new HttpError(400, r.error);
  return r.value;
};

// Adresy, które mogą wskazywać ten sam plik: kolaże pozostałych kampanii (każdy status) i zdjęcia produktów
const collageUsage = (excludeCampaignId: string) => async () => {
  const [campaigns, products] = await Promise.all([
    db.collection(COLLECTION).select('heroImageUrl').get(),
    db.collection('products').select('imageUrl').get(),
  ]);
  return [
    ...campaigns.docs.filter(d => d.id !== excludeCampaignId).map(d => d.get('heroImageUrl') as string | null | undefined),
    ...products.docs.map(d => d.get('imageUrl') as string | null | undefined),
  ];
};

// Zwolnienie pliku po zapisie — nigdy nie przerywa odpowiedzi (wynik tylko w logu)
const releaseCollage = async (url: string | null, campaignId: string, status: string) => {
  if (!url) return;
  const outcome = await releaseCollageFile({ url, ownerStatus: status, otherUrls: collageUsage(campaignId) });
  console.log(`[campaigns] kolaż ${url} kampanii ${campaignId}: ${outcome}`);
};

const handleError = (res: Response, err: unknown, where: string, fallback: string) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (isNotFound(err)) {
    res.status(404).json({ error: 'Kampania nie istnieje' });
    return;
  }
  console.error(`[campaigns] ${where} błąd:`, err);
  res.status(500).json({ error: err instanceof Error ? err.message : fallback });
};

// ─── Lista, odczyt, szkice ──────────────────────────────────────────────────

// GET /api/campaigns — lista (bez treści i szczegółów odbiorców)
router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const snap = await db.collection(COLLECTION).orderBy('createdAt', 'desc').get();
    res.json(snap.docs.map(d => {
      const c = d.data() as CampaignDoc;
      return {
        id: d.id,
        name: c.name,
        status: c.status,
        createdAt: c.createdAt,
        sentAt: c.sentAt,
        subjectA: c.variantA?.subject ?? '',
        subjectB: c.variantB?.subject ?? null,
        noProducts: !!c.noProducts,
        productCount: (c.productsSnapshot ?? c.productIds ?? []).length,
        recipientCount: (c.recipients ?? []).length,
        counts: c.counts,
        results: { ...EMPTY_RESULTS, ...(c.results ?? {}) },
        legacy: !!c.legacy,
        // Ranking: wysłane per wariant i nazwy produktów
        sentA: (c.recipients ?? []).filter(r => r.status === 'sent' && r.variant !== 'B').length,
        sentB: (c.recipients ?? []).filter(r => r.status === 'sent' && r.variant === 'B').length,
        productNames: (c.productsSnapshot ?? []).map(p => p.name),
      };
    }));
  } catch (err) {
    handleError(res, err, 'GET /', 'Błąd pobierania kampanii');
  }
});

// GET /api/campaigns/:id
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snap = await db.collection(COLLECTION).doc(req.params.id).get();
    if (!snap.exists) throw new HttpError(404, 'Kampania nie istnieje');
    res.json({ id: snap.id, ...snap.data() });
  } catch (err) {
    handleError(res, err, 'GET /:id', 'Błąd pobierania kampanii');
  }
});

// POST /api/campaigns — nowy szkic
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = DraftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const now = new Date().toISOString();
    const doc: CampaignDoc = {
      ...parsed.data,
      heroImageUrl: resolveHero(req, parsed.data.heroImageUrl) ?? null,
      status: 'draft',
      productsSnapshot: null,
      counts: null,
      results: EMPTY_RESULTS,
      createdAt: now,
      updatedAt: now,
      createdBy: req.user?.email || 'system',
      sentAt: null,
      sentBy: null,
      sendLockUntil: null,
    };
    const ref = await db.collection(COLLECTION).add(doc);
    res.status(201).json({ id: ref.id, ...doc });
  } catch (err) {
    handleError(res, err, 'POST /', 'Błąd zapisu kampanii');
  }
});

// PUT /api/campaigns/:id — zapis szkicu (wysłanej / w toku nie da się zmienić)
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = DraftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const { heroImageUrl: heroInput, ...fields } = parsed.data;
    const hero = resolveHero(req, heroInput);
    const ref = db.collection(COLLECTION).doc(req.params.id);
    let toRelease: string | null = null;
    const updated = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpError(404, 'Kampania nie istnieje');
      const current = snap.data() as CampaignDoc;
      if (current.status !== 'draft') throw new HttpError(409, 'Kampania jest w wysyłce albo wysłana — zmiany niemożliwe');
      const change = planHeroImageChange(current.heroImageUrl, hero);
      toRelease = change.release;
      const data = { ...fields, ...(change.set ? { heroImageUrl: change.next } : {}), updatedAt: new Date().toISOString() };
      tx.update(ref, data);
      return { ...current, ...data };
    });
    // Po zapisie: stary plik kolażu kasowany, jeśli nikt inny go nie używa
    await releaseCollage(toRelease, req.params.id, 'draft');
    res.json({ id: req.params.id, ...updated });
  } catch (err) {
    handleError(res, err, 'PUT /:id', 'Błąd zapisu kampanii');
  }
});

// DELETE /api/campaigns/:id — tylko szkic
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ref = db.collection(COLLECTION).doc(req.params.id);
    const hero = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpError(404, 'Kampania nie istnieje');
      const c = snap.data() as CampaignDoc;
      if (c.status !== 'draft') throw new HttpError(409, 'Można usunąć tylko szkic');
      tx.delete(ref);
      return c.heroImageUrl ?? null;
    });
    await releaseCollage(hero, req.params.id, 'draft');
    res.json({ success: true });
  } catch (err) {
    handleError(res, err, 'DELETE /:id', 'Błąd usuwania kampanii');
  }
});

// POST /api/campaigns/:id/duplicate — nowy szkic z treścią i produktami (bez odbiorców i wyników)
router.post('/:id/duplicate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snap = await db.collection(COLLECTION).doc(req.params.id).get();
    if (!snap.exists) throw new HttpError(404, 'Kampania nie istnieje');
    const src = snap.data() as CampaignDoc;
    const now = new Date().toISOString();
    const doc: CampaignDoc = {
      name: `${src.name} (kopia)`,
      status: 'draft',
      noProducts: !!src.noProducts,
      // Z wysłanej bierzemy produkty, które faktycznie poszły
      productIds: (src.productsSnapshot ?? []).map(p => p.id).length
        ? (src.productsSnapshot ?? []).map(p => p.id)
        : (src.productIds ?? []),
      pdfTitle: src.pdfTitle ?? '',
      productsSnapshot: null,
      variantA: src.variantA,
      variantB: src.variantB ?? null,
      // Ten sam plik w obu kampaniach — usunięcie w jednej nie skasuje go (releaseCollageFile)
      heroImageUrl: src.heroImageUrl ?? null,
      recipients: [],
      counts: null,
      results: EMPTY_RESULTS,
      createdAt: now,
      updatedAt: now,
      createdBy: req.user?.email || 'system',
      sentAt: null,
      sentBy: null,
      sendLockUntil: null,
    };
    const ref = await db.collection(COLLECTION).add(doc);
    res.status(201).json({ id: ref.id, ...doc });
  } catch (err) {
    handleError(res, err, 'POST /:id/duplicate', 'Błąd duplikowania kampanii');
  }
});

// ─── Podglądy ───────────────────────────────────────────────────────────────

// POST /api/campaigns/preview — podgląd maila z edytora (bez zapisu), dla wybranego klienta
router.post('/preview', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = PreviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const p = parsed.data;
    const heroImageUrl = resolveHero(req, p.heroImageUrl) ?? null;
    const [client, products, signatureHtml] = await Promise.all([
      p.clientId ? loadClient(p.clientId) : Promise.resolve(null),
      p.noProducts ? Promise.resolve(null) : loadProducts(p.productIds),
      getSignatureHtml(),
    ]);
    const { subject, html } = renderForClient({
      variant: { subject: p.subject, content: p.content },
      title: p.pdfTitle, products, signatureHtml, client, heroImageUrl,
    });
    res.json({ subject, html });
  } catch (err) {
    handleError(res, err, 'POST /preview', 'Błąd podglądu');
  }
});

// POST /api/campaigns/preview-pdf — PDF z edytora (bez zapisu)
router.post('/preview-pdf', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = PreviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const products = await loadProducts(parsed.data.productIds);
    if (products.length === 0) throw new HttpError(400, 'Wybierz produkty, żeby zobaczyć PDF');
    const buf = await buildPdf({ pdfTitle: parsed.data.pdfTitle, variantA: { subject: '', content: parsed.data.content } }, products);
    sendPdf(res, buf, 'podglad-oferty.pdf');
  } catch (err) {
    handleError(res, err, 'POST /preview-pdf', 'Błąd generowania PDF');
  }
});

// GET /api/campaigns/:id/preview?clientId=&variant= — podgląd zapisanej kampanii
router.get('/:id/preview', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snap = await db.collection(COLLECTION).doc(req.params.id).get();
    if (!snap.exists) throw new HttpError(404, 'Kampania nie istnieje');
    const c = snap.data() as CampaignDoc;
    const variant: Variant = req.query.variant === 'B' ? 'B' : 'A';
    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : '';
    const [client, products, signatureHtml] = await Promise.all([
      clientId ? loadClient(clientId) : Promise.resolve(null),
      campaignProducts(c),
      getSignatureHtml(),
    ]);
    const { subject, html } = renderForClient({
      variant: variantContent(c.variantA, c.variantB, variant),
      title: c.pdfTitle, products, signatureHtml, client, heroImageUrl: c.heroImageUrl ?? null,
    });
    res.json({ subject, html });
  } catch (err) {
    handleError(res, err, 'GET /:id/preview', 'Błąd podglądu');
  }
});

// GET /api/campaigns/:id/pdf — PDF kampanii (z cenami z dnia wysyłki, jeśli wysłana)
router.get('/:id/pdf', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snap = await db.collection(COLLECTION).doc(req.params.id).get();
    if (!snap.exists) throw new HttpError(404, 'Kampania nie istnieje');
    const c = snap.data() as CampaignDoc;
    const products = await campaignProducts(c);
    if (!products || products.length === 0) throw new HttpError(400, 'Kampania bez produktów — nie ma PDF');
    sendPdf(res, await buildPdf(c, products), 'oferta-antyramy.pdf');
  } catch (err) {
    handleError(res, err, 'GET /:id/pdf', 'Błąd generowania PDF');
  }
});

// ─── Wysyłka ────────────────────────────────────────────────────────────────

// POST /api/campaigns/:id/start — szkic → w toku: walidacja, zamrożenie odbiorców i produktów.
// Sam nic nie wysyła; maile idą dopiero w /send-batch.
router.post('/:id/start', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ref = db.collection(COLLECTION).doc(req.params.id);
    const snap0 = await ref.get();
    if (!snap0.exists) throw new HttpError(404, 'Kampania nie istnieje');
    const c0 = snap0.data() as CampaignDoc;

    // Walidacja treści
    const contentError = campaignContentError(c0);
    if (contentError) throw new HttpError(400, contentError);
    if ((c0.recipients ?? []).length === 0) throw new HttpError(400, 'Wybierz odbiorców');

    // Edytor zapisuje noProducts = brak wybranych produktów; tu zostaje zabezpieczenie
    // na produkty usunięte z katalogu po zapisie szkicu.
    const products = c0.noProducts ? null : await loadProducts(c0.productIds ?? []);
    if (!c0.noProducts && (!products || products.length === 0)) {
      throw new HttpError(400, 'Wybrane produkty nie istnieją już w katalogu — wybierz je ponownie (krok 1)');
    }

    // Odbiorcy: bieżące dane klientów, bez wypisanych i bez e-maila
    const clientSnaps = await db.getAll(...c0.recipients.map(r => db.collection('clients').doc(r.clientId)));
    let skippedNoEmail = 0;
    let skippedNoMarketing = 0;
    const recipients: CampaignRecipient[] = [];
    clientSnaps.forEach((s, i) => {
      if (!s.exists) return;
      const d = s.data()!;
      if (d.noMarketing) { skippedNoMarketing++; return; }
      if (!d.email) { skippedNoEmail++; return; }
      recipients.push({
        clientId: s.id,
        companyName: d.companyName || '',
        email: d.email,
        variant: c0.variantB ? c0.recipients[i].variant : 'A',
        status: 'pending',
        error: null,
        gmailMessageId: null,
        gmailThreadId: null,
        sentAt: null,
      });
    });
    if (recipients.length === 0) throw new HttpError(400, 'Żaden z wybranych klientów nie może dostać maila (brak e-maila lub wypis)');

    const counts: CampaignCounts = { total: recipients.length, sent: 0, failed: 0, skippedNoEmail, skippedNoMarketing };

    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if ((snap.data() as CampaignDoc).status !== 'draft') throw new HttpError(409, 'Kampania jest już w wysyłce albo wysłana');
      const data = {
        status: 'sending' as const,
        recipients,
        counts,
        productsSnapshot: products,
        sentBy: req.user?.email || 'system',
        sendLockUntil: null,
        updatedAt: new Date().toISOString(),
      };
      tx.update(ref, data);
      return data;
    });

    res.json({ id: ref.id, status: result.status, counts: result.counts, pending: recipients.length });
  } catch (err) {
    handleError(res, err, 'POST /:id/start', 'Błąd startu wysyłki');
  }
});

// POST /api/campaigns/:id/send-test — mail testowy ze szkicu na CAMPAIGN_TEST_EMAIL.
// Wygląda jak mail do odbiorcy (ten sam render, PDF, kolaż), temat ze znacznikiem [TEST].
// Niczego nie zapisuje: status, odbiorcy i historia klientów zostają bez zmian.
router.post('/:id/send-test', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = SendTestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const snap = await db.collection(COLLECTION).doc(req.params.id).get();
    if (!snap.exists) throw new HttpError(404, 'Kampania nie istnieje');
    const c = snap.data() as CampaignDoc;
    if (c.status !== 'draft') throw new HttpError(409, 'Test można wysłać tylko ze szkicu');
    const contentError = campaignContentError(c);
    if (contentError) throw new HttpError(400, contentError);

    const products = await campaignProducts(c);
    if (!c.noProducts && (!products || products.length === 0)) {
      throw new HttpError(400, 'Wybrane produkty nie istnieją już w katalogu — wybierz je ponownie (krok 1)');
    }
    const [client, signatureHtml, pdf] = await Promise.all([
      parsed.data.clientId ? loadClient(parsed.data.clientId) : Promise.resolve(null),
      getSignatureHtml(),
      products && products.length ? buildPdf(c, products) : Promise.resolve(null),
    ]);
    const pdfName = `oferta-antyramy-${todayISO()}.pdf`;

    const variants: Variant[] = c.variantB ? ['A', 'B'] : ['A'];
    for (const [i, variant] of variants.entries()) {
      if (i > 0) await new Promise(resolve => setTimeout(resolve, SEND_DELAY_MS));
      const rendered = renderForClient({
        variant: variantContent(c.variantA, c.variantB, variant),
        title: c.pdfTitle, products, signatureHtml, client, heroImageUrl: c.heroImageUrl ?? null,
      });
      await sendEmail({
        to: CAMPAIGN_TEST_EMAIL,
        subject: testSubject(rendered.subject, c.variantB ? variant : null),
        htmlBody: rendered.html,
        ...(pdf ? { pdfBuffer: pdf, pdfFilename: pdfName } : {}),
      });
    }
    res.json({ to: CAMPAIGN_TEST_EMAIL, sent: variants.length });
  } catch (err) {
    handleError(res, err, 'POST /:id/send-test', 'Błąd wysyłki testowej');
  }
});

// POST /api/campaigns/:id/send-batch — wysyła kolejną partię (do 10) i zwraca postęp.
// Frontend woła w pętli po kliknięciu „Wyślij” / „Wznów wysyłkę”.
router.post('/:id/send-batch', async (req: AuthenticatedRequest, res: Response) => {
  const ref = db.collection(COLLECTION).doc(req.params.id);
  let locked = false;
  try {
    // 1. Blokada partii
    const c = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpError(404, 'Kampania nie istnieje');
      const doc = snap.data() as CampaignDoc;
      if (doc.status !== 'sending') throw new HttpError(409, doc.status === 'sent' ? 'Kampania jest już wysłana' : 'Kampania nie jest w wysyłce');
      if (doc.sendLockUntil && doc.sendLockUntil > Date.now()) throw new HttpError(409, 'Wysyłka tej kampanii trwa w innym oknie');
      tx.update(ref, { sendLockUntil: Date.now() + LOCK_MS });
      return doc;
    });
    locked = true;

    const batch = pickPendingBatch(c.recipients as CampaignRecipient[]);
    const results: BatchResult[] = [];

    if (batch.length > 0) {
      const products = await campaignProducts(c);
      const [signatureHtml, pdf] = await Promise.all([
        getSignatureHtml(),
        products && products.length ? buildPdf(c, products) : Promise.resolve(null),
      ]);
      const today = todayISO();
      const pdfName = `oferta-antyramy-${today}.pdf`;

      for (const r of batch) {
        try {
          const clientRef = db.collection('clients').doc(r.clientId);
          const clientSnap = await clientRef.get();
          if (!clientSnap.exists) throw new Error('Klient został usunięty');
          const client = clientSnap.data()!;
          if (client.noMarketing) throw new Error('Klient wypisał się z ofert');

          const rendered = renderForClient({
            variant: variantContent(c.variantA, c.variantB, r.variant),
            title: c.pdfTitle, products, signatureHtml, client, heroImageUrl: c.heroImageUrl ?? null,
          });
          const ids = await sendEmail({
            to: r.email,
            subject: rendered.subject,
            htmlBody: rendered.html,
            ...(pdf ? { pdfBuffer: pdf, pdfFilename: pdfName } : {}),
          });
          const sentAt = new Date().toISOString();
          const ok: BatchResult = { clientId: r.clientId, ok: true, gmailMessageId: ids.id, gmailThreadId: ids.threadId, sentAt };
          results.push(ok);
          await recordResult(ref, ok);

          // Historia kontaktów jak w Promocjach — tylko dla faktycznie wysłanych.
          // Błąd zapisu historii nie cofa wysyłki (mail już poszedł).
          try {
            await clientRef.collection('interactions').add({
              contactDate: today,
              channel: 'mail',
              notes: `Wysłano kampanię: ${c.name}${c.variantB ? ` (wariant ${r.variant})` : ''}`,
              tradeNotes: rendered.plainContent,
              products: (products ?? []).map(p => p.id),
              campaignId: ref.id,
              createdBy: c.sentBy || 'system',
              createdAt: sentAt,
            });
            await clientRef.update({ lastCampaignAt: sentAt });
            await recomputeLastContact(clientRef);
          } catch (histErr) {
            console.error(`[campaigns] historia klienta ${r.clientId} nie zapisana:`, histErr);
          }
        } catch (sendErr) {
          console.error(`[campaigns] wysyłka do ${r.email} nieudana:`, sendErr);
          // Jeśli mail poszedł, a padł dopiero zapis wyniku — nie oznaczamy jako błąd
          if (!results.some(x => x.clientId === r.clientId)) {
            const fail: BatchResult = { clientId: r.clientId, ok: false, error: (sendErr as Error).message };
            results.push(fail);
            await recordResult(ref, fail).catch(e => console.error('[campaigns] zapis błędu nieudany:', e));
          }
        }
        await new Promise(resolve => setTimeout(resolve, SEND_DELAY_MS));
      }
    }

    // 2. Podsumowanie partii + zdjęcie blokady (wyniki zapisane już pojedynczo)
    const out = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const doc = snap.data() as CampaignDoc;
      const applied = applyBatchResults(doc.recipients as CampaignRecipient[], [], doc.counts ?? EMPTY_COUNTS);
      const done = applied.pending === 0;
      const now = new Date().toISOString();
      tx.update(ref, {
        counts: applied.counts,
        sendLockUntil: null,
        updatedAt: now,
        ...(done ? { status: 'sent', sentAt: now } : {}),
      });
      return { ...applied, status: done ? 'sent' : 'sending' };
    });
    locked = false;

    res.json({
      status: out.status,
      counts: out.counts,
      pending: out.pending,
      batch: results.map(r => ({ clientId: r.clientId, ok: r.ok, error: r.error ?? null })),
    });
  } catch (err) {
    if (locked) {
      await ref.update({ sendLockUntil: null }).catch(() => undefined);
    }
    handleError(res, err, 'POST /:id/send-batch', 'Błąd wysyłki');
  }
});

// ─── Pomiar wyników (Etap 2) ────────────────────────────────────────────────

// POST /api/campaigns/recompute-orders — przelicza przypisanie zamówień we wszystkich kampaniach
router.post('/recompute-orders', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await recomputeOrders());
  } catch (err) {
    handleError(res, err, 'POST /recompute-orders', 'Błąd przeliczania zamówień');
  }
});

// POST /api/campaigns/:id/check-replies — odpowiedzi z Gmaila + przeliczenie zamówień
router.post('/:id/check-replies', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const replies = await checkReplies(req.params.id);
    const orders = await recomputeOrders();
    res.json({ replies, orders });
  } catch (err) {
    if ((err as Error).message === GMAIL_READ_SCOPE_ERROR) {
      res.status(400).json({ error: GMAIL_READ_SCOPE_ERROR });
      return;
    }
    handleError(res, err, 'POST /:id/check-replies', 'Błąd sprawdzania odpowiedzi');
  }
});

// POST /api/campaigns/:id/followups — telefony kontrolne dla odbiorców bez odpowiedzi
router.post('/:id/followups', async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await createCampaignFollowups(req.params.id));
  } catch (err) {
    handleError(res, err, 'POST /:id/followups', 'Błąd tworzenia follow-upów');
  }
});

// PATCH /api/campaigns/:id/orders — ręczna decyzja o przypisanym zamówieniu
const OrderStatusSchema = z.object({
  clientId: z.string().min(1),
  orderId: z.string().min(1),
  status: z.enum(['auto', 'confirmed', 'rejected']),
});

router.patch('/:id/orders', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = OrderStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const { clientId, orderId, status } = parsed.data;
    await setOrderStatus(req.params.id, clientId, orderId, status);
    const snap = await db.collection(COLLECTION).doc(req.params.id).get();
    res.json({ id: snap.id, ...snap.data() });
  } catch (err) {
    handleError(res, err, 'PATCH /:id/orders', 'Błąd zapisu decyzji');
  }
});

export default router;
