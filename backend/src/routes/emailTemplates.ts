import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../services/firebase';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest, EmailTemplate, EmailTemplateVersion } from '../types';
import { sendEmail } from '../services/gmail';

const router = Router();

const TemplateSchema = z.object({
  name: z.string().min(1, 'Nazwa szablonu jest wymagana'),
  category: z.string().min(1, 'Kategoria jest wymagana'),
  subject: z.string().min(1, 'Temat maila jest wymagany'),
  body: z.string().min(1, 'Treść szablonu jest wymagana'),
});

const SendSchema = z.object({
  to: z.string().email('Nieprawidłowy adres email'),
  subject: z.string().min(1, 'Temat jest wymagany'),
  body: z.string().min(1, 'Treść jest wymagana'),
});

// GET /api/email-templates — lista szablonów posortowana po createdAt desc
router.get('/', authenticate, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const snapshot = await db.collection('emailTemplates')
      .orderBy('createdAt', 'desc')
      .get();

    const templates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(templates);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Błąd pobierania szablonów';
    res.status(500).json({ error: message });
  }
});

// POST /api/email-templates — utwórz nowy szablon
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = TemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, category, subject, body } = parsed.data;
  const now = new Date().toISOString();

  const firstVersion: EmailTemplateVersion = { body, subject, savedAt: now };

  const templateData: Omit<EmailTemplate, 'id'> = {
    name,
    category,
    subject,
    body,
    currentVersion: 1,
    versions: { '1': firstVersion },
    createdBy: req.user?.email || 'system',
    createdAt: now,
    updatedAt: now,
  };

  try {
    const docRef = await db.collection('emailTemplates').add(templateData);
    res.status(201).json({ id: docRef.id, ...templateData });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Błąd zapisu szablonu';
    res.status(500).json({ error: message });
  }
});

// PUT /api/email-templates/:id — zapisz nową wersję
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = TemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { id } = req.params;
  const { name, category, subject, body } = parsed.data;
  const now = new Date().toISOString();

  try {
    const docRef = db.collection('emailTemplates').doc(id);
    const snap = await docRef.get();

    if (!snap.exists) {
      res.status(404).json({ error: 'Szablon nie istnieje' });
      return;
    }

    const existing = snap.data() as EmailTemplate;
    const nextVersion = (existing.currentVersion || 0) + 1;
    const newVersion: EmailTemplateVersion = { body, subject, savedAt: now };

    await docRef.update({
      name,
      category,
      subject,
      body,
      currentVersion: nextVersion,
      [`versions.${nextVersion}`]: newVersion,
      updatedAt: now,
    });

    res.json({ id, ...existing, name, category, subject, body, currentVersion: nextVersion, updatedAt: now });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Błąd aktualizacji szablonu';
    res.status(500).json({ error: message });
  }
});

// DELETE /api/email-templates/:id — usuń szablon
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const snap = await db.collection('emailTemplates').doc(id).get();
    if (!snap.exists) {
      res.status(404).json({ error: 'Szablon nie istnieje' });
      return;
    }

    await db.collection('emailTemplates').doc(id).delete();
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Błąd usuwania szablonu';
    res.status(500).json({ error: message });
  }
});

// POST /api/email-templates/:id/send — wyślij mail do klienta
router.post('/:id/send', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = SendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { to, subject, body } = parsed.data;

  const htmlBody = `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">

        <tr><td style="background:#1a56db;padding:28px 36px">
          <div style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px">Antyramy</div>
          <div style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:2px">Ramy i antyramy</div>
        </td></tr>

        <tr><td style="padding:32px 36px;color:#333;font-size:15px;line-height:1.8">
          ${body.replace(/\n/g, '<br>')}
        </td></tr>

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

  try {
    await sendEmail({ to, subject, htmlBody });
    res.json({ success: true, message: 'Mail wysłany' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Błąd wysyłki maila';
    res.status(500).json({ error: message });
  }
});

export default router;
