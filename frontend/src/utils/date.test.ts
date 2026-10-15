import { describe, it, expect } from 'vitest';
import { todayISO, isPastDate, daysAgoISO } from './date';

describe('daysAgoISO — najwcześniejsza data wysyłki zamówienia', () => {
  it('365 dni wstecz, przez przełom roku i rok przestępny', () => {
    expect(daysAgoISO(365, new Date(2026, 9, 15, 12))).toBe('2025-10-15');
    expect(daysAgoISO(1, new Date(2026, 0, 1, 12))).toBe('2025-12-31');
    expect(daysAgoISO(0, new Date(2028, 1, 29, 12))).toBe('2028-02-29');
  });
});

describe('todayISO — data lokalna, nie UTC', () => {
  it('formatuje jako YYYY-MM-DD z wiodącymi zerami', () => {
    expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(todayISO(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('o 00:30 czasu lokalnego zwraca dzisiejszą datę, a nie wczorajszą', () => {
    // Ten przypadek był błędem: toISOString() dawał tu jeszcze poprzedni dzień,
    // bo Polska jest przed UTC. Data konstruowana lokalnie, więc test jest
    // niezależny od strefy maszyny.
    const nocą = new Date(2026, 8, 12, 0, 30);
    expect(todayISO(nocą)).toBe('2026-09-12');
  });

  it('o 23:30 czasu lokalnego nie przeskakuje na następny dzień', () => {
    expect(todayISO(new Date(2026, 8, 12, 23, 30))).toBe('2026-09-12');
  });

  it('bez argumentu zwraca dziś według zegara przeglądarki', () => {
    const now = new Date();
    expect(todayISO()).toBe(todayISO(now));
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('isPastDate', () => {
  const dzień = 86_400_000;

  it('wczorajsza data jest przeszła, dzisiejsza nie', () => {
    expect(isPastDate(todayISO(new Date(Date.now() - dzień)))).toBe(true);
    expect(isPastDate(todayISO())).toBe(false);
  });

  it('przyszła data nie jest przeszła', () => {
    expect(isPastDate(todayISO(new Date(Date.now() + dzień)))).toBe(false);
  });

  it('puste wejście nie jest przeszłe (brak terminu ≠ zaległe)', () => {
    expect(isPastDate('')).toBe(false);
  });
});
