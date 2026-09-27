import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupLegacyPromotions, LegacyInteraction } from './promotionBackfill';

const base: LegacyInteraction = {
  clientId: 'c1',
  companyName: 'Foto A',
  email: 'a@x.pl',
  contactDate: '2026-05-10',
  notes: 'Wysłano promocję: Wiosna',
  tradeNotes: 'Treść oferty',
  products: ['p1', 'p2'],
  createdBy: 'biuro@antyramy.eu',
  createdAt: '2026-05-10T09:00:00.000Z',
};

test('grupuje wpisy tej samej wysyłki w jedną kampanię', () => {
  const groups = groupLegacyPromotions([
    base,
    { ...base, clientId: 'c2', companyName: 'Foto B', email: 'b@x.pl', createdAt: '2026-05-10T08:59:59.000Z' },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, 'Wiosna');
  assert.equal(groups[0].content, 'Treść oferty');
  assert.deepEqual(groups[0].productIds, ['p1', 'p2']);
  assert.equal(groups[0].recipients.length, 2);
  assert.equal(groups[0].sentAt, '2026-05-10T08:59:59.000Z'); // najwcześniejszy wpis
});

test('inny dzień, tytuł lub treść to osobna kampania', () => {
  const groups = groupLegacyPromotions([
    base,
    { ...base, contactDate: '2026-05-11', createdAt: '2026-05-11T09:00:00.000Z' },
    { ...base, notes: 'Wysłano promocję: Lato' },
    { ...base, tradeNotes: 'Inna treść' },
  ]);
  assert.equal(groups.length, 4);
});

test('pomija zwykłe kontakty i liczy klienta raz', () => {
  const groups = groupLegacyPromotions([
    base,
    { ...base },                                   // ten sam klient drugi raz
    { ...base, notes: 'Rozmowa o cenach' },        // zwykły kontakt
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].recipients.length, 1);
});

test('brak createdAt — data z contactDate, sortowanie rosnąco', () => {
  const groups = groupLegacyPromotions([
    { ...base, contactDate: '2026-06-01', createdAt: undefined },
    { ...base, contactDate: '2026-04-01', createdAt: undefined },
  ]);
  assert.deepEqual(groups.map(g => g.sentAt), ['2026-04-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z']);
});
