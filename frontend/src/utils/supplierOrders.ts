// Zamówienia do dostawców — czyste funkcje dla karty dostawcy (testy: supplierOrders.test.ts).
import type { SupplierMaterial, SupplierOrder, SupplierOrderSendData } from '../services/api';

/** Pozycje do wysyłki: tylko surowce z ilością > 0, w kolejności katalogu. */
export const buildOrderSendItems = (
  materials: SupplierMaterial[],
  quantities: Record<string, number>,
): SupplierOrderSendData['items'] =>
  materials
    .filter(m => (quantities[m.id] ?? 0) > 0)
    .map(m => ({ materialId: m.id, name: m.name, quantity: quantities[m.id], unit: m.unit }));

/** „15.10.2026, 10:30” — zawsze czas polski. */
export const formatOrderDateTime = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
};

/** „1 pozycja”, „3 pozycje”, „5 pozycji”, „22 pozycje”. */
export const positionsLabel = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return '1 pozycja';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} pozycje`;
  return `${n} pozycji`;
};

export const sortOrdersNewestFirst = (orders: SupplierOrder[]): SupplierOrder[] =>
  [...orders].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
