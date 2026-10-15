import { Router, Response } from 'express';
import multer from 'multer';
import * as crypto from 'crypto';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { saveUploadFile, deleteUploadFile, detectUploadType, isUserUploadFilename } from '../services/uploadStore';

const router = Router();
router.use(authenticate);

// Pliki trafiają do public/uploads/ (lokalnie backend/public/uploads/, na serwerze public_nodejs/public/uploads/
// — poza repo i poza rsync). Plik najpierw w pamięci: typ sprawdzamy po zawartości, dopiero potem zapis na dysk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // max 5 MB
});

// POST /api/upload — zdjęcie produktu, dokument klienta/dostawcy/notatki, kolaż (?kind=kolaz)
router.post('/', (req: AuthenticatedRequest, res: Response) => {
  upload.single('image')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Plik większy niż 5 MB' : `Błąd uploadu: ${err.message}`;
      res.status(400).json({ error: msg });
      return;
    }
    if (err) {
      console.error('[upload] błąd multer:', err);
      res.status(400).json({ error: 'Nie udało się odebrać pliku' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Brak pliku' });
      return;
    }

    // Rozszerzenie z zawartości, nie z nazwy od przeglądarki (np. HTML udający .jpg → odrzucony)
    const kind = detectUploadType(req.file.buffer);
    if (!kind) {
      res.status(400).json({ error: 'Dozwolone formaty: JPG, PNG, WebP, PDF, DOC, DOCX' });
      return;
    }
    // Kolaż to zawsze JPG z przeglądarki; stała lista prefiksów — wartość z zapytania nie trafia do nazwy pliku
    const isCollage = req.query.kind === 'kolaz';
    if (isCollage && kind !== 'jpg') {
      res.status(400).json({ error: 'Kolaż musi być plikiem JPG' });
      return;
    }
    const prefix = isCollage ? 'kolaz' : 'produkt';
    const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${kind}`;

    try {
      await saveUploadFile(filename, req.file.buffer);
    } catch (saveErr) {
      console.error('[upload] zapis pliku:', saveErr);
      res.status(500).json({ error: 'Nie udało się zapisać pliku' });
      return;
    }

    // URL wyprowadzony z żądania (działa zarówno lokalnie, jak i na produkcji)
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({ imageUrl: `${baseUrl}/uploads/${filename}` });
  });
});

// DELETE /api/upload/:filename — usuwa plik wgrany przez POST /api/upload (tylko `produkt-…`).
// PDF-y zamówień, kolaże i zdjęcia towarów mają własne sprzątanie i nie da się ich skasować tą trasą.
router.delete('/:filename', async (req: AuthenticatedRequest, res: Response) => {
  const { filename } = req.params;
  if (!isUserUploadFilename(filename)) {
    res.status(400).json({ error: 'Tego pliku nie można usunąć tą drogą' });
    return;
  }
  try {
    await deleteUploadFile(filename);
    res.json({ ok: true });
  } catch (err) {
    console.error('[upload] usuwanie pliku:', err);
    res.status(500).json({ error: 'Błąd usuwania pliku' });
  }
});

export default router;
