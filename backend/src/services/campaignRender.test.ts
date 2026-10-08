import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import {
  renderPlaceholders, buildCampaignEmailHtml, renderForClient, splitAB,
  pickPendingBatch, applyBatchResults, variantContent, UNSUBSCRIBE_TEXT,
  campaignContentError, testSubject,
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

// ─── Kolaż (heroImageUrl) ───────────────────────────────────────────────────

// Wzorce HTML zapisane z kodu SPRZED dodania kolażu (2026-10-07) — te same dane wejściowe
const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, '__fixtures__', name), 'utf-8').replace(/\r\n/g, '\n');
const fixtureInputs = {
  withProducts: {
    variant: { subject: '{zwrot|Dzień dobry} — nowa listwa', content: '{zwrot|Dzień dobry},\n\noferta dla {firma} <b>!</b>' },
    title: 'Nowa listwa "Dąb"',
    products: [{ id: 'p1', name: 'Rama <A4>', code: 'R1', priceNetto: 9.99, imageUrl: 'https://crm.antyramy.eu/uploads/produkt-1.jpg' }],
    signatureHtml: 'Pozdrawiam<br>PODPIS',
    client: { salutation: 'Panie Marku', companyName: 'Foto & Rama', address: { city: 'Kraków' } },
  },
  noProducts: {
    variant: { subject: 'Temat', content: 'Sam tekst' },
    title: '', products: null, signatureHtml: '', client: null,
  },
};

test('mail bez kolażu: HTML identyczny jak przed zmianą (wzorzec)', () => {
  for (const hero of [undefined, null, '']) {
    assert.equal(renderForClient({ ...fixtureInputs.withProducts, heroImageUrl: hero }).html, fixture('campaign-email-with-products.html'));
    assert.equal(renderForClient({ ...fixtureInputs.noProducts, heroImageUrl: hero }).html, fixture('campaign-email-no-products.html'));
  }
});

const HERO = 'https://crm.antyramy.eu/uploads/kolaz-1.jpg';

test('mail z kolażem: <img> 600 px między tytułem a treścią, alt z tytułu', () => {
  const html = renderForClient({ ...fixtureInputs.withProducts, heroImageUrl: HERO }).html;
  const img = `<img src="${HERO}" width="600" alt="Oferta tygodnia - Nowa listwa &quot;Dąb&quot;" style="display:block;width:100%;max-width:600px;height:auto;border:0;">`;
  assert.ok(html.includes(img), html);
  assert.equal(html.split('<img').length - 1, 1);
  const iTitle = html.indexOf('</h1>');
  const iImg = html.indexOf('<img');
  const iContent = html.indexOf('Panie Marku,');
  assert.ok(iTitle < iImg && iImg < iContent);
  // Poza blokiem kolażu — reszta jak dawniej
  assert.equal(html.replace(/\n {8}<tr><td style="padding:0 0 24px">[\s\S]*?<\/td><\/tr>/, ''), fixture('campaign-email-with-products.html'));
});

test('mail z kolażem bez tytułu: alt z tematu po placeholderach', () => {
  const html = renderForClient({
    variant: { subject: '{zwrot|Dzień dobry}, nowa rama', content: 'x' },
    title: '  ', products: null, signatureHtml: '', heroImageUrl: HERO,
    client: { salutation: 'Pani Ewo' },
  }).html;
  assert.ok(html.includes('alt="Oferta tygodnia - Pani Ewo, nowa rama"'));
});

test('mail z kolażem: URL i alt escapowane', () => {
  const html = buildCampaignEmailHtml({
    title: 'x', contentHtml: 'y', products: null, signatureHtml: '',
    heroImageUrl: 'https://crm.antyramy.eu/uploads/kolaz-1.jpg?a=1&b="><script>alert(1)</script>',
    heroAlt: 'Oferta tygodnia - Rama "Dąb" <A4> & więcej',
  });
  assert.ok(html.includes('src="https://crm.antyramy.eu/uploads/kolaz-1.jpg?a=1&amp;b=&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"'));
  assert.ok(html.includes('alt="Oferta tygodnia - Rama &quot;Dąb&quot; &lt;A4&gt; &amp; więcej"'));
  assert.ok(!html.includes('<script>'));
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

// ─── Walidacja treści i wysyłka testowa ─────────────────────────────────────

test('campaignContentError: komplet treści przechodzi, braki dają komunikat', () => {
  const a = { subject: 'Temat', content: 'Treść' };
  assert.equal(campaignContentError({ variantA: a, variantB: null }), null);
  assert.equal(campaignContentError({ variantA: a, variantB: { subject: 'B', content: null } }), null);
  assert.match(campaignContentError({ variantA: { subject: '  ', content: 'x' }, variantB: null })!, /temat maila/);
  assert.match(campaignContentError({ variantA: { subject: 'x', content: ' \n' }, variantB: null })!, /treść maila/);
  assert.match(campaignContentError({ variantA: a, variantB: { subject: '', content: null } })!, /temat wariantu B/);
  assert.match(campaignContentError({ variantA: a, variantB: { subject: 'B', content: '  ' } })!, /treść wariantu B/);
  assert.match(campaignContentError({})!, /temat maila/);
});

test('testSubject: znacznik [TEST], przy A/B z literą wariantu', () => {
  assert.equal(testSubject('Nowa oferta', null), '[TEST] Nowa oferta');
  assert.equal(testSubject('Nowa oferta', 'A'), '[TEST A] Nowa oferta');
  assert.equal(testSubject('Inny temat', 'B'), '[TEST B] Inny temat');
});
