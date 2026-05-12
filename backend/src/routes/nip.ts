import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// Proxy do API Ministerstwa Finansów (biała lista VAT)
// Nie wymaga klucza API, działa bez limitu dla weryfikacji NIP
router.get('/:nip', async (req: Request, res: Response) => {
  const { nip } = req.params;

  // Walidacja formatu NIP (10 cyfr)
  const nipClean = nip.replace(/[-\s]/g, '');
  if (!/^\d{10}$/.test(nipClean)) {
    res.status(400).json({ error: 'Nieprawidłowy format NIP. Podaj 10 cyfr.' });
    return;
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const url = `https://wl-api.mf.gov.pl/api/search/nip/${nipClean}?date=${today}`;

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      if (response.status === 404) {
        res.status(404).json({ error: 'Nie znaleziono firmy o podanym NIP w rejestrze VAT.' });
        return;
      }
      throw new Error(`MF API error: ${response.status}`);
    }

    const data = await response.json() as {
      result?: {
        subject?: {
          name?: string;
          regon?: string;
          residenceAddress?: string;
          workingAddress?: string;
        };
      };
    };

    const subject = data?.result?.subject;
    if (!subject) {
      res.status(404).json({ error: 'Nie znaleziono firmy o podanym NIP.' });
      return;
    }

    res.json({
      nip: nipClean,
      companyName: subject.name || '',
      regon: subject.regon || '',
      address: subject.workingAddress || subject.residenceAddress || '',
    });
  } catch (err) {
    console.error('NIP lookup error:', err);
    res.status(500).json({ error: 'Błąd podczas wyszukiwania danych firmy.' });
  }
});

export default router;
