import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderPlaceholders, buildCampaignEmailHtml, renderForClient, splitAB,
  pickPendingBatch, applyBatchResults, variantContent, UNSUBSCRIBE_TEXT,
  CampaignRecipient, CampaignCounts,
} from './campaignRender';

const client = {
  salutation: 'Panie Marku',
  companyName: 'Foto & Rama',
  contactPerson: 'Marek Nowak',
  address: { city: 'Kraków' },
};

test('placeholdery: zwrot, firma, miasto i wewnętrzny imie', () => {
  assert.equal(
    renderPlaceholders('{zwrot}, oferta dla {firma} z {miasto} ({imie})', client, { html: false }),
    'Panie Marku, oferta dla Foto & Rama z Kraków (Marek)',
  );
});

test('placeholdery: tekst zastępczy tylko przy pustym polu', () => {
  assert.equal(renderPlaceholders('{zwrot|Dzień dobry},', client, { html: false }), 'Panie Marku,');
  assert.equal(renderPlaceholders('{zwrot|Dzień dobry},', { ...client, salutation: '  ' }, { html: false }), 'Dzień dobry,');
  assert.equal(renderPlaceholders('{zwrot},', { companyName: 'X' }, { html: false }), ',');
});

test('placeholdery: client = null daje same teksty zastępcze', () => {
  assert.equal(renderPlaceholders('{zwrot|Dzień dobry} {firma}', null, { html: false }), 'Dzień dobry ');
});

test('placeholdery: nieznane zostają bez zmian', () => {
  assert.equal(renderPlaceholders('{cena} {imię} {zwrot', client, { html: false }), '{cena} {imię} {zwrot');
});

test('placeholdery: w HTML wartości są escapowane, w temacie nie', () => {
  assert.equal(renderPlaceholders('{firma}', client, { html: true }), 'Foto &amp; Rama');
  assert.equal(renderPlaceholders('{firma}', client, { html: false }), 'Foto & Rama');
});

test('mail bez produktów: bez tabeli i zdania o PDF, z wypisem i podpisem', () => {
  const html = buildCampaignEmailHtml({ title: '', contentHtml: 'a\nb', products: null, signatureHtml: 'PODPIS' });
  assert.ok(!html.includes('Produkty objęte ofertą'));
  assert.ok(!html.includes('załączonym pliku PDF'));
  assert.ok(html.includes('a<br>b'));
  assert.ok(html.includes('PODPIS'));
  assert.ok(html.includes(UNSUBSCRIBE_TEXT));
  assert.ok(!html.includes('<h1'));
});

test('mail z produktami: tabela, tytuł, escapowane nazwy', () => {
  const html = buildCampaignEmailHtml({
    title: 'Nowa listwa',
    contentHtml: 'x',
    products: [{ id: 'p1', name: 'Rama <A4>', code: 'R1', priceNetto: 9.99, imageUrl: '' }],
    signatureHtml: '',
  });
  assert.ok(html.includes('Produkty objęte ofertą'));
  assert.ok(html.includes('Rama &lt;A4&gt;'));
  assert.ok(html.includes('9.99 zł netto'));
  assert.ok(html.includes('>Nowa listwa</h1>'));
});

test('wariant B: własny temat, treść wspólna z A gdy null', () => {
  const a = { subject: 'A', content: 'treść A' };
  assert.deepEqual(variantContent(a, { subject: 'B', content: null }, 'B'), { subject: 'B', content: 'treść A' });
  assert.deepEqual(variantContent(a, { subject: 'B', content: 'treść B' }, 'B'), { subject: 'B', content: 'treść B' });
  assert.deepEqual(variantContent(a, null, 'B'), a);
});

test('renderForClient: temat i treść z placeholderami', () => {
  const r = renderForClient({
    variant: { subject: '{zwrot|Dzień dobry}, nowość', content: '{zwrot|Dzień dobry},\nmamy ofertę dla {firma}' },
    title: '', products: null, signatureHtml: '', client,
  });
  assert.equal(r.subject, 'Panie Marku, nowość');
  assert.ok(r.html.includes('Panie Marku,<br>mamy ofertę dla Foto &amp; Rama'));
  assert.equal(r.plainContent, 'Panie Marku,\nmamy ofertę dla Foto & Rama');
});

test('splitAB: po równo, każdy dokładnie raz', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  let seed = 1;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const split = splitAB(ids, rng);
  assert.deepEqual(Object.keys(split).sort(), ids);
  const a = Object.values(split).filter(v => v === 'A').length;
  assert.equal(a, 3);
  assert.equal(Object.values(split).length - a, 2);
});

const rec = (clientId: string, status: CampaignRecipient['status'] = 'pending'): CampaignRecipient => ({
  clientId, companyName: clientId, email: `${clientId}@x.pl`, variant: 'A', status,
  error: null, gmailMessageId: null, gmailThreadId: null, sentAt: null,
});
const counts: CampaignCounts = { total: 0, sent: 0, failed: 0, skippedNoEmail: 1, skippedNoMarketing: 2 };

test('pickPendingBatch: tylko pending, najwyżej N', () => {
  const list = [rec('a', 'sent'), rec('b'), rec('c'), rec('d', 'failed'), rec('e')];
  assert.deepEqual(pickPendingBatch(list, 2).map(r => r.clientId), ['b', 'c']);
});

test('applyBatchResults: nanosi wyniki, nie cofa rozliczonych, liczy', () => {
  const list = [rec('a', 'sent'), rec('b'), rec('c'), rec('d')];
  const out = applyBatchResults(list, [
    { clientId: 'a', ok: false, error: 'nie powinno' },
    { clientId: 'b', ok: true, gmailMessageId: 'm1', gmailThreadId: 't1', sentAt: '2026-09-28T10:00:00Z' },
    { clientId: 'c', ok: false, error: 'Brak skrzynki' },
  ], counts);
  assert.equal(out.recipients[0].status, 'sent');
  assert.equal(out.recipients[1].gmailThreadId, 't1');
  assert.equal(out.recipients[2].error, 'Brak skrzynki');
  assert.equal(out.pending, 1);
  assert.deepEqual(out.counts, { total: 4, sent: 2, failed: 1, skippedNoEmail: 1, skippedNoMarketing: 2 });
});
