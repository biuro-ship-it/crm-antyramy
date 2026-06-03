import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticate);

// Zawsze public/uploads/ — zarówno lokalnie jak i na serwerze
// __dirname w dev (ts-node): backend/src/routes/ → ../../public/uploads = backend/public/uploads/
// __dirname na serwerze (compiled): public_nodejs/dist/routes/ → ../../public/uploads = public_nodejs/public/uploads/ ✓
const UPLOAD_DIR = path.join(__dirname, '../../public/uploads');

// Utwórz katalog jeśli nie istnieje
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `produkt-${uniqueSuffix}${ext}`);
  },
});
const fileFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = [
    'image/jpeg', 
    'image/jpg', 
    'image/png', 
    'image/webp', 
    'application/pdf', 
    'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Dozwolone formaty: JPG, PNG, WebP, PDF, DOCX'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // max 5 MB
});

// POST /api/upload — prześlij zdjęcie produktu
router.post('/', (req: AuthenticatedRequest, res: Response) => {
  upload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: `Błąd uploadu: ${err.message}` });
      return;
    }
    if (err) {
      console.error('[upload] błąd multer:', err);
      res.status(400).json({ error: err.message || 'Nie udało się zapisać pliku' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Brak pliku lub niedozwolony format' });
      return;
    }

    // Zdjęcia serwowane przez Passenger z public_nodejs/public/uploads/
    // URL wyprowadzony z request (działa zarówno lokalnie jak i na produkcji)
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const imageUrl = `${baseUrl}/uploads/${req.file.filename}`;

    res.json({ imageUrl });
  });
});

// DELETE /api/upload/:filename — usuń zdjęcie
router.delete('/:filename', (req: AuthenticatedRequest, res: Response) => {
  const { filename } = req.params;

  // Zabezpieczenie przed path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    res.status(400).json({ error: 'Nieprawidłowa nazwa pliku' });
    return;
  }

  const filePath = path.join(UPLOAD_DIR, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Plik nie istnieje' });
    return;
  }

  try {
    fs.unlinkSync(filePath);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Błąd usuwania pliku' });
  }
});

export default router;
