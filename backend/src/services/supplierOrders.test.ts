import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrderItems, estimatedTotalNet, buildOrderEntry, orderInteraction, orderPdfLayout,
  orderPdfFilename, orderPdfLocationFromUrl, orderBodyToHtml, ORDERING_COMPANY, OrderItem,
  buildManualOrderEntry, sentDateError, pdfDateFrom, warsawDate, orderAttachmentName, isValidRecipient,
} from './supplierOrders';

const catalog = [
  { id: 'm1', name: 'Szkło 3 mm', unit: 'm²', price: 42.5 },
  { id: 'm2', name: 'Plecy HDF', unit: 'ark.', price: 18 },
];

const items: OrderItem[] = [
  { materialId: 'm1', name: 'Szkło 3 mm', quantity: 10, unit: 'm²', unitPriceNet: 42.5 },
  { materialId: 'm2', name: 'Plecy HDF', quantity: 3, unit: 'ark.', unitPriceNet: 18 },
];

describe('buildOrderItems — pozycje zamówienia', () => {
  it('pusta lista, NaN, nieskończoność, ilość ujemna → brak pozycji', () => {
    assert.deepEqual(buildOrderItems([], catalog), []);
    assert.deepEqual(buildOrderItems([
      { name: 'A', quantity: NaN, unit: 'szt' },
      { name: 'B', quantity: Infinity, unit: 'szt' },
      { name: 'C', quantity: -2, unit: 'szt' },
    ], catalog), []);
  });
  it('cena w katalogu nie-liczbowa → brak ceny (null), nie NaN', () => {
    const out = buildOrderItems([{ materialId: 'x', name: 'X', quantity: 1, unit: 'szt' }],
      [{ id: 'x', name: 'X', unit: 'szt', price: '12' as unknown as number }]);
    assert.equal(out[0].unitPriceNet, null);
  });
  it('pomija ilość 0 i puste nazwy, przycina nazwy, dobiera cenę z katalogu', () => {
    const out = buildOrderItems([
      { materialId: 'm1', name: '  Szkło 3 mm ', quantity: 10, unit: 'm²' },
      { materialId: 'm2', name: 'Plecy HDF', quantity: 0, unit: 'ark.' },
      { name: '   ', quantity: 5, unit: 'szt' },
      { materialId: 'brak', name: 'Spoza katalogu', quantity: 2, unit: 'kpl' },
    ], catalog);
    assert.deepEqual(out, [
      { materialId: 'm1', name: 'Szkło 3 mm', quantity: 10, unit: 'm²', unitPriceNet: 42.5 },
      { materialId: 'brak', name: 'Spoza katalogu', quantity: 2, unit: 'kpl', unitPriceNet: null },
    ]);
  });
});

describe('estimatedTotalNet — wartość wg cennika CRM', () => {
  it('sumuje pozycje z ceną, zaokrągla do groszy', () => {
    assert.equal(estimatedTotalNet(items), 479);
    assert.equal(estimatedTotalNet([{ ...items[0], quantity: 1, unitPriceNet: 0.105 }, { ...items[1], unitPriceNet: null }]), 0.11);
  });
  it('null, gdy żadna pozycja nie ma ceny', () => {
    assert.equal(estimatedTotalNet([{ ...items[0], unitPriceNet: null }]), null);
  });
});

describe('buildOrderEntry — wpis Historii zamówień', () => {
  const base = {
    sentAt: new Date('2026-10-15T08:30:00.000Z'), to: 'dostawca@x.pl', subject: 'Zamówienie — Antyramy (15.10.2026)',
    body: 'Dzień dobry,\n…', items, notes: '  Dostawa do piątku  ', sentBy: 'biuro@antyramy.eu',
    gmail: { id: 'g1', threadId: 't1' }, pdfUrl: 'https://crm.antyramy.eu/uploads/zamowienie-2026-10-15-abcdef12.pdf',
    pdfFilename: 'zamowienie-2026-10-15-abcdef12.pdf',
  };
  it('zawiera wszystkie wymagane pola', () => {
    assert.deepEqual(buildOrderEntry(base), {
      method: 'gmail', sentAt: '2026-10-15T08:30:00.000Z', recordedAt: '2026-10-15T08:30:00.000Z', recordedBy: 'biuro@antyramy.eu',
      to: 'dostawca@x.pl', subject: base.subject, body: base.body, items,
      notes: 'Dostawa do piątku', note: '', estimatedTotalNet: 479, sentBy: 'biuro@antyramy.eu',
      gmailMessageId: 'g1', gmailThreadId: 't1', pdfUrl: base.pdfUrl, pdfFilename: base.pdfFilename,
    });
  });
  it('brak nadawcy i identyfikatora Gmail', () => {
    const e = buildOrderEntry({ ...base, sentBy: undefined, gmail: { id: null, threadId: null } });
    assert.equal(e.sentBy, 'Nieznany');
    assert.equal(e.gmailMessageId, null);
  });
  it('krótki wpis w historii kontaktów', () => {
    const i = orderInteraction(buildOrderEntry(base));
    assert.equal(i.contactDate, '2026-10-15');
    assert.equal(i.channel, 'mail');
    assert.match(i.notes, /^📦 Zamówienie wysłane: 2 poz\./);
    assert.equal(i.tradeNotes, 'Do: dostawca@x.pl · Zamówienie — Antyramy (15.10.2026)');
  });
});

describe('orderPdfLayout — dane do PDF', () => {
  it('zamawiający, dostawca, data w strefie Warszawy, wiersze bez cen', () => {
    const l = orderPdfLayout({
      supplier: { companyName: ' Szklarz ', email: 'dostawca@x.pl', address: { street: 'ul. Długa 1', zipCode: '33-100', city: 'Tarnów' } },
      items: [...items, { ...items[0], name: 'Ułamek', quantity: 2.5 }], notes: ' Pilne ',
      date: new Date('2026-10-14T23:30:00.000Z'), // w Polsce już 15.10
    });
    assert.equal(l.dateLabel, 'Data: 15.10.2026');
    assert.equal(l.buyer[0], ORDERING_COMPANY.name);
    assert.ok(l.buyer.includes(`NIP ${ORDERING_COMPANY.nip}`));
    assert.deepEqual(l.supplier, ['Szklarz', 'ul. Długa 1', '33-100 Tarnów', 'dostawca@x.pl']);
    assert.deepEqual(l.rows, [['1', 'Szkło 3 mm', '10', 'm²'], ['2', 'Plecy HDF', '3', 'ark.'], ['3', 'Ułamek', '2,5', 'm²']]);
    assert.equal(l.notes, 'Pilne');
    assert.ok(!JSON.stringify(l).includes('42'), 'ceny nie trafiają do PDF');
  });
  it('dostawca bez adresu', () => {
    const l = orderPdfLayout({ supplier: { companyName: 'X', email: 'x@x.pl' }, items, notes: '', date: new Date() });
    assert.deepEqual(l.supplier, ['X', 'x@x.pl']);
  });
});

describe('plik PDF zamówienia', () => {
  it('nazwa z datą i bezpieczną losową końcówką', () => {
    assert.equal(orderPdfFilename(new Date('2026-10-15T10:00:00Z'), 'ABCdef12/../'), 'zamowienie-2026-10-15-ABCdef12.pdf');
  });
  it('data polska, nie UTC (o 0:30 w Polsce już nowy dzień)', () => {
    const lateNight = new Date('2026-10-15T22:30:00Z');
    assert.equal(orderPdfFilename(lateNight, 'abcdef12'), 'zamowienie-2026-10-16-abcdef12.pdf');
    assert.equal(orderAttachmentName(lateNight), 'Zamowienie-2026-10-16.pdf');
  });
  it('za krótka losowa końcówka → błąd (sprzątanie by jej nie rozpoznało)', () => {
    assert.throws(() => orderPdfFilename(new Date(), 'abc'), /krótka/);
    assert.throws(() => orderPdfFilename(new Date(), '../../!!'), /krótka/);
  });
  it('nazwa tam i z powrotem: utworzony plik zawsze rozpoznany przy sprzątaniu', () => {
    for (const hex of ['abcdef12', 'a'.repeat(24), 'f'.repeat(40)]) {
      const name = orderPdfFilename(new Date('2026-10-15T10:00:00Z'), hex);
      assert.deepEqual(orderPdfLocationFromUrl(`https://crm.antyramy.eu/uploads/orders/${name}`), { filename: name, subdir: 'orders' });
    }
  });
  it('położenie z adresu: nowe w orders/, stare w uploads/, inne pliki → null', () => {
    assert.deepEqual(orderPdfLocationFromUrl('https://crm.antyramy.eu/uploads/orders/zamowienie-2026-10-15-abcdef12.pdf'),
      { filename: 'zamowienie-2026-10-15-abcdef12.pdf', subdir: 'orders' });
    assert.deepEqual(orderPdfLocationFromUrl('https://crm.antyramy.eu/uploads/zamowienie-2026-10-15-abcdef12.pdf'),
      { filename: 'zamowienie-2026-10-15-abcdef12.pdf' });
    assert.equal(orderPdfLocationFromUrl('https://crm.antyramy.eu/uploads/cennik-123.pdf'), null);
    assert.equal(orderPdfLocationFromUrl('https://crm.antyramy.eu/uploads/suppliers/zamowienie-2026-10-15-abcdef12.pdf'), null);
    assert.equal(orderPdfLocationFromUrl('https://crm.antyramy.eu/uploads/../zamowienie-2026-10-15-abcdef12.pdf/x'), null);
    assert.equal(orderPdfLocationFromUrl(undefined), null);
  });
});

describe('isValidRecipient — adres dostawcy jako adresat', () => {
  it('pojedynczy adres przechodzi', () => {
    assert.equal(isValidRecipient('zamowienia@dostawca.pl'), true);
    assert.equal(isValidRecipient('jan.kowalski+crm@sklep.com.pl'), true);
  });
  it('kilka adresów, spacje, nawiasy, brak domeny, nowe linie → odrzucone', () => {
    for (const bad of ['', 'a@b', 'a@b.pl, c@d.pl', 'a@b.pl;c@d.pl', 'Jan <a@b.pl>', 'a b@c.pl', 'a@b.pl\r\nBcc: x@y.pl', '"a"@b.pl',
      `${'a'.repeat(250)}@b.pl`]) {
      assert.equal(isValidRecipient(bad), false, bad);
    }
  });
});

describe('orderBodyToHtml — treść maila', () => {
  it('zabezpiecza znaki HTML i zachowuje nowe linie', () => {
    const html = orderBodyToHtml('Dzień dobry,\r\n<b>10 szt</b> & "pilne"');
    assert.ok(html.includes('Dzień dobry,<br>&lt;b&gt;10 szt&lt;/b&gt; &amp; &quot;pilne&quot;'));
  });
});

describe('„Oznacz jako wysłane” — wpis bez wysyłki z CRM', () => {
  const manual = buildManualOrderEntry({
    sentDate: '2026-10-14', recordedAt: new Date('2026-10-15T09:00:00.000Z'), to: 'dostawca@x.pl', items,
    notes: ' Uwagi ', note: ' Wysłane z Outlooka ', recordedBy: 'krzysiekgodek@gmail.com',
    pdfUrl: 'https://crm.antyramy.eu/uploads/zamowienie-2026-10-15-abcdef12.pdf', pdfFilename: 'zamowienie-2026-10-15-abcdef12.pdf',
  });
  it('data wysyłki osobno od daty zapisu, kto oznaczył, notatka, bez danych maila', () => {
    assert.equal(manual.method, 'manual');
    assert.equal(manual.sentAt, '2026-10-14');
    assert.equal(manual.recordedAt, '2026-10-15T09:00:00.000Z');
    assert.equal(manual.recordedBy, 'krzysiekgodek@gmail.com');
    assert.equal(manual.note, 'Wysłane z Outlooka');
    assert.equal(manual.notes, 'Uwagi');
    assert.equal(manual.subject, null);
    assert.equal(manual.body, null);
    assert.equal(manual.gmailMessageId, null);
    assert.equal(manual.estimatedTotalNet, 479);
  });
  it('wpis w kontaktach z datą wysyłki i notatką', () => {
    const i = orderInteraction(manual);
    assert.equal(i.contactDate, '2026-10-14');
    assert.match(i.notes, /poza CRM/);
    assert.equal(i.tradeNotes, 'Notatka: Wysłane z Outlooka');
  });
  it('wpis gmail w kontaktach z datą polską (po północy w Polsce)', () => {
    const e = buildOrderEntry({
      sentAt: new Date('2026-10-14T22:30:00.000Z'), to: 'a@b.pl', subject: 'S', body: 'B', items, notes: '', sentBy: 'x',
      gmail: { id: null, threadId: null }, pdfUrl: '', pdfFilename: '',
    });
    assert.equal(orderInteraction(e).contactDate, '2026-10-15');
  });
});

describe('sentDateError — data wysyłki z okna', () => {
  const now = new Date('2026-10-15T10:00:00.000Z');
  it('dziś i wczoraj są poprawne', () => {
    assert.equal(sentDateError('2026-10-15', now), null);
    assert.equal(sentDateError('2026-10-14', now), null);
  });
  it('przyszłość, zły format, nieistniejąca data, starsza niż rok', () => {
    assert.match(sentDateError('2026-10-16', now) ?? '', /przyszłości/);
    assert.match(sentDateError('15.10.2026', now) ?? '', /Nieprawidłowa/);
    assert.match(sentDateError('2026-02-30', now) ?? '', /Nieprawidłowa/);
    assert.match(sentDateError('2025-01-01', now) ?? '', /starsza/);
  });
  it('granica roku: 2025-10-14 jeszcze tak, 2025-10-13 już nie', () => {
    assert.equal(sentDateError('2025-10-14', now), null);
    assert.match(sentDateError('2025-10-13', now) ?? '', /starsza/);
  });
  it('o 00:30 w Polsce „dziś” to już nowy dzień', () => {
    assert.equal(sentDateError('2026-10-16', new Date('2026-10-15T22:30:00.000Z')), null);
    assert.equal(warsawDate(new Date('2026-10-15T22:30:00.000Z')), '2026-10-16');
  });
});

describe('pdfDateFrom — data na kopii PDF', () => {
  const now = new Date('2026-10-15T10:00:00.000Z');
  it('chwila pobrania z ostatnich 30 dni zostaje', () => {
    assert.equal(pdfDateFrom('2026-10-15T08:00:00.000Z', now).toISOString(), '2026-10-15T08:00:00.000Z');
  });
  it('brak, śmieci, przyszłość lub stara data → teraz', () => {
    assert.equal(pdfDateFrom(undefined, now), now);
    assert.equal(pdfDateFrom('xx', now), now);
    assert.equal(pdfDateFrom('2026-10-16T10:00:00.000Z', now), now);
    assert.equal(pdfDateFrom('2026-08-01T10:00:00.000Z', now), now);
  });
  it('granice: +5 min i −30 dni', () => {
    assert.equal(pdfDateFrom('2026-10-15T10:05:00.000Z', now).toISOString(), '2026-10-15T10:05:00.000Z');
    assert.equal(pdfDateFrom('2026-10-15T10:05:01.000Z', now), now);
    assert.equal(pdfDateFrom('2026-09-15T10:00:00.000Z', now).toISOString(), '2026-09-15T10:00:00.000Z');
    assert.equal(pdfDateFrom('2026-09-15T09:59:59.000Z', now), now);
  });
});
