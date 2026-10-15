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

export type OrderMethod = 'gmail' | 'manual'; // wysłane z CRM przez Gmail / wysłane poza CRM i oznaczone ręcznie

export interface SupplierOrderEntry {
  method: OrderMethod;
  sentAt: string;        // gmail: pełny czas ISO; manual: sama data RRRR-MM-DD wybrana w oknie
  recordedAt: string;    // kiedy wpis zapisano w CRM (ISO)
  recordedBy: string;    // kto wysłał z CRM / kto oznaczył jako wysłane
  to: string;
  subject: string | null; // tylko gmail
  body: string | null;    // tylko gmail
  items: OrderItem[];
  notes: string;          // uwagi do zamówienia (są w PDF)
  note: string;           // notatka do wpisu historii (tylko manual, nie ma jej w PDF)
  estimatedTotalNet: number | null;
  sentBy: string;
  gmailMessageId: string | null;
  gmailThreadId: string | null;
  pdfUrl: string;
  pdfFilename: string;
}

/** Wpis Historii zamówień po wysyłce z CRM — powstaje dopiero po udanej wysyłce, potem się go nie zmienia. */
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
  method: 'gmail',
  sentAt: p.sentAt.toISOString(),
  recordedAt: p.sentAt.toISOString(),
  recordedBy: p.sentBy || 'Nieznany',
  to: p.to,
  subject: p.subject,
  body: p.body,
  items: p.items,
  notes: p.notes.trim(),
  note: '',
  estimatedTotalNet: estimatedTotalNet(p.items),
  sentBy: p.sentBy || 'Nieznany',
  gmailMessageId: p.gmail.id,
  gmailThreadId: p.gmail.threadId,
  pdfUrl: p.pdfUrl,
  pdfFilename: p.pdfFilename,
});

/** Wpis po „Oznacz jako wysłane” — zamówienie poszło poza CRM, CRM niczego nie wysyła. */
export const buildManualOrderEntry = (p: {
  sentDate: string;
  recordedAt: Date;
  to: string;
  items: OrderItem[];
  notes: string;
  note: string;
  recordedBy: string | undefined;
  pdfUrl: string;
  pdfFilename: string;
}): SupplierOrderEntry => ({
  method: 'manual',
  sentAt: p.sentDate,
  recordedAt: p.recordedAt.toISOString(),
  recordedBy: p.recordedBy || 'Nieznany',
  to: p.to,
  subject: null,
  body: null,
  items: p.items,
  notes: p.notes.trim(),
  note: p.note.trim(),
  estimatedTotalNet: estimatedTotalNet(p.items),
  sentBy: p.recordedBy || 'Nieznany',
  gmailMessageId: null,
  gmailThreadId: null,
  pdfUrl: p.pdfUrl,
  pdfFilename: p.pdfFilename,
});

/** Krótki wpis w historii kontaktów dostawcy (pełne szczegóły są w Historii zamówień). */
export const orderInteraction = (entry: SupplierOrderEntry) => ({
  contactDate: entry.method === 'manual' ? entry.sentAt : warsawDate(new Date(entry.sentAt)),
  channel: 'mail' as const,
  notes: entry.method === 'manual'
    ? `📦 Zamówienie wysłane poza CRM (oznaczone ręcznie): ${entry.items.length} poz. — szczegóły i PDF w „Historii zamówień”`
    : `📦 Zamówienie wysłane: ${entry.items.length} poz. — szczegóły i PDF w „Historii zamówień”`,
  tradeNotes: entry.method === 'manual'
    ? (entry.note ? `Notatka: ${entry.note}` : '')
    : `Do: ${entry.to} · ${entry.subject}`,
});

/** Data RRRR-MM-DD w strefie Warszawy. */
export const warsawDate = (d: Date): string =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** Data wysyłki z okna „Oznacz jako wysłane”: poprawna RRRR-MM-DD, nie z przyszłości, nie starsza niż rok. */
export const sentDateError = (sentDate: string, now: Date): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sentDate)) return 'Nieprawidłowa data wysyłki';
  const d = new Date(`${sentDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== sentDate) return 'Nieprawidłowa data wysyłki';
  if (sentDate > warsawDate(now)) return 'Data wysyłki nie może być z przyszłości';
  const yearAgo = new Date(now.getTime() - 366 * 24 * 3600 * 1000);
  if (sentDate < warsawDate(yearAgo)) return 'Data wysyłki starsza niż rok';
  return null;
};

/**
 * Data na PDF przy „Oznacz jako wysłane” = chwila pobrania PDF (z przeglądarki), żeby zapisana kopia
 * była taka sama jak wysłana. Spoza okna (30 dni wstecz … 5 min naprzód) → teraz.
 */
export const pdfDateFrom = (iso: string | undefined, now: Date): Date => {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t) || t > now.getTime() + 5 * 60_000 || t < now.getTime() - 30 * 24 * 3600_000) return now;
  return new Date(t);
};

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

/** Nazwa kopii PDF w uploads/orders/ — data polska (jak na PDF), losowa końcówka 8–32 znaków hex
 *  (/uploads jest dostępne bez logowania). */
export const orderPdfFilename = (date: Date, randomHex: string): string => {
  const safe = randomHex.replace(/[^a-f0-9]/gi, '').slice(0, 32);
  if (safe.length < 8) throw new Error('Za krótka losowa końcówka nazwy PDF');
  return `zamowienie-${warsawDate(date)}-${safe}.pdf`;
};

/** Nazwa załącznika w mailu i pliku z „Pobierz PDF” — data polska (przed 2:00 UTC dawał wczoraj). */
export const orderAttachmentName = (date: Date): string => `Zamowienie-${warsawDate(date)}.pdf`;

const ORDER_PDF_RE = /^zamowienie-\d{4}-\d{2}-\d{2}-[a-f0-9]{8,32}\.pdf$/i;

/**
 * Położenie kopii PDF zamówienia z adresu albo null — do sprzątania. Nowe PDF-y leżą w uploads/orders/
 * (DELETE /api/upload ich nie dosięgnie), starsze wpisy mają PDF w samym uploads/.
 */
export const orderPdfLocationFromUrl = (url: string | null | undefined): { filename: string; subdir?: 'orders' } | null => {
  if (typeof url !== 'string') return null;
  const m = /\/uploads\/(?:(orders)\/)?([^/?#]+)$/.exec(url.trim());
  if (!m || !ORDER_PDF_RE.test(m[2])) return null;
  return m[1] ? { filename: m[2], subdir: 'orders' } : { filename: m[2] };
};

const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

/** Adres dostawcy nadaje się na adresata maila: jeden adres, bez spacji, przecinków i nawiasów (nagłówek To:). */
export const isValidRecipient = (email: string): boolean => email.length <= 254 && EMAIL_RE.test(email);

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Treść z podglądu (zwykły tekst) jako HTML maila — znaki specjalne zabezpieczone, nowe linie zachowane. */
export const orderBodyToHtml = (text: string): string =>
  `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222">${escapeHtml(text).replace(/\r?\n/g, '<br>')}</div>`;
