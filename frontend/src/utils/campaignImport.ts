import { Client, Product } from '../services/api';
import { EMPTY_FILTER, RecipientFilter, matchesFilter, canReceive } from './campaignFilters';
import { endsWithSignature, SIGNATURE_WARNING } from './signatureCheck';

// „Wklej z JSON” — format ze specyfikacji (polskie klucze):
// { "tytul_pdf", "temat", "temat_b", "tresc", "kody_produktow": [],
//   "filtr": { "typ": [], "kolor_relacji": [], "trasa": [], "tagi": [] } }
// Wypełnia formularz i zaznacza odbiorców. Nigdy nie wysyła.

export interface CampaignImportResult {
  pdfTitle: string | null;       // null = pole nieobecne w JSON (nie nadpisujemy)
  subjectA: string | null;
  subjectB: string | null;
  content: string | null;
  productIds: string[] | null;
  filter: RecipientFilter | null; // null = brak filtra — odbiorców wybiera się ręcznie
  recipientIds: string[];
  warnings: string[];
}

const strArray = (v: unknown, field: string, warnings: string[]): string[] => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) { warnings.push(`„${field}” powinno być listą — pominięte.`); return []; }
  return v.map(x => String(x).trim()).filter(Boolean);
};

const str = (v: unknown, field: string, warnings: string[]): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') { warnings.push(`„${field}” powinno być tekstem — pominięte.`); return null; }
  return v;
};

/**
 * Rzuca Error z czytelnym komunikatem przy niepoprawnym JSON.
 * `colorLabels` — etykiety kolorów z Administracji, żeby w filtrze dało się podać nazwę zamiast id.
 */
export const parseCampaignJson = (
  text: string,
  products: Product[],
  clients: Client[],
  colorLabels: Record<string, string> = {},
): CampaignImportResult => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`Niepoprawny JSON: ${(e as Error).message}`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('JSON musi być obiektem { ... }');
  }
  const o = raw as Record<string, unknown>;
  const warnings: string[] = [];

  const known = ['tytul_pdf', 'temat', 'temat_b', 'tresc', 'kody_produktow', 'filtr'];
  const unknown = Object.keys(o).filter(k => !known.includes(k));
  if (unknown.length) warnings.push(`Nieznane pola pominięte: ${unknown.join(', ')}.`);

  // Produkty po kodzie (bez rozróżniania wielkości liter)
  let productIds: string[] | null = null;
  if (o.kody_produktow !== undefined) {
    const codes = strArray(o.kody_produktow, 'kody_produktow', warnings);
    const byCode = new Map(products.filter(p => p.code).map(p => [p.code.trim().toLowerCase(), p.id]));
    const missing: string[] = [];
    productIds = [];
    for (const code of codes) {
      const id = byCode.get(code.toLowerCase());
      if (id) { if (!productIds.includes(id)) productIds.push(id); }
      else missing.push(code);
    }
    if (missing.length) warnings.push(`Nieznane kody produktów (pominięte): ${missing.join(', ')}.`);
  }

  // Filtr odbiorców
  let filter: RecipientFilter | null = null;
  if (o.filtr !== undefined && o.filtr !== null) {
    if (typeof o.filtr !== 'object' || Array.isArray(o.filtr)) {
      warnings.push('„filtr” powinien być obiektem — pominięty.');
    } else {
      const f = o.filtr as Record<string, unknown>;
      const labelToId = new Map(
        Object.entries(colorLabels).filter(([, l]) => l).map(([id, l]) => [l.toLowerCase(), id]),
      );
      const next: RecipientFilter = {
        ...EMPTY_FILTER,
        types: strArray(f.typ, 'filtr.typ', warnings).map(t => t.toLowerCase()),
        colors: strArray(f.kolor_relacji, 'filtr.kolor_relacji', warnings)
          .map(c => labelToId.get(c.toLowerCase()) ?? c.toLowerCase()),
        routes: strArray(f.trasa, 'filtr.trasa', warnings),
        tags: strArray(f.tagi, 'filtr.tagi', warnings).map(t => t.toLowerCase()),
      };
      const empty = !next.types.length && !next.colors.length && !next.routes.length && !next.tags.length;
      filter = empty ? null : next;
    }
  }

  const recipientIds = filter
    ? clients.filter(c => canReceive(c) && matchesFilter(c, filter!)).map(c => c.id)
    : [];
  if (filter && recipientIds.length === 0) warnings.push('Filtr nie pasuje do żadnego klienta z e-mailem.');
  if (!filter) warnings.push('Brak filtra odbiorców — wybierz ich ręcznie.');

  const content = str(o.tresc, 'tresc', warnings);
  if (content && endsWithSignature(content)) warnings.push(SIGNATURE_WARNING);

  const subjectB = str(o.temat_b, 'temat_b', warnings);

  return {
    pdfTitle: str(o.tytul_pdf, 'tytul_pdf', warnings),
    subjectA: str(o.temat, 'temat', warnings),
    subjectB: subjectB && subjectB.trim() ? subjectB : null,
    content,
    productIds,
    filter,
    recipientIds,
    warnings,
  };
};
