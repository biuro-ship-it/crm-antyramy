import { describe, it, expect } from 'vitest';
import { Client } from '../services/api';
import {
  clientOrders, clientTotal, clientYearTotal, clientMonthTotal,
  clientMinOrder, clientMaxOrder, clientYearlyAvg, clientMonthlyAvg, zl,
} from './sales';

/** Minimalny klient — tylko pola, na które patrzą funkcje ze sales.ts. */
const client = (orders: Client['orders']): Client =>
  ({ id: 'c1', orders } as Client);

describe('clientOrders — filtrowanie wpisów sprzedaży', () => {
  it('zwraca pustą tablicę gdy klient nie ma pola orders', () => {
    expect(clientOrders({ id: 'c1' } as Client)).toEqual([]);
  });

  it('pomija wpisy z kwotą 0, ujemną i nieliczbową', () => {
    const c = client([
      { id: '1', amount: 100, date: '2026-05-10' },
      { id: '2', amount: 0, date: '2026-05-11' },
      { id: '3', amount: -50, date: '2026-05-12' },
      { id: '4', amount: NaN, date: '2026-05-13' },
      { id: '5', amount: Infinity, date: '2026-05-14' },
    ]);
    expect(clientOrders(c).map(o => o.id)).toEqual(['1']);
  });
});

describe('sumy obrotów', () => {
  const c = client([
    { id: '1', amount: 1000, date: '2026-09-05' },
    { id: '2', amount: 500.5, date: '2026-09-20' },
    { id: '3', amount: 2000, date: '2026-03-15' },
    { id: '4', amount: 3000, date: '2025-11-02' },
  ]);

  it('clientTotal liczy wszystko, niezależnie od roku', () => {
    expect(clientTotal(c)).toBe(6500.5);
  });

  it('clientYearTotal liczy tylko wskazany rok', () => {
    expect(clientYearTotal(c, 2026)).toBe(3500.5);
    expect(clientYearTotal(c, 2025)).toBe(3000);
    expect(clientYearTotal(c, 2024)).toBe(0);
  });

  it('clientMonthTotal liczy tylko wskazany miesiąc danego roku', () => {
    // miesiąc liczony od zera — 8 to wrzesień
    expect(clientMonthTotal(c, 2026, 8)).toBe(1500.5);
    expect(clientMonthTotal(c, 2026, 2)).toBe(2000);
    expect(clientMonthTotal(c, 2025, 8)).toBe(0);
  });
});

describe('skrajne zamówienia', () => {
  it('zwracają 0 gdy klient nie ma sprzedaży', () => {
    const puste = client([]);
    expect(clientMinOrder(puste)).toBe(0);
    expect(clientMaxOrder(puste)).toBe(0);
  });

  it('ignorują odfiltrowane wpisy zerowe', () => {
    const c = client([
      { id: '1', amount: 0, date: '2026-01-01' },
      { id: '2', amount: 250, date: '2026-01-02' },
      { id: '3', amount: 1800, date: '2026-01-03' },
    ]);
    expect(clientMinOrder(c)).toBe(250);
    expect(clientMaxOrder(c)).toBe(1800);
  });
});

describe('średnie obrotów', () => {
  it('dzielą przez liczbę różnych lat / miesięcy z zamówieniami, nie przez liczbę wpisów', () => {
    const c = client([
      { id: '1', amount: 100, date: '2025-01-10' },
      { id: '2', amount: 300, date: '2025-01-20' }, // ten sam miesiąc i rok
      { id: '3', amount: 800, date: '2026-06-01' },
    ]);
    expect(clientYearlyAvg(c)).toBe(600);   // 1200 / 2 lata
    expect(clientMonthlyAvg(c)).toBe(600);  // 1200 / 2 miesiące
  });

  it('zwracają 0 przy braku sprzedaży, bez dzielenia przez zero', () => {
    const puste = client([]);
    expect(clientYearlyAvg(puste)).toBe(0);
    expect(clientMonthlyAvg(puste)).toBe(0);
  });
});

describe('zl — formatowanie kwot', () => {
  it('używa polskiego formatu z dwoma miejscami po przecinku', () => {
    expect(zl(1234.5)).toMatch(/^1\s?234,50 zł$/);
    expect(zl(0)).toBe('0,00 zł');
  });

  it('zaokrągla do groszy', () => {
    expect(zl(9.999)).toBe('10,00 zł');
  });
});
