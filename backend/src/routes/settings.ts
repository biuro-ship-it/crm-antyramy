import { Router, Response } from 'express';
import { db } from '../services/firebase';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { z } from 'zod';
import { SIGNATURE_DOC, getSignature } from '../services/emailSignature';
import { CAMPAIGN_SETTINGS_DOC, getAttributionDays } from '../services/campaignMeasure';

const router = Router();
router.use(authenticate);

const DOC = 'settings/colorLabels';

const ColorLabelsSchema = z.object({
  clients: z.object({
    default: z.string().max(40).default(''),
    lilac:   z.string().max(40).default(''),
    cream:   z.string().max(40).default(''),
    pink:    z.string().max(40).default(''),
    mint:    z.string().max(40).default(''),
  }),
  notes: z.object({
    default: z.string().max(40).default(''),
    blue:    z.string().max(40).default(''),
    yellow:  z.string().max(40).default(''),
    red:     z.string().max(40).default(''),
    green:   z.string().max(40).default(''),
  }),
});

router.get('/colorLabels', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const snap = await db.doc(DOC).get();
    const data = snap.exists ? snap.data() : {};
    res.json(data ?? {});
  } catch (err) {
    console.error('[settings] GET /colorLabels błąd:', err);
    res.status(500).json({ error: 'Błąd pobierania etykiet kolorów' });
  }
});

router.put('/colorLabels', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = ColorLabelsSchema.parse(req.body);
    await db.doc(DOC).set(parsed, { merge: true });
    res.json(parsed);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error('[settings] PUT /colorLabels błąd:', err);
    res.status(500).json({ error: 'Błąd zapisu etykiet kolorów' });
  }
});

// Podpis w stopce maili — puste pole = pominięte w stopce
const SignatureSchema = z.object({
  greeting: z.string().trim().max(60),
  name:     z.string().trim().max(80),
  website:  z.string().trim().max(120),
  phone:    z.string().trim().max(40),
  email:    z.string().trim().max(120),
});

router.get('/emailSignature', async (_req: AuthenticatedRequest, res: Response) => {
  res.json(await getSignature());
});

router.put('/emailSignature', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = SignatureSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    await db.doc(SIGNATURE_DOC).set(parsed.data);
    res.json(parsed.data);
  } catch (err) {
    console.error('[settings] PUT /emailSignature błąd:', err);
    res.status(500).json({ error: 'Błąd zapisu podpisu' });
  }
});

// Ustawienia kampanii: okno przypisania zamówień (dni)
const CampaignSettingsSchema = z.object({
  attributionDays: z.number().int().min(1).max(90),
});

router.get('/campaigns', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ attributionDays: await getAttributionDays() });
  } catch (err) {
    console.error('[settings] GET /campaigns błąd:', err);
    res.status(500).json({ error: 'Błąd pobierania ustawień kampanii' });
  }
});

router.put('/campaigns', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = CampaignSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Okno przypisania: liczba dni od 1 do 90' });
    return;
  }
  try {
    await db.doc(CAMPAIGN_SETTINGS_DOC).set(parsed.data, { merge: true });
    res.json(parsed.data);
  } catch (err) {
    console.error('[settings] PUT /campaigns błąd:', err);
    res.status(500).json({ error: 'Błąd zapisu ustawień kampanii' });
  }
});

export default router;
