import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import {
  isFakturowniaConfigured,
  getClientByNip,
  getInvoicesByClientId,
  getInvoicePdf,
} from '../services/fakturownia';

const router = Router();
router.use(authenticate);

// Klient + jego faktury po NIP (tylko odczyt z Fakturowni).
router.get('/lookup/:nip', async (req: Request, res: Response) => {
  if (!isFakturowniaConfigured()) {
    res.status(503).json({ error: 'Integracja z Fakturownią nie jest skonfigurowana (brak FAKTUROWNIA_DOMAIN/TOKEN).' });
    return;
  }
  const nipClean = req.params.nip.replace(/[-\s]/g, '');
  if (!/^\d{10}$/.test(nipClean)) {
    res.status(400).json({ error: 'Nieprawidłowy NIP (podaj 10 cyfr).' });
    return;
  }
  try {
    const client = await getClientByNip(nipClean);
    if (!client) {
      res.status(404).json({ error: 'Nie znaleziono klienta o tym NIP w Fakturowni.' });
      return;
    }
    const invoices = await getInvoicesByClientId(client.id);
    res.json({ client, invoices });
  } catch (err) {
    console.error('Fakturownia lookup error:', err);
    res.status(502).json({ error: 'Błąd komunikacji z Fakturownią.' });
  }
});

// Proxy PDF faktury — token zostaje po stronie serwera.
router.get('/invoice/:id/pdf', async (req: Request, res: Response) => {
  if (!isFakturowniaConfigured()) {
    res.status(503).json({ error: 'Integracja z Fakturownią nie jest skonfigurowana.' });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Nieprawidłowe ID faktury.' });
    return;
  }
  try {
    const pdf = await getInvoicePdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="faktura-${id}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('Fakturownia PDF error:', err);
    res.status(502).json({ error: 'Nie udało się pobrać PDF z Fakturowni.' });
  }
});

export default router;
