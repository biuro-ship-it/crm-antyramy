// Hurtowa aktualizacja sprzedaży klientów z Fakturowni — czysta logika (bez Firebase),
// żeby dało się ją przetestować. Zasady te same co przy przycisku na karcie klienta:
// wpisy z faktur mają id "fv-<id>" i są podmieniane, ręczne zostają; dane kontaktowe
// uzupełniamy tylko gdy są puste.

import { FakturowniaInvoice, FakturowniaSalesInvoice } from './fakturownia';

interface Order {
  id: string;
  amount: number;
  date: string;
  note?: string;
}

export interface SyncClient {
  id: string;
  companyName?: string;
  nip?: string;
  email?: string;
  phone?: string;
  contactPerson?: string;
  orders?: Order[];
}

export interface ClientSyncUpdate {
  id: string;
  data: Record<string, unknown>;
}

export interface BulkSyncSummary {
  invoicesFetched: number;
  invoicesMatched: number;
  invoicesWithoutNip: number;       // np. osoby prywatne
  updatedClients: number;
  noNip: string[];                  // klienci CRM bez poprawnego NIP
  noInvoices: string[];             // klienci z NIP, bez faktur w Fakturowni
  unmatchedBuyers: { nip: string; name: string; count: number }[]; // nabywcy spoza CRM
}

export interface BulkSyncPlan {
  updates: ClientSyncUpdate[];
  summary: BulkSyncSummary;
}

/** 10 cyfr NIP albo pusty string (obsługuje "PL123...", myślniki, spacje). */
export const normalizeNip = (v: string | undefined): string => {
  const digits = (v || '').replace(/\D/g, '');
  return digits.length === 10 ? digits : '';
};

const stripBuyer = (inv: FakturowniaSalesInvoice): FakturowniaInvoice => ({
  id: inv.id,
  number: inv.number,
  issueDate: inv.issueDate,
  sellDate: inv.sellDate,
  paymentTo: inv.paymentTo,
  priceNet: inv.priceNet,
  priceGross: inv.priceGross,
  currency: inv.currency,
  status: inv.status,
  kind: inv.kind,
});

export const planBulkSync = (
  clients: SyncClient[],
  invoices: FakturowniaSalesInvoice[],
  now: string,
): BulkSyncPlan => {
  const byNip = new Map<string, FakturowniaSalesInvoice[]>();
  let invoicesWithoutNip = 0;
  for (const inv of invoices) {
    const nip = normalizeNip(inv.buyerTaxNo);
    if (!nip) { invoicesWithoutNip++; continue; }
    const list = byNip.get(nip);
    if (list) list.push(inv); else byNip.set(nip, [inv]);
  }

  const updates: ClientSyncUpdate[] = [];
  const noNip: string[] = [];
  const noInvoices: string[] = [];
  const crmNips = new Set<string>();
  let invoicesMatched = 0;

  for (const client of clients) {
    const name = client.companyName || client.id;
    const nip = normalizeNip(client.nip);
    if (!nip) { noNip.push(name); continue; }
    crmNips.add(nip);
    const list = byNip.get(nip);
    if (!list) { noInvoices.push(name); continue; }

    // Najnowsze u góry — jak przy pobieraniu z karty klienta
    const sorted = [...list].sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
    const manualOrders = (client.orders ?? []).filter(o => !String(o.id).startsWith('fv-'));
    const invoiceOrders: Order[] = sorted
      // Schemat zamówień nie dopuszcza kwot ujemnych (korekty) — zostają tylko na liście faktur
      .filter(inv => inv.priceNet >= 0)
      .map(inv => ({
        id: `fv-${inv.id}`,
        amount: inv.priceNet,
        date: inv.sellDate || inv.issueDate,
        note: `Faktura ${inv.number}`,
      }));

    const firstNonEmpty = (pick: (i: FakturowniaSalesInvoice) => string) =>
      sorted.map(pick).find(v => v.trim() !== '') || '';

    const data: Record<string, unknown> = {
      orders: [...manualOrders, ...invoiceOrders],
      fakturowniaInvoices: sorted.map(stripBuyer),
      fakturowniaSyncedAt: now,
      salesEnabled: true,
      updatedAt: now,
    };
    if (!client.email) {
      const v = firstNonEmpty(i => i.buyerEmail);
      if (v) data.email = v;
    }
    if (!client.phone) {
      const v = firstNonEmpty(i => i.buyerPhone);
      if (v) data.phone = v;
    }
    if (!client.contactPerson) {
      const v = firstNonEmpty(i => i.buyerPerson);
      if (v) data.contactPerson = v;
    }

    updates.push({ id: client.id, data });
    invoicesMatched += list.length;
  }

  const unmatchedBuyers = Array.from(byNip.entries())
    .filter(([nip]) => !crmNips.has(nip))
    .map(([nip, list]) => ({ nip, name: list[0].buyerName, count: list.length }))
    .sort((a, b) => b.count - a.count);

  return {
    updates,
    summary: {
      invoicesFetched: invoices.length,
      invoicesMatched,
      invoicesWithoutNip,
      updatedClients: updates.length,
      noNip,
      noInvoices,
      unmatchedBuyers,
    },
  };
};
