import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSignatureHtml, DEFAULT_SIGNATURE } from './emailSignature';

test('domyślny podpis: pozdrowienie, nazwisko, strona, telefon, e-mail', () => {
  const html = buildSignatureHtml(DEFAULT_SIGNATURE);
  assert.match(html, /^Pozdrawiam,<br>/);
  assert.match(html, /<strong[^>]*>Krzysztof Godek<\/strong>/);
  assert.match(html, /href="https:\/\/b2b\.antyramy\.eu\/"/);
  assert.match(html, /href="tel:\+48500601601"[^>]*>500 601 601</);
  assert.match(html, /href="mailto:biuro@antyramy\.eu"/);
});

test('puste pola są pomijane, strona bez protokołu dostaje https', () => {
  const html = buildSignatureHtml({ greeting: '', name: 'Krzysztof', website: 'antyramy.eu', phone: '', email: '' });
  assert.ok(!html.includes('tel:'));
  assert.ok(!html.includes('mailto:'));
  assert.match(html, /href="https:\/\/antyramy\.eu"[^>]*>antyramy\.eu</);
  assert.match(html, /^<strong/);
});

test('escapuje HTML w polach', () => {
  const html = buildSignatureHtml({ ...DEFAULT_SIGNATURE, name: '<b>X</b> & Y' });
  assert.match(html, /&lt;b&gt;X&lt;\/b&gt; &amp; Y/);
});
