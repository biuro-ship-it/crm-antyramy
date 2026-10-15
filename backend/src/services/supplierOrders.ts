// Zamówienia do dostawców — czyste funkcje (bez Firestore, Gmaila i dysku), testy: supplierOrders.test.ts.
// Budują pozycje zamówienia, wpis Historii zamówień, układ danych do PDF i HTML maila.
// Wysyłka i zapis: routes/suppliers.ts (POST /:id/orders). Opis: SPEC.md, „Zamówienia do dostawców”.

export const ORDER_UNITS = ['szt', 'm²', 'ark.', 'kpl'] as const;
export type OrderUnit = typeof ORDER_UNITS[number];

/** Dane zamawiającego w PDF — te same co w podpisie maila z zamówieniem. */
export const ORDERING_COMPANY = {
  name: 'Pluszek sp. z o.o. — Antyramy',
  street: 'ul. Monopolowa 11',
  city: '33-100 Tarnów',
  nip: '993-068-10-97',
  email: 'biuro@antyramy.eu',
  phone: '500 601 601',
};

export interface OrderItemInput {
  materialId?: string;
  name: string;
  quantity: number;
  unit: OrderUnit;
}

export interface OrderItem {
  materialId: string | null;
  name: string;
  quantity: number;
  unit: OrderUnit;
  unitPriceNet: number | null; // cena z katalogu dostawcy w CRM — tylko do historii, nie do maila/PDF
}

export interface CatalogMaterial { id: string; name: string; unit: string; price: number }

/** Pozycje z ilością > 0, nazwy przycięte, cena dobrana z katalogu dostawcy po `materialId`. */
export const buildOrderItems = (input: OrderItemInput[], catalog: CatalogMaterial[]): OrderItem[] => {
  const prices = new Map(catalog.map(m => [m.id, m.price]));
  return input
    .filter(i => Number.isFinite(i.quantity) && i.quantity > 0 && i.name.trim())
    .map(i => {
      const price = i.materialId ? prices.get(i.materialId) : undefined;
      return {
        materialId: i.materialId ?? null,
        name: i.name.trim(),
        quantity: i.quantity,
        unit: i.unit,
        unitPriceNet: typeof price === 'number' && Number.isFinite(price) ? price : null,
      };
    });
};

/** Wartość wg cennika CRM; null, gdy żadna pozycja nie ma ceny. */
export const estimatedTotalNet = (items: OrderItem[]): number | null => {
  const priced = items.filter(i => i.unitPriceNet !== null);
  if (priced.length === 0) return null;
  return Math.round(priced.reduce((sum, i) => sum + i.quantity * (i.unitPriceNet as number), 0) * 100) / 100;
};

export interface SupplierOrderEntry {
  sentAt: string;
  to: string;
  subject: string;
  body: string;
  items: OrderItem[];
  notes: string;
  estimatedTotalNet: number | null;
  sentBy: string;
  gmailMessageId: string | null;
  gmailThreadId: string | null;
  pdfUrl: string;
  pdfFilename: string;
}

/** Wpis Historii zamówień — powstaje dopiero po udanej wysyłce, potem się go nie zmienia. */
export const buildOrderEntry = (p: {
  sentAt: Date;
  to: string;
  subject: string;
  body: string;
  items: OrderItem[];
  notes: string;
  sentBy: string | undefined;
  gmail: { id: string | null; threadId: string | null };
  pdfUrl: string;
  pdfFilename: string;
}): SupplierOrderEntry => ({
  sentAt: p.sentAt.toISOString(),
  to: p.to,
  subject: p.subject,
  body: p.body,
  items: p.items,
  notes: p.notes.trim(),
  estimatedTotalNet: estimatedTotalNet(p.items),
  sentBy: p.sentBy || 'Nieznany',
  gmailMessageId: p.gmail.id,
  gmailThreadId: p.gmail.threadId,
  pdfUrl: p.pdfUrl,
  pdfFilename: p.pdfFilename,
});

/** Krótki wpis w historii kontaktów dostawcy (pełne szczegóły są w Historii zamówień). */
export const orderInteraction = (entry: SupplierOrderEntry) => ({
  contactDate: entry.sentAt.slice(0, 10),
  channel: 'mail' as const,
  notes: `📦 Zamówienie wysłane: ${entry.items.length} poz. — szczegóły i PDF w „Historii zamówień”`,
  tradeNotes: `Do: ${entry.to} · ${entry.subject}`,
});

// Data po polsku w strefie Warszawy — serwer może mieć inną strefę.
const plDate = (d: Date) =>
  new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);

export interface SupplierForPdf {
  companyName: string;
  email: string;
  address?: { street?: string; zipCode?: string; city?: string };
}

export interface OrderPdfLayout {
  title: string;
  dateLabel: string;
  buyer: string[];
  supplier: string[];
  rows: Array<[string, string, string, string]>; // lp., nazwa, ilość, jednostka
  notes: string;
}

/** Co trafia do PDF zamówienia — bez cen (jak w mailu). */
export const orderPdfLayout = (p: { supplier: SupplierForPdf; items: OrderItem[]; notes: string; date: Date }): OrderPdfLayout => {
  const a = p.supplier.address ?? {};
  const cityLine = [a.zipCode, a.city].map(s => (s ?? '').trim()).filter(Boolean).join(' ');
  return {
    title: 'Zamówienie',
    dateLabel: `Data: ${plDate(p.date)}`,
    buyer: [
      ORDERING_COMPANY.name, ORDERING_COMPANY.street, ORDERING_COMPANY.city,
      `NIP ${ORDERING_COMPANY.nip}`, ORDERING_COMPANY.email, `tel. ${ORDERING_COMPANY.phone}`,
    ],
    supplier: [p.supplier.companyName.trim(), (a.street ?? '').trim(), cityLine, p.supplier.email.trim()].filter(Boolean),
    rows: p.items.map((i, idx) => [String(idx + 1), i.name, formatQuantity(i.quantity), i.unit]),
    notes: p.notes.trim(),
  };
};

export const formatQuantity = (n: number): string =>
  new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 3 }).format(n);

/** Nazwa pliku PDF w uploads — losowa końcówka, bo /uploads jest dostępne bez logowania. */
export const orderPdfFilename = (date: Date, randomHex: string): string => {
  const safe = randomHex.replace(/[^a-f0-9]/gi, '').slice(0, 32);
  return `zamowienie-${date.toISOString().slice(0, 10)}-${safe}.pdf`;
};

const ORDER_PDF_RE = /^zamowienie-\d{4}-\d{2}-\d{2}-[a-f0-9]{8,32}\.pdf$/i;

/** Nazwa pliku PDF zamówienia z adresu albo null — do sprzątania przy usuwaniu dostawcy. */
export const orderPdfFilenameFromUrl = (url: string | null | undefined): string | null => {
  if (typeof url !== 'string') return null;
  const m = /\/uploads\/([^/?#]+)$/.exec(url.trim());
  return m && ORDER_PDF_RE.test(m[1]) ? m[1] : null;
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Treść z podglądu (zwykły tekst) jako HTML maila — znaki specjalne zabezpieczone, nowe linie zachowane. */
export const orderBodyToHtml = (text: string): string =>
  `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222">${escapeHtml(text).replace(/\r?\n/g, '<br>')}</div>`;
