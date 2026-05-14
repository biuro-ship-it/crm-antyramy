import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../services/firebase';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { generatePromotionPdf } from '../services/pdf';
import { sendBulkEmails } from '../services/gmail';

const router = Router();

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
    const recipients = clientSnapshots
      .filter(s => s.exists)
      .map(s => {
        const data = s.data() as { companyName: string; email: string };
        return { email: data.email, name: data.companyName };
      })
      .filter(r => r.email);

    if (recipients.length === 0) {
      res.status(400).json({ error: 'Żaden z wybranych klientów nie ma adresu email' });
      return;
    }

    // Generuj PDF
    const pdfBuffer = await generatePromotionPdf(title, content, products);

    // Buduj HTML body maila
    const productListHtml = products.map(p => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-weight:600">${p.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#666">${p.code || '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#1a56db;font-weight:700">${p.priceNetto > 0 ? `${p.priceNetto.toFixed(2)} zł netto` : '—'}</td>
      </tr>`).join('');

    const contentHtml = content.replace(/\n/g, '<br>');

    const htmlBody = `
<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">

        <!-- Header -->
        <tr><td style="background:#1a56db;padding:28px 36px">
          <div style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px">Antyramy</div>
          <div style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:2px">Ramy i antyramy</div>
        </td></tr>

        <!-- Tytuł -->
        <tr><td style="padding:32px 36px 16px">
          <h1 style="margin:0;font-size:22px;color:#111;font-weight:700">${title}</h1>
          <div style="width:40px;height:3px;background:#1a56db;margin-top:12px;border-radius:2px"></div>
        </td></tr>

        <!-- Treść -->
        <tr><td style="padding:0 36px 24px;color:#333;font-size:15px;line-height:1.7">
          ${contentHtml}
        </td></tr>

        <!-- Tabela produktów -->
        <tr><td style="padding:0 36px 32px">
          <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#666;margin-bottom:12px">Produkty objęte ofertą</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:6px;overflow:hidden">
            <tr style="background:#f8f9fa">
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;font-weight:600">Nazwa</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;font-weight:600">Kod</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;font-weight:600">Cena</th>
            </tr>
            ${productListHtml}
          </table>
          <p style="font-size:12px;color:#888;margin-top:8px">Szczegółowa oferta w załączonym pliku PDF.</p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8f9fa;padding:20px 36px;border-top:1px solid #eee">
          <p style="margin:0;font-size:12px;color:#888">
            Z poważaniem,<br>
            <strong style="color:#333">Zespół Antyramy</strong><br>
            <a href="https://antyramy.eu" style="color:#1a56db;text-decoration:none">antyramy.eu</a> · biuro@antyramy.eu
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // Wyślij maile
    const result = await sendBulkEmails(
      recipients,
      subject,
      htmlBody,
      pdfBuffer,
      `oferta-antyramy-${new Date().toISOString().split('T')[0]}.pdf`
    );

    // Zapisz historię interakcji dla każdego klienta
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const interactionData = {
      contactDate: today,
      channel: 'mail',
      notes: `Wysłano promocję: ${title}`,
      tradeNotes: content,
      products: productIds,
      createdBy: req.user?.email || 'system',
      createdAt: now,
    };

    await Promise.allSettled(
      clientIds.map(clientId =>
        db.collection('clients').doc(clientId).collection('interactions').add(interactionData)
          .then(() => db.collection('clients').doc(clientId).update({
            lastContactAt: today,
            updatedAt: now,
          }))
      )
    );

    res.json({
      sent: result.sent,
      failed: result.failed,
      total: recipients.length,
    });

  } catch (err) {
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
    const message = err instanceof Error ? err.message : 'Błąd generowania PDF';
    res.status(500).json({ error: message });
  }
});

export default router;
