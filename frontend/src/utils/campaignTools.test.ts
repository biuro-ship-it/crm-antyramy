import { describe, it, expect } from 'vitest';
import { Client, Product } from '../services/api';
import {
  matchesFilter, EMPTY_FILTER, lastOrderDate, olderThanDays, recentlyCampaigned, salutationPreview, canReceive,
} from './campaignFilters';
import { parseCampaignJson } from './campaignImport';
import { endsWithSignature } from './signatureCheck';

const NOW = new Date('2026-09-28T12:00:00Z');

const mk = (over: Partial<Client>): Client => ({
  id: 'x', companyName: 'Foto', type: 'zakład', nip: '', contactPerson: '', email: 'a@x.pl', phone: '',
  address: { province: 'Małopolskie', zipCode: '', city: 'Kraków', street: '', number: '' },
  lastContactAt: null, createdAt: '', updatedAt: '', ...over,
} as Client);

describe('filtry odbiorców', () => {
  it('pusty filtr przepuszcza wszystkich', () => {
    expect(matchesFilter(mk({}), EMPTY_FILTER, NOW)).toBe(true);
  });

  it('typ, kolor, trasa, województwo, tagi — „dowolny z”', () => {
    const c = mk({ type: 'sklep', relationshipColor: 'mint', route: 'Południe', tags: ['ślubne', 'premium'] });
    expect(matchesFilter(c, { ...EMPTY_FILTER, types: ['sklep', 'agencja'] }, NOW)).toBe(true);
    expect(matchesFilter(c, { ...EMPTY_FILTER, types: ['zakład'] }, NOW)).toBe(false);
    expect(matchesFilter(c, { ...EMPTY_FILTER, colors: ['mint'] }, NOW)).toBe(true);
    expect(matchesFilter(mk({}), { ...EMPTY_FILTER, colors: ['default'] }, NOW)).toBe(true);
    expect(matchesFilter(c, { ...EMPTY_FILTER, routes: ['Północ'] }, NOW)).toBe(false);
    expect(matchesFilter(c, { ...EMPTY_FILTER, provinces: ['Małopolskie'] }, NOW)).toBe(true);
    expect(matchesFilter(c, { ...EMPTY_FILTER, tags: ['klasyka', 'premium'] }, NOW)).toBe(true);
    expect(matchesFilter(c, { ...EMPTY_FILTER, tags: ['tanie'] }, NOW)).toBe(false);
  });

  it('wyszukiwarka po nazwie, mieście, e-mailu', () => {
    expect(matchesFilter(mk({}), { ...EMPTY_FILTER, search: 'krak' }, NOW)).toBe(true);
    expect(matchesFilter(mk({}), { ...EMPTY_FILTER, search: 'gdańsk' }, NOW)).toBe(false);
  });

  it('ostatnie zamówienie z zamówień i faktur (bez korekt)', () => {
    const c = mk({
      orders: [{ id: '1', amount: 100, date: '2026-05-01', note: '' }],
      fakturowniaInvoices: [
        { id: 1, number: '', issueDate: '2026-07-10', sellDate: '', paymentTo: '', priceNet: 50, priceGross: 0, currency: 'PLN', status: '', kind: 'vat' },
        { id: 2, number: '', issueDate: '2026-09-01', sellDate: '', paymentTo: '', priceNet: -50, priceGross: 0, currency: 'PLN', status: '', kind: 'correction' },
      ],
    });
    expect(lastOrderDate(c)).toBe('2026-07-10');
    expect(lastOrderDate(mk({}))).toBeNull();
  });

  it('„od X dni”: brak daty = spełnia (nigdy nie zamawiał / brak kontaktu)', () => {
    expect(olderThanDays(null, 30, NOW)).toBe(true);
    expect(olderThanDays('2026-09-20', 30, NOW)).toBe(false);
    expect(olderThanDays('2026-08-01', 30, NOW)).toBe(true);
    const c = mk({ lastContactAt: '2026-09-25', lastCampaignAt: '2026-09-01T10:00:00Z' });
    expect(matchesFilter(c, { ...EMPTY_FILTER, noContactDays: 30 }, NOW)).toBe(false);
    expect(matchesFilter(c, { ...EMPTY_FILTER, noCampaignDays: 14 }, NOW)).toBe(true);
    expect(matchesFilter(c, { ...EMPTY_FILTER, noOrderDays: 60 }, NOW)).toBe(true);
  });

  it('ostatnie 7 dni kampanii, zwrot, wypis', () => {
    const a = mk({ id: 'a', lastCampaignAt: '2026-09-25T10:00:00Z' });
    const b = mk({ id: 'b', lastCampaignAt: '2026-09-10T10:00:00Z' });
    expect(recentlyCampaigned([a, b], 7, NOW).map(c => c.id)).toEqual(['a']);
    expect(salutationPreview(mk({ salutation: 'Panie Marku' }))).toEqual({ text: 'Panie Marku', missing: false });
    expect(salutationPreview(mk({}))).toEqual({ text: 'Dzień dobry', missing: true });
    expect(canReceive(mk({ noMarketing: true }))).toBe(false);
    expect(canReceive(mk({ email: '' }))).toBe(false);
  });
});

describe('ostrzeżenie o podpisie', () => {
  it('wykrywa Antyramy + telefon w ostatnich 3 liniach', () => {
    expect(endsWithSignature('Oferta...\n\nPozdrawiam\nKrzysztof, Antyramy\n500 601 601')).toBe(true);
    expect(endsWithSignature('Antyramy tel. +48 500-601-601')).toBe(true);
    expect(endsWithSignature('Oferta Antyramy\nlinia\nlinia\nlinia\n500 601 601')).toBe(false);
    expect(endsWithSignature('Nowa listwa od Antyramy!\nZapraszamy.')).toBe(false);
  });
});

describe('import z JSON', () => {
  const products = [
    { id: 'p1', name: 'A', code: 'R-01', priceNetto: 1, imageUrl: '', createdAt: '' },
    { id: 'p2', name: 'B', code: 'R-02', priceNetto: 1, imageUrl: '', createdAt: '' },
  ] as unknown as Product[];
  const clients = [
    mk({ id: 'c1', type: 'sklep', tags: ['ślubne'] }),
    mk({ id: 'c2', type: 'sklep', tags: ['ślubne'], noMarketing: true }),
    mk({ id: 'c3', type: 'zakład', tags: ['ślubne'] }),
    mk({ id: 'c4', type: 'sklep', email: '' }),
  ];

  it('wypełnia pola, mapuje kody, zaznacza odbiorców bez wypisanych', () => {
    const r = parseCampaignJson(JSON.stringify({
      tytul_pdf: 'Jesień', temat: 'A', temat_b: 'B', tresc: 'Treść',
      kody_produktow: ['r-01', 'X-99'],
      filtr: { typ: ['Sklep'], tagi: ['ślubne'] },
    }), products, clients);
    expect(r.pdfTitle).toBe('Jesień');
    expect(r.subjectB).toBe('B');
    expect(r.productIds).toEqual(['p1']);
    expect(r.recipientIds).toEqual(['c1']);
    expect(r.warnings.some(w => w.includes('X-99'))).toBe(true);
  });

  it('kolor po etykiecie z Administracji', () => {
    const cs = [mk({ id: 'm', relationshipColor: 'mint' })];
    const r = parseCampaignJson('{"filtr":{"kolor_relacji":["Stały klient"]}}', products, cs, { mint: 'Stały klient' });
    expect(r.recipientIds).toEqual(['m']);
  });

  it('brak filtra, pusty temat_b, podpis w treści, nieznane pola — ostrzeżenia, nie błędy', () => {
    const r = parseCampaignJson(
      JSON.stringify({ temat: 'A', temat_b: '', tresc: 'x\nAntyramy 500 601 601', inne: 1 }),
      products, clients,
    );
    expect(r.subjectB).toBeNull();
    expect(r.productIds).toBeNull();
    expect(r.filter).toBeNull();
    expect(r.recipientIds).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/Podpis dodaje się automatycznie/);
    expect(r.warnings.join(' ')).toMatch(/inne/);
  });

  it('niepoprawny JSON = czytelny błąd', () => {
    expect(() => parseCampaignJson('{temat:', products, clients)).toThrow(/Niepoprawny JSON/);
    expect(() => parseCampaignJson('[1]', products, clients)).toThrow(/obiektem/);
  });
});
