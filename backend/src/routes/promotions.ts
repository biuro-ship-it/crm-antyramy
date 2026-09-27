import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../services/firebase';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { generatePromotionPdf } from '../services/pdf';
import { sendBulkEmails } from '../services/gmail';
import { buildPromotionEmailHtml } from '../services/promotionEmail';
import { todayISO, recomputeLastContact } from '../utils/date';

const router = Router();

// Archiwum wysłanych kampanii (lista „Wysłane” w panelu Promocje)
const COLLECTION = 'promotions';

const PromotionSchema = z.object({
  title: z.string().min(1, 'Tytuł jest wymagany'),
  subject: z.string().min(1, 'Temat maila jest wymagany'),
  content: z.string().min(1, 'Treść jest wymagana'),
  productIds: z.array(z.string()).min(1, 'Wybierz co najmniej jeden produkt'),
  clientIds: z.array(z.string()).min(1, 'Wybierz co najmniej jednego klienta'),
});

// POST /api/promotions/send — generuje PDF i wysyła maile
router.post('/send', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = PromotionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { title, subject, content, productIds, clientIds } = parsed.data;

  try {
    // Pobierz produkty
    const productSnapshots = await Promise.all(
      productIds.map(id => db.collection('products').doc(id).get())
    );
    const products = productSnapshots
      .filter(s => s.exists)
      .map(s => ({ id: s.id, ...s.data() } as {
        id: string; name: string; code: string; priceNetto: number; imageUrl: string;
      }));

    if (products.length === 0) {
      res.status(400).json({ error: 'Nie znaleziono wybranych produktów' });
      return;
    }

    // Pobierz klientów
    const clientSnapshots = await Promise.all(
      clientIds.map(id => db.collection('clients').doc(id).get())
    );
    // Zachowujemy id klienta — historia kontaktów musi trafić TYLKO do tych,
    // do których mail faktycznie poszedł (patrz filtr po result.failed niżej).
    const existingClients = clientSnapshots.filter(s => s.exists);
    const recipients = existingClients
      .map(s => {
        const data = s.data() as { companyName: string; email: string };
        return { id: s.id, email: data.email, name: data.companyName };
      })
      .filter(r => r.email);

    if (recipients.length === 0) {
      res.status(400).json({ error: 'Żaden z wybranych klientów nie ma adresu email' });
      return;
    }

    // Generuj PDF
    const pdfBuffer = await generatePromotionPdf(title, content, products);

    const htmlBody = buildPromotionEmailHtml(title, content, products);

    const today = todayISO();

    // Wyślij maile
    const result = await sendBulkEmails(
      recipients,
      subject,
      htmlBody,
      pdfBuffer,
      `oferta-antyramy-${today}.pdf`
    );

    // Zapisz historię interakcji — tylko dla klientów, do których mail dotarł.
    // Klient bez adresu e-mail lub z błędem wysyłki NIE dostaje wpisu, bo inaczej
    // wypadałby z listy „najdawniej kontaktowani" mimo braku kontaktu.
    const now = new Date().toISOString();
    const interactionData = {
      contactDate: today,
      channel: 'mail',
      notes: `Wysłano promocję: ${title}`,
      tradeNotes: content,
      products: productIds,
      createdBy: req.user?.email || 'system',
      createdAt: now,
    };

    const failedEmails = new Set(result.failed.map(f => f.email));
    const delivered = recipients.filter(r => !failedEmails.has(r.email));

    await Promise.allSettled(
      delivered.map(r =>
        db.collection('clients').doc(r.id).collection('interactions').add(interactionData)
          .then(() => recomputeLastContact(db.collection('clients').doc(r.id)))
      )
    );

    // Archiwum kampanii. Maile już poszły, więc błąd zapisu tylko logujemy —
    // odpowiedź o wysyłce musi dotrzeć do UI, inaczej ktoś wyśle drugi raz.
    let promotionId: string | undefined;
    try {
      const failedByEmail = new Map(result.failed.map(f => [f.email, f.error]));
      const record = {
        title,
        subject,
        content,
        htmlBody,
        products: products.map(p => ({
          id: p.id,
          name: p.name || '',
          code: p.code || '',
          priceNetto: p.priceNetto || 0,
          imageUrl: p.imageUrl || '',
        })),
        recipients: recipients.map(r => {
          const error = failedByEmail.get(r.email);
          return error === undefined
            ? { clientId: r.id, companyName: r.name, email: r.email, status: 'sent' }
            : { clientId: r.id, companyName: r.name, email: r.email, status: 'failed', error };
        }),
        sentCount: result.sent,
        failedCount: result.failed.length,
        totalCount: recipients.length,
        skippedNoEmail: existingClients.length - recipients.length,
        sentAt: now,
        sentBy: req.user?.email || 'system',
      };
      const ref = await db.collection(COLLECTION).add(record);
      promotionId = ref.id;
    } catch (archiveErr) {
      console.error('[promotions] zapis archiwum nieudany:', archiveErr);
    }

    res.json({
      sent: result.sent,
      failed: result.failed,
      total: recipients.length,
      promotionId,
    });

  } catch (err) {
    console.error('[promotions] POST /send błąd:', err);
    const message = err instanceof Error ? err.message : 'Błąd wysyłki promocji';
    res.status(500).json({ error: message });
  }
});

// POST /api/promotions/preview-pdf — zwraca PDF do podglądu (bez wysyłki)
router.post('/preview-pdf', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    title: z.string().min(1),
    content: z.string().min(1),
    productIds: z.array(z.string()).min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const productSnapshots = await Promise.all(
      parsed.data.productIds.map(id => db.collection('products').doc(id).get())
    );
    const products = productSnapshots
      .filter(s => s.exists)
      .map(s => ({ id: s.id, ...s.data() } as {
        id: string; name: string; code: string; priceNetto: number; imageUrl: string;
      }));

    const pdfBuffer = await generatePromotionPdf(parsed.data.title, parsed.data.content, products);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="podglad-oferty.pdf"',
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[promotions] POST /preview-pdf błąd:', err);
    const message = err instanceof Error ? err.message : 'Błąd generowania PDF';
    res.status(500).json({ error: message });
  }
});

// --- ARCHIWUM WYSŁANYCH KAMPANII ---

interface ArchivedProduct {
  id: string; name: string; code: string; priceNetto: number; imageUrl: string;
}

// GET /api/promotions — lista kampanii (bez HTML i odbiorców, żeby była lekka)
router.get('/', authenticate, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const snapshot = await db.collection(COLLECTION)
      .select('title', 'subject', 'sentAt', 'sentBy', 'sentCount', 'failedCount',
        'totalCount', 'skippedNoEmail', 'products', 'legacy')
      .orderBy('sentAt', 'desc')
      .get();

    const list = snapshot.docs.map(doc => {
      const { products, ...rest } = doc.data() as { products?: ArchivedProduct[] } & Record<string, unknown>;
      return { id: doc.id, ...rest, productCount: products?.length ?? 0 };
    });
    res.json(list);
  } catch (err) {
    console.error('[promotions] GET / błąd:', err);
    res.status(500).json({ error: 'Nie udało się pobrać archiwum promocji' });
  }
});

// GET /api/promotions/:id — pełna kampania (HTML maila, produkty, odbiorcy)
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snap = await db.collection(COLLECTION).doc(req.params.id).get();
    if (!snap.exists) {
      res.status(404).json({ error: 'Promocja nie istnieje' });
      return;
    }
    res.json({ id: snap.id, ...snap.data() });
  } catch (err) {
    console.error('[promotions] GET /:id błąd:', err);
    res.status(500).json({ error: 'Nie udało się pobrać promocji' });
  }
});

// GET /api/promotions/:id/pdf — PDF z migawki produktów, czyli z cenami z dnia wysyłki
router.get('/:id/pdf', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snap = await db.collection(COLLECTION).doc(req.params.id).get();
    if (!snap.exists) {
      res.status(404).json({ error: 'Promocja nie istnieje' });
      return;
    }
    const data = snap.data() as { title: string; content: string; products?: ArchivedProduct[] };
    const pdfBuffer = await generatePromotionPdf(data.title, data.content, data.products ?? []);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="oferta-antyramy.pdf"',
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[promotions] GET /:id/pdf błąd:', err);
    const message = err instanceof Error ? err.message : 'Błąd generowania PDF';
    res.status(500).json({ error: message });
  }
});

export default router;
