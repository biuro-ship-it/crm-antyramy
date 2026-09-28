import { Client } from '../services/api';

// Filtry odbiorców kampanii — czysta logika (testy: campaignFilters.test.ts).
// Puste pole filtra = brak ograniczenia. Listy (typy, kolory, trasy…) działają jako „dowolny z”.

export interface RecipientFilter {
  search: string;
  types: string[];
  colors: string[];
  routes: string[];
  provinces: string[];
  tags: string[];              // klient musi mieć KTÓRYKOLWIEK z tagów
  noOrderDays: number | null;  // brak zamówienia od X dni (także: nigdy nie zamawiał)
  noContactDays: number | null;
  noCampaignDays: number | null;
}

export const EMPTY_FILTER: RecipientFilter = {
  search: '', types: [], colors: [], routes: [], provinces: [], tags: [],
  noOrderDays: null, noContactDays: null, noCampaignDays: null,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Data ostatniego zamówienia: ręczne zamówienia + faktury z Fakturowni (bez korekt). */
export const lastOrderDate = (c: Client): string | null => {
  const dates = [
    ...(c.orders ?? []).filter(o => o.amount > 0).map(o => o.date),
    ...(c.fakturowniaInvoices ?? []).filter(f => f.kind !== 'correction' && f.priceNet > 0).map(f => f.issueDate),
  ].filter(Boolean);
  if (!dates.length) return null;
  dates.sort();
  return dates[dates.length - 1];
};

/** Czy od `date` minęło co najmniej `days` dni (brak daty = tak, np. nigdy nie zamawiał). */
export const olderThanDays = (date: string | null | undefined, days: number, now: Date): boolean => {
  if (!date) return true;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t >= days * DAY_MS;
};

export const matchesFilter = (c: Client, f: RecipientFilter, now: Date = new Date()): boolean => {
  const q = f.search.trim().toLowerCase();
  if (q) {
    const hay = [c.companyName, c.address?.city, c.email, c.contactPerson].filter(Boolean).join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (f.types.length && !f.types.includes(c.type)) return false;
  if (f.colors.length && !f.colors.includes(c.relationshipColor || 'default')) return false;
  if (f.routes.length && !f.routes.includes(c.route || '')) return false;
  if (f.provinces.length && !f.provinces.includes(c.address?.province || '')) return false;
  if (f.tags.length && !(c.tags ?? []).some(t => f.tags.includes(t))) return false;
  if (f.noOrderDays !== null && !olderThanDays(lastOrderDate(c), f.noOrderDays, now)) return false;
  if (f.noContactDays !== null && !olderThanDays(c.lastContactAt, f.noContactDays, now)) return false;
  if (f.noCampaignDays !== null && !olderThanDays(c.lastCampaignAt, f.noCampaignDays, now)) return false;
  return true;
};

/** Czy klient może dostać kampanię (ma e-mail i się nie wypisał). */
export const canReceive = (c: Client): boolean => !!c.email && !c.noMarketing;

/** Odbiorcy, którzy dostali kampanię w ostatnich `days` dniach (ochrona przed zmęczeniem). */
export const recentlyCampaigned = (clients: Client[], days = 7, now: Date = new Date()): Client[] =>
  clients.filter(c => c.lastCampaignAt && !olderThanDays(c.lastCampaignAt, days, now));

/** Jak rozwinie się {zwrot|Dzień dobry} — do kolumny w kroku „Odbiorcy”. */
export const salutationPreview = (c: Client, fallback = 'Dzień dobry'): { text: string; missing: boolean } => {
  const s = (c.salutation ?? '').trim();
  return s ? { text: s, missing: false } : { text: fallback, missing: true };
};
