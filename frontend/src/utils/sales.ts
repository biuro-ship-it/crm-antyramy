import { Client, Order } from '../services/api';

/** Bezpieczna lista zamówień klienta (pomija wpisy bez kwoty). */
export const clientOrders = (c: Client): Order[] =>
  (c.orders ?? []).filter(o => Number.isFinite(o.amount) && o.amount > 0);

/** Suma wszystkich zamówień klienta (cała sprzedaż). */
export const clientTotal = (c: Client): number =>
  clientOrders(c).reduce((sum, o) => sum + o.amount, 0);

/** Suma zamówień w danym roku (domyślnie bieżący). */
export const clientYearTotal = (c: Client, year = new Date().getFullYear()): number =>
  clientOrders(c)
    .filter(o => new Date(o.date).getFullYear() === year)
    .reduce((sum, o) => sum + o.amount, 0);

/** Suma zamówień w danym miesiącu bieżącego roku (domyślnie bieżący miesiąc). */
export const clientMonthTotal = (
  c: Client,
  year = new Date().getFullYear(),
  month = new Date().getMonth(),
): number =>
  clientOrders(c)
    .filter(o => {
      const d = new Date(o.date);
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .reduce((sum, o) => sum + o.amount, 0);

/** Najniższe pojedyncze zamówienie (0 gdy brak). */
export const clientMinOrder = (c: Client): number => {
  const o = clientOrders(c);
  return o.length ? Math.min(...o.map(x => x.amount)) : 0;
};

/** Najwyższe pojedyncze zamówienie (0 gdy brak). */
export const clientMaxOrder = (c: Client): number => {
  const o = clientOrders(c);
  return o.length ? Math.max(...o.map(x => x.amount)) : 0;
};

/** Liczba różnych lat z zamówieniami. */
const distinctYears = (c: Client): number =>
  new Set(clientOrders(c).map(o => new Date(o.date).getFullYear())).size;

/** Liczba różnych miesięcy (rok-miesiąc) z zamówieniami. */
const distinctMonths = (c: Client): number =>
  new Set(clientOrders(c).map(o => {
    const d = new Date(o.date);
    return `${d.getFullYear()}-${d.getMonth()}`;
  })).size;

/** Średni obrót roczny = suma / liczba lat aktywności. */
export const clientYearlyAvg = (c: Client): number => {
  const y = distinctYears(c);
  return y ? clientTotal(c) / y : 0;
};

/** Średni obrót miesięczny = suma / liczba miesięcy aktywności. */
export const clientMonthlyAvg = (c: Client): number => {
  const m = distinctMonths(c);
  return m ? clientTotal(c) / m : 0;
};

/** Formatowanie kwoty w PLN. */
export const zl = (n: number): string =>
  new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' zł';
