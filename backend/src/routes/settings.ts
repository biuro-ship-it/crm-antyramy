import { Router, Response } from 'express';
import { db } from '../services/firebase';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { z } from 'zod';

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
    res.status(500).json({ error: 'Błąd zapisu etykiet kolorów' });
  }
});

export default router;
