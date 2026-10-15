import { describe, it, expect } from 'vitest';
import { buildOrderSendItems, formatOrderDateTime, positionsLabel, sortOrdersNewestFirst, orderPdfKey } from './supplierOrders';
import type { SupplierMaterial, SupplierOrder } from '../services/api';

const materials: SupplierMaterial[] = [
  { id: 'a', name: 'Szkło 3 mm', unit: 'm²', price: 42.5 },
  { id: 'b', name: 'Plecy HDF', unit: 'ark.', price: 18 },
  { id: 'c', name: 'Zawieszki', unit: 'szt', price: 0.2 },
];

describe('buildOrderSendItems — pozycje do wysyłki', () => {
  it('tylko ilość > 0, kolejność katalogu, bez cen', () => {
    expect(buildOrderSendItems(materials, { c: 100, a: 10, b: 0 })).toEqual([
      { materialId: 'a', name: 'Szkło 3 mm', quantity: 10, unit: 'm²' },
      { materialId: 'c', name: 'Zawieszki', quantity: 100, unit: 'szt' },
    ]);
  });
  it('brak ilości → pusta lista', () => {
    expect(buildOrderSendItems(materials, {})).toEqual([]);
  });
});

describe('formatOrderDateTime — czas polski', () => {
  it('UTC 08:30 w październiku to 10:30 w Polsce', () => {
    expect(formatOrderDateTime('2026-10-15T08:30:00.000Z')).toBe('15.10.2026, 10:30');
  });
  it('sama data (oznaczone ręcznie) bez godziny', () => {
    expect(formatOrderDateTime('2026-10-14')).toBe('14.10.2026');
  });
  it('zła data zostaje bez zmian', () => {
    expect(formatOrderDateTime('xx')).toBe('xx');
  });
});

describe('positionsLabel — odmiana', () => {
  it.each([[1, '1 pozycja'], [2, '2 pozycje'], [4, '4 pozycje'], [5, '5 pozycji'], [12, '12 pozycji'], [22, '22 pozycje'], [0, '0 pozycji']])(
    '%i → %s', (n, label) => expect(positionsLabel(n)).toBe(label),
  );
});

describe('sortOrdersNewestFirst', () => {
  it('od najnowszych, bez zmiany tablicy wejściowej', () => {
    const o = (id: string, sentAt: string) => ({ id, sentAt } as SupplierOrder);
    const input = [o('1', '2026-10-01T10:00:00Z'), o('2', '2026-10-15T10:00:00Z'), o('3', '2026-10-07T10:00:00Z')];
    expect(sortOrdersNewestFirst(input).map(x => x.id)).toEqual(['2', '3', '1']);
    expect(input[0].id).toBe('1');
  });
  it('ten sam dzień, starszy wpis bez recordedAt → porównanie po sentAt', () => {
    const sorted = sortOrdersNewestFirst([
      { id: 'stary', sentAt: '2026-10-15T08:00:00Z' } as SupplierOrder,
      { id: 'nowy', sentAt: '2026-10-15', recordedAt: '2026-10-15T09:00:00Z' } as SupplierOrder,
    ]);
    expect(sorted.map(x => x.id)).toEqual(['nowy', 'stary']);
  });
});

describe('sortOrdersNewestFirst — wpisy z CRM i oznaczone ręcznie', () => {
  it('sama data i pełny czas porównywane po dniu w Polsce, ten sam dzień → późniejszy zapis wyżej', () => {
    const o = (id: string, sentAt: string, recordedAt: string) => ({ id, sentAt, recordedAt } as SupplierOrder);
    const sorted = sortOrdersNewestFirst([
      o('gmail-14', '2026-10-14T09:00:00Z', '2026-10-14T09:00:00Z'),
      o('reczne-15', '2026-10-15', '2026-10-15T07:00:00Z'),
      o('gmail-15-noc', '2026-10-14T22:30:00Z', '2026-10-14T22:30:00Z'), // w Polsce już 15.10
      o('reczne-13', '2026-10-13', '2026-10-15T08:00:00Z'),
    ]);
    expect(sorted.map(x => x.id)).toEqual(['reczne-15', 'gmail-15-noc', 'gmail-14', 'reczne-13']);
  });
});

describe('orderPdfKey — czy pobrany PDF to aktualne zamówienie', () => {
  const items = [{ materialId: 'a', name: 'Szkło', quantity: 10, unit: 'm²' as const }];
  it('te same pozycje i uwagi → ten sam odcisk (spacje w uwagach bez znaczenia)', () => {
    expect(orderPdfKey(items, 'Pilne ')).toBe(orderPdfKey(items, 'Pilne'));
  });
  it('zmiana ilości albo uwag → inny odcisk', () => {
    expect(orderPdfKey([{ ...items[0], quantity: 11 }], 'Pilne')).not.toBe(orderPdfKey(items, 'Pilne'));
    expect(orderPdfKey(items, 'Inne')).not.toBe(orderPdfKey(items, 'Pilne'));
  });
});
