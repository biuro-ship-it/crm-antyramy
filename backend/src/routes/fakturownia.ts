import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import {
  isFakturowniaConfigured,
  getClientByNip,
  getInvoicesByClientId,
  getInvoicePdf,
  getAllSalesInvoices,
} from '../services/fakturownia';
import { planBulkSync, SyncClient } from '../services/fakturowniaSync';
import { db } from '../services/firebase';

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

// Hurtowa aktualizacja: wszystkie faktury sprzedaży → klienci CRM dopasowani po NIP.
router.post('/sync-all', async (_req: Request, res: Response) => {
  if (!isFakturowniaConfigured()) {
    res.status(503).json({ error: 'Integracja z Fakturownią nie jest skonfigurowana (brak FAKTUROWNIA_DOMAIN/TOKEN).' });
    return;
  }
  try {
    const invoices = await getAllSalesInvoices();
    const snapshot = await db.collection('clients').get();
    const clients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as SyncClient);
    const { updates, summary } = planBulkSync(clients, invoices, new Date().toISOString());

    // Firestore: max 500 operacji w jednym batchu
    const CHUNK = 400;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const batch = db.batch();
      for (const u of updates.slice(i, i + CHUNK)) {
        batch.update(db.collection('clients').doc(u.id), u.data);
      }
      await batch.commit();
    }
    res.json(summary);
  } catch (err) {
    console.error('Fakturownia sync-all error:', err);
    res.status(502).json({ error: 'Błąd hurtowej aktualizacji z Fakturowni.' });
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
