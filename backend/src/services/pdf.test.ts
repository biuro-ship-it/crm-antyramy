import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { generateSupplierOrderPdf, wrapLines } from './pdf';
import { orderPdfLayout, OrderItem } from './supplierOrders';

// Atrapa szerokości: każdy znak = 1 pkt
const measure = (s: string) => [...s].length;

describe('wrapLines — łamanie tekstu w PDF', () => {
  it('łamie po słowach', () => {
    assert.deepEqual(wrapLines('ala ma kota i psa', measure, 8), ['ala ma', 'kota i', 'psa']);
  });
  it('słowo dłuższe niż kolumna (link) dzieli po znakach — żadna linia nie wychodzi poza kolumnę', () => {
    const lines = wrapLines('Link: https://sklep.pl/bardzo-dlugi-adres-bez-spacji koniec', measure, 10);
    assert.ok(lines.every(l => measure(l) <= 10), JSON.stringify(lines));
    assert.equal(lines.join('').replace(/ /g, ''), 'Link:https://sklep.pl/bardzo-dlugi-adres-bez-spacjikoniec');
  });
  it('pusty tekst → brak linii', () => {
    assert.deepEqual(wrapLines('', measure, 10), []);
  });
});

describe('generateSupplierOrderPdf — PDF zamówienia (test dymny)', () => {
  const supplier = {
    companyName: 'Zakład Szklarski „Łąka” Żółć', email: 'zamowienia@laka.pl',
    address: { street: 'ul. Źródlana 5', zipCode: '33-100', city: 'Tarnów' },
  };
  const item = (n: number): OrderItem => ({ materialId: null, name: `Szkło ąćęłńóśźż nr ${n}`, quantity: n, unit: 'm²', unitPriceNet: null });
  const date = new Date('2026-10-15T10:00:00Z');

  it('polskie znaki — PDF powstaje', async () => {
    const pdf = await generateSupplierOrderPdf(orderPdfLayout({
      supplier, items: [item(1), item(2)], notes: 'Dostawa do piątku — proszę o fakturę. Gżegżółka', date,
    }));
    assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
  });

  it('200 pozycji → kilka stron; długi link i emoji w uwagach nie wywracają generowania', async () => {
    const pdf = await generateSupplierOrderPdf(orderPdfLayout({
      supplier, items: Array.from({ length: 200 }, (_, i) => item(i + 1)),
      notes: 'Zdjęcie: https://sklep.pl/' + 'x'.repeat(300) + ' 📦👍', date,
    }));
    const pages = (await PDFDocument.load(pdf)).getPageCount();
    assert.ok(pages >= 3, `stron: ${pages}`);
  });
});
