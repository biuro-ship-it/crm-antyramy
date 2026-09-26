// Serwis integracji z Fakturownią (tylko odczyt).
// Token i subdomena pochodzą z .env — nigdy nie trafiają do frontendu.
//   FAKTUROWNIA_DOMAIN=pluszek        (subdomena: pluszek.fakturownia.pl)
//   FAKTUROWNIA_TOKEN=xxxxxxxxxxxxxxx (Ustawienia → Konto → Integracja → Kod API)

const DOMAIN = process.env.FAKTUROWNIA_DOMAIN || '';
const TOKEN = process.env.FAKTUROWNIA_TOKEN || '';

export const isFakturowniaConfigured = (): boolean => Boolean(DOMAIN && TOKEN);

const baseUrl = (): string => `https://${DOMAIN}.fakturownia.pl`;

export interface FakturowniaClient {
  id: number;
  name: string;
  taxNo: string;
  email: string;
  phone: string;
  person: string;
  street: string;
  city: string;
  postCode: string;
  bankAccount: string;
}

export interface FakturowniaInvoice {
  id: number;
  number: string;
  issueDate: string;
  sellDate: string;
  paymentTo: string;
  priceNet: number;
  priceGross: number;
  currency: string;
  status: string; // np. issued / sent / paid / partial
  kind: string;   // np. vat, proforma, correction
}

const toNumber = (v: unknown): number => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** Znajduje klienta w Fakturowni po NIP (tax_no). Zwraca pierwszego pasującego lub null. */
export const getClientByNip = async (nip: string): Promise<FakturowniaClient | null> => {
  const nipClean = nip.replace(/[-\s]/g, '');
  const url = `${baseUrl()}/clients.json?tax_no=${encodeURIComponent(nipClean)}&api_token=${TOKEN}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Fakturownia clients: ${res.status}`);
  const arr = (await res.json()) as any[];
  const c = Array.isArray(arr) ? arr[0] : null;
  if (!c) return null;
  return {
    id: c.id,
    name: c.name || '',
    taxNo: c.tax_no || '',
    email: c.email || '',
    phone: c.phone || '',
    person: c.person || '',
    street: c.street || '',
    city: c.city || '',
    postCode: c.post_code || '',
    bankAccount: c.bank_account || '',
  };
};

const mapInvoice = (inv: any): FakturowniaInvoice => ({
  id: inv.id,
  number: inv.number || '',
  issueDate: inv.issue_date || '',
  sellDate: inv.sell_date || '',
  paymentTo: inv.payment_to || '',
  priceNet: toNumber(inv.price_net),
  priceGross: toNumber(inv.price_gross),
  currency: inv.currency || 'PLN',
  status: inv.status || '',
  kind: inv.kind || '',
});

/** Pobiera faktury danego klienta (po client_id), z paginacją (per_page=100, max 5 stron). */
export const getInvoicesByClientId = async (clientId: number): Promise<FakturowniaInvoice[]> => {
  const all: FakturowniaInvoice[] = [];
  const MAX_PAGES = 5;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${baseUrl()}/invoices.json?client_id=${clientId}&page=${page}&per_page=100&api_token=${TOKEN}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Fakturownia invoices: ${res.status}`);
    const arr = (await res.json()) as any[];
    if (!Array.isArray(arr) || arr.length === 0) break;
    for (const inv of arr) all.push(mapInvoice(inv));
    if (arr.length < 100) break;
  }
  // Najnowsze u góry
  all.sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
  return all;
};

/** Faktura z danymi nabywcy — do hurtowego dopasowania po NIP. */
export interface FakturowniaSalesInvoice extends FakturowniaInvoice {
  buyerTaxNo: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerPerson: string;
}

/**
 * Wszystkie faktury sprzedaży z konta (period=all), strona po stronie.
 * Faktury kosztowe (income=0) pomijamy. Przy przekroczeniu bezpiecznika rzucamy błąd,
 * bo niepełna lista skasowałaby klientom starsze faktury.
 */
export const getAllSalesInvoices = async (): Promise<FakturowniaSalesInvoice[]> => {
  const byId = new Map<number, FakturowniaSalesInvoice>();
  const MAX_PAGES = 200; // 20 000 faktur
  for (let page = 1; ; page++) {
    if (page > MAX_PAGES) throw new Error('Fakturownia: zbyt wiele faktur do pobrania naraz');
    const url = `${baseUrl()}/invoices.json?period=all&page=${page}&per_page=100&api_token=${TOKEN}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Fakturownia invoices: ${res.status}`);
    const arr = (await res.json()) as any[];
    if (!Array.isArray(arr) || arr.length === 0) break;
    for (const inv of arr) {
      if (inv.income === false || String(inv.income) === '0') continue;
      byId.set(inv.id, {
        ...mapInvoice(inv),
        buyerTaxNo: inv.buyer_tax_no || '',
        buyerName: inv.buyer_name || '',
        buyerEmail: inv.buyer_email || '',
        buyerPhone: inv.buyer_phone || '',
        buyerPerson: inv.buyer_person || '',
      });
    }
    if (arr.length < 100) break;
  }
  return Array.from(byId.values());
};

/** Pobiera PDF faktury jako bufor (token po stronie serwera). */
export const getInvoicePdf = async (invoiceId: number): Promise<Buffer> => {
  const url = `${baseUrl()}/invoices/${invoiceId}.pdf?api_token=${TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fakturownia PDF: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
};
