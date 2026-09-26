import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNip, planBulkSync, SyncClient } from './fakturowniaSync';
import { FakturowniaSalesInvoice } from './fakturownia';

const inv = (id: number, buyerTaxNo: string, priceNet: number, issueDate: string, extra: Partial<FakturowniaSalesInvoice> = {}): FakturowniaSalesInvoice => ({
  id, number: `FV/${id}`, issueDate, sellDate: issueDate, paymentTo: '', priceNet, priceGross: priceNet * 1.23,
  currency: 'PLN', status: 'paid', kind: 'vat',
  buyerTaxNo, buyerName: `Firma ${buyerTaxNo}`, buyerEmail: '', buyerPhone: '', buyerPerson: '',
  ...extra,
});

describe('normalizeNip', () => {
  it('akceptuje myślniki, spacje i prefiks PL', () => {
    assert.equal(normalizeNip('123-456-78-90'), '1234567890');
    assert.equal(normalizeNip('PL 1234567890'), '1234567890');
  });
  it('odrzuca niepełny lub pusty NIP', () => {
    assert.equal(normalizeNip('12345'), '');
    assert.equal(normalizeNip(undefined), '');
  });
});

describe('planBulkSync', () => {
  const now = '2026-09-26T12:00:00.000Z';

  it('podmienia wpisy z faktur, zostawia ręczne i sortuje od najnowszych', () => {
    const clients: SyncClient[] = [{
      id: 'a', companyName: 'A', nip: '123-456-78-90',
      orders: [
        { id: 'manual-1', amount: 50, date: '2026-01-01' },
        { id: 'fv-999', amount: 10, date: '2025-01-01' }, // stary wpis z faktury — ma zniknąć
      ],
    }];
    const { updates, summary } = planBulkSync(clients, [
      inv(1, 'PL1234567890', 100, '2026-03-01'),
      inv(2, '1234567890', 200, '2026-05-01'),
    ], now);

    assert.equal(updates.length, 1);
    const orders = updates[0].data.orders as { id: string }[];
    assert.deepEqual(orders.map(o => o.id), ['manual-1', 'fv-2', 'fv-1']);
    const fv = updates[0].data.fakturowniaInvoices as { id: number }[];
    assert.deepEqual(fv.map(i => i.id), [2, 1]);
    assert.equal(summary.invoicesMatched, 2);
    assert.equal(summary.updatedClients, 1);
  });

  it('korekty (kwota ujemna) nie trafiają do sprzedaży, ale są na liście faktur', () => {
    const { updates } = planBulkSync(
      [{ id: 'a', nip: '1234567890' }],
      [inv(1, '1234567890', 100, '2026-03-01'), inv(2, '1234567890', -30, '2026-04-01', { kind: 'correction' })],
      now,
    );
    assert.deepEqual((updates[0].data.orders as { id: string }[]).map(o => o.id), ['fv-1']);
    assert.equal((updates[0].data.fakturowniaInvoices as unknown[]).length, 2);
  });

  it('uzupełnia tylko puste dane kontaktowe', () => {
    const { updates } = planBulkSync(
      [{ id: 'a', nip: '1234567890', email: 'stary@firma.pl', phone: '' }],
      [inv(1, '1234567890', 100, '2026-03-01', { buyerEmail: 'nowy@firma.pl', buyerPhone: '600100200' })],
      now,
    );
    assert.equal(updates[0].data.email, undefined);
    assert.equal(updates[0].data.phone, '600100200');
  });

  it('raportuje klientów bez NIP, bez faktur i nabywców spoza CRM', () => {
    const { updates, summary } = planBulkSync(
      [
        { id: 'a', companyName: 'Bez NIP', nip: '' },
        { id: 'b', companyName: 'Bez faktur', nip: '1111111111' },
      ],
      [
        inv(1, '2222222222', 100, '2026-03-01'),
        inv(2, '2222222222', 100, '2026-03-02'),
        inv(3, '', 100, '2026-03-03'),
      ],
      now,
    );
    assert.equal(updates.length, 0);
    assert.deepEqual(summary.noNip, ['Bez NIP']);
    assert.deepEqual(summary.noInvoices, ['Bez faktur']);
    assert.deepEqual(summary.unmatchedBuyers, [{ nip: '2222222222', name: 'Firma 2222222222', count: 2 }]);
    assert.equal(summary.invoicesWithoutNip, 1);
  });
});
