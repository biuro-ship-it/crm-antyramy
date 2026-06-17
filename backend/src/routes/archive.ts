import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { db } from '../services/firebase';

const router = Router();
router.use(authenticate);

// Katalog zdjęć — ta sama ścieżka co w routes/upload.ts.
// dist/routes/ → ../../public/uploads = public_nodejs/public/uploads/ na serwerze.
const UPLOAD_DIR = path.join(__dirname, '../../public/uploads');

// Kolekcje + podkolekcje. Kształt eksportu jest ZGODNY z backend/src/scripts/backup.ts
// (docId → { ...pola, _sub_<nazwa>: [...] }), dzięki czemu kopia jest ODTWARZALNA
// przez istniejący tryb `backup.js restore`. Nie spłaszczamy danych.
const COLLECTIONS = [
  { name: 'clients',        subcollections: ['interactions'] },
  { name: 'products',       subcollections: [] },
  { name: 'followups',      subcollections: [] },
  { name: 'notes',          subcollections: [] },
  { name: 'suppliers',      subcollections: ['interactions'] },
  { name: 'emailTemplates', subcollections: [] },
] as const;

async function exportCollection(
  name: string,
  subcollections: readonly string[],
): Promise<Record<string, unknown>> {
  const snapshot = await db.collection(name).get();
  const result: Record<string, unknown> = {};
  for (const doc of snapshot.docs) {
    const data: Record<string, unknown> = { ...doc.data() };
    for (const sub of subcollections) {
      const subSnap = await doc.ref.collection(sub).get();
      data[`_sub_${sub}`] = subSnap.docs.map(s => ({ _id: s.id, ...s.data() }));
    }
    result[doc.id] = data;
  }
  return result;
}

async function exportAll(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {
    _meta: { timestamp: new Date().toISOString(), version: 1 },
  };
  for (const col of COLLECTIONS) {
    out[col.name] = await exportCollection(col.name, col.subcollections);
  }
  return out;
}

// GET /api/archive — pełne dane Firestore jako JSON (odtwarzalny kształt).
router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await exportAll());
  } catch (error) {
    console.error('[archive] GET / błąd Firestore:', error);
    res.status(500).json({ error: 'Nie udało się przygotować archiwum', detail: String(error) });
  }
});

// GET /api/archive/zip — pełna kopia: dane.json + wszystkie zdjęcia z public/uploads.
router.get('/zip', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await exportAll();
    const date = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="crm-antyramy-backup-${date}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('[archive] błąd pakowania ZIP:', err);
      // Jeśli nagłówki już poszły, nie da się wysłać statusu — zrywamy połączenie.
      if (!res.headersSent) res.status(500).json({ error: 'Błąd pakowania archiwum' });
      else res.destroy(err);
    });
    archive.pipe(res);

    // Dane Firestore (odtwarzalny kształt).
    archive.append(JSON.stringify(data, null, 2), { name: 'dane.json' });

    // Zdjęcia — tylko jeśli katalog istnieje i ma pliki (inaczej ZIP z samymi danymi).
    if (fs.existsSync(UPLOAD_DIR) && fs.readdirSync(UPLOAD_DIR).length > 0) {
      archive.directory(UPLOAD_DIR, 'zdjecia');
    }

    await archive.finalize();
  } catch (error) {
    console.error('[archive] GET /zip błąd:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Nie udało się przygotować archiwum ZIP', detail: String(error) });
    }
  }
});

export default router;
