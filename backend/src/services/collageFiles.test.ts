import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  normalizeHeroImageUrl, resolveHeroImageInput, heroUrlPolicy, collageFilename, collageFilenameFromUrl,
  planHeroImageChange, releaseCollageFile, HERO_URL_ERROR,
} from './collageFiles';

const PROD = { allowLocalhost: false };
const DEV = { allowLocalhost: true };
const GOOD = 'https://crm.antyramy.eu/uploads/kolaz-1759860000000-123456.jpg';

// ─── Walidacja adresu ───────────────────────────────────────────────────────

test('adres kolażu: dobre przypadki', () => {
  assert.equal(normalizeHeroImageUrl(GOOD, PROD), GOOD);
  assert.equal(normalizeHeroImageUrl(`  ${GOOD}  `, PROD), GOOD);
  assert.equal(normalizeHeroImageUrl('https://CRM.antyramy.eu/uploads/kolaz-a_B-9.jpg', PROD), 'https://crm.antyramy.eu/uploads/kolaz-a_B-9.jpg');
  // http z własnego hosta → https (adres kanoniczny)
  assert.equal(normalizeHeroImageUrl('http://crm.antyramy.eu/uploads/kolaz-1.jpg', PROD), 'https://crm.antyramy.eu/uploads/kolaz-1.jpg');
});

test('adres kolażu: obce hosty, inne prefiksy, inne ścieżki — odrzucone', () => {
  const bad = [
    'https://evil.example.com/uploads/kolaz-1.jpg',
    'https://crm.antyramy.eu.evil.com/uploads/kolaz-1.jpg',
    'https://api.crm.antyramy.eu/uploads/kolaz-1.jpg',
    'https://crm.antyramy.eu:8443/uploads/kolaz-1.jpg',
    'https://user:pass@crm.antyramy.eu/uploads/kolaz-1.jpg',
    'https://crm.antyramy.eu/uploads/produkt-1.jpg',
    'https://crm.antyramy.eu/uploads/kolaz-1.png',
    'https://crm.antyramy.eu/uploads/kolaz-1.jpg.exe',
    'https://crm.antyramy.eu/uploads/kolaz-.jpg',
    'https://crm.antyramy.eu/uploads/kolaz-a b.jpg',
    'https://crm.antyramy.eu/uploads/kolaz-ą.jpg',
    'https://crm.antyramy.eu/kolaz-1.jpg',
    'https://crm.antyramy.eu/uploads/sub/kolaz-1.jpg',
    'https://crm.antyramy.eu/uploads/kolaz-1.jpg?track=1',
    'https://crm.antyramy.eu/uploads/kolaz-1.jpg#x',
    'ftp://crm.antyramy.eu/uploads/kolaz-1.jpg',
    'javascript:alert(1)',
    '/uploads/kolaz-1.jpg',
    'kolaz-1.jpg',
    'nie-adres',
  ];
  for (const url of bad) assert.equal(normalizeHeroImageUrl(url, PROD), null, url);
});

test('adres kolażu: „../” i zakodowane ścieżki — odrzucone', () => {
  const bad = [
    'https://crm.antyramy.eu/uploads/../uploads/kolaz-1.jpg',
    'https://crm.antyramy.eu/uploads/../index.html',
    'https://crm.antyramy.eu/uploads/%2e%2e/kolaz-1.jpg',
    'https://crm.antyramy.eu/uploads/kolaz-1.jpg%2f..%2f..%2fapp.js',
    'https://crm.antyramy.eu/uploads/..%5ckolaz-1.jpg',
    'https://crm.antyramy.eu/uploads\\kolaz-1.jpg',
  ];
  for (const url of bad) assert.equal(normalizeHeroImageUrl(url, PROD), null, url);
});

test('localhost: tylko z policy.allowLocalhost i tylko http', () => {
  const local = 'http://localhost:4000/uploads/kolaz-1.jpg';
  assert.equal(normalizeHeroImageUrl(local, PROD), null);
  assert.equal(normalizeHeroImageUrl(local, DEV), local);
  assert.equal(normalizeHeroImageUrl('http://127.0.0.1:4000/uploads/kolaz-1.jpg', DEV), 'http://127.0.0.1:4000/uploads/kolaz-1.jpg');
  assert.equal(normalizeHeroImageUrl('http://localhost:4000/uploads/produkt-1.jpg', DEV), null);
  assert.equal(normalizeHeroImageUrl('http://localhost.evil.com/uploads/kolaz-1.jpg', DEV), null);
});

test('policy: localhost tylko poza produkcją ORAZ dla żądania na lokalny host', () => {
  assert.equal(heroUrlPolicy('localhost', 'development').allowLocalhost, true);
  assert.equal(heroUrlPolicy('127.0.0.1', undefined).allowLocalhost, true);
  assert.equal(heroUrlPolicy('[::1]', 'test').allowLocalhost, true);
  assert.equal(heroUrlPolicy('localhost', 'production').allowLocalhost, false);
  // Serwer bez NODE_ENV=production — host crm.antyramy.eu i tak blokuje localhost
  assert.equal(heroUrlPolicy('crm.antyramy.eu', undefined).allowLocalhost, false);
});

test('pole z żądania: brak = bez zmian, null / "" = usunięcie, zły adres = błąd', () => {
  assert.deepEqual(resolveHeroImageInput(undefined, PROD), { ok: true, value: undefined });
  assert.deepEqual(resolveHeroImageInput(null, PROD), { ok: true, value: null });
  assert.deepEqual(resolveHeroImageInput('  ', PROD), { ok: true, value: null });
  assert.deepEqual(resolveHeroImageInput(GOOD, PROD), { ok: true, value: GOOD });
  assert.deepEqual(resolveHeroImageInput('https://evil.example.com/x.jpg', PROD), { ok: false, error: HERO_URL_ERROR });
});

test('nazwa pliku do kasowania: tylko kolaz-*.jpg bez ścieżek', () => {
  assert.equal(collageFilename('kolaz-1.jpg'), 'kolaz-1.jpg');
  for (const n of ['../kolaz-1.jpg', 'a/kolaz-1.jpg', 'a\\kolaz-1.jpg', 'produkt-1.jpg', 'kolaz-1.jpg/', '.', '..', '']) {
    assert.equal(collageFilename(n), null, n);
  }
  assert.equal(collageFilenameFromUrl(GOOD), 'kolaz-1759860000000-123456.jpg');
  assert.equal(collageFilenameFromUrl('https://crm.antyramy.eu/uploads/../uploads/kolaz-1.jpg'), null);
  assert.equal(collageFilenameFromUrl('https://crm.antyramy.eu/uploads/produkt-1.jpg'), null);
  assert.equal(collageFilenameFromUrl(null), null);
});

// ─── Zapis częściowy ────────────────────────────────────────────────────────

test('zapis częściowy: szkic bez pola heroImageUrl nie rusza kolażu', () => {
  assert.deepEqual(planHeroImageChange(GOOD, undefined), { set: false, next: GOOD, release: null });
  assert.deepEqual(planHeroImageChange(undefined, undefined), { set: false, next: null, release: null });
});

test('zapis: zmiana kolażu zwalnia stary plik, ten sam plik — nie', () => {
  const other = 'https://crm.antyramy.eu/uploads/kolaz-2.jpg';
  assert.deepEqual(planHeroImageChange(GOOD, other), { set: true, next: other, release: GOOD });
  assert.deepEqual(planHeroImageChange(GOOD, null), { set: true, next: null, release: GOOD });
  assert.deepEqual(planHeroImageChange(GOOD, GOOD), { set: true, next: GOOD, release: null });
  assert.deepEqual(planHeroImageChange(null, other), { set: true, next: other, release: null });
});

// ─── Kasowanie pliku ────────────────────────────────────────────────────────

const tmpUploads = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kolaz-test-'));
  const dir = path.join(root, 'uploads');
  fs.mkdirSync(dir);
  return { root, dir };
};
const put = (dir: string, name: string) => { fs.writeFileSync(path.join(dir, name), 'x'); return path.join(dir, name); };
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const warn = console.warn;
  console.warn = () => undefined;
  try { return await fn(); } finally { console.warn = warn; }
};

test('kasowanie: plik nieużywany przez nikogo — usunięty', async () => {
  const { dir } = tmpUploads();
  const file = put(dir, 'kolaz-1.jpg');
  const r = await releaseCollageFile({ url: 'https://crm.antyramy.eu/uploads/kolaz-1.jpg', ownerStatus: 'draft', otherUrls: async () => [null, undefined, 'https://crm.antyramy.eu/uploads/produkt-9.jpg'], uploadDir: dir });
  assert.equal(r, 'deleted');
  assert.equal(fs.existsSync(file), false);
});

test('duplikat: usunięcie kolażu w kopii — oryginał nadal ma plik na dysku', async () => {
  const { dir } = tmpUploads();
  const file = put(dir, 'kolaz-1.jpg');
  // Duplikat dostaje ten sam heroImageUrl co oryginał
  const campaigns = [
    { id: 'oryginal', status: 'sent', heroImageUrl: GOOD.replace('kolaz-1759860000000-123456', 'kolaz-1') as string | null },
    { id: 'kopia', status: 'draft', heroImageUrl: GOOD.replace('kolaz-1759860000000-123456', 'kolaz-1') as string | null },
  ];
  // Kopia: „Usuń” kolaż → zapis szkicu z heroImageUrl = null
  const kopia = campaigns[1];
  const change = planHeroImageChange(kopia.heroImageUrl, null);
  kopia.heroImageUrl = change.next;
  const otherUrls = async () => campaigns.filter(c => c.id !== 'kopia').map(c => c.heroImageUrl);
  const r = await releaseCollageFile({ url: change.release, ownerStatus: 'draft', otherUrls, uploadDir: dir });
  assert.equal(r, 'in-use');
  assert.equal(fs.existsSync(file), true);
  assert.equal(campaigns[0].heroImageUrl, 'https://crm.antyramy.eu/uploads/kolaz-1.jpg');
});

test('kasowanie: użycie sprawdzane po nazwie pliku (http/localhost nie omija ochrony)', async () => {
  const { dir } = tmpUploads();
  const file = put(dir, 'kolaz-1.jpg');
  const r = await releaseCollageFile({
    url: 'http://localhost:4000/uploads/kolaz-1.jpg', ownerStatus: 'draft',
    otherUrls: async () => ['https://crm.antyramy.eu/uploads/kolaz-1.jpg'], uploadDir: dir,
  });
  assert.equal(r, 'in-use');
  assert.equal(fs.existsSync(file), true);
});

test('kasowanie: kampania nie-szkic nigdy nie kasuje pliku', async () => {
  const { dir } = tmpUploads();
  const file = put(dir, 'kolaz-1.jpg');
  for (const status of ['sending', 'sent']) {
    const r = await releaseCollageFile({ url: 'https://crm.antyramy.eu/uploads/kolaz-1.jpg', ownerStatus: status, otherUrls: async () => [], uploadDir: dir });
    assert.equal(r, 'not-draft');
  }
  assert.equal(fs.existsSync(file), true);
});

test('kasowanie: „../” i inne prefiksy nie usuwają niczego poza kolażami', async () => {
  const { root, dir } = tmpUploads();
  const outside = put(root, 'kolaz-1.jpg');
  const product = put(dir, 'produkt-1.jpg');
  for (const url of [
    'https://crm.antyramy.eu/uploads/../kolaz-1.jpg',
    'https://crm.antyramy.eu/uploads/%2e%2e/kolaz-1.jpg',
    'https://crm.antyramy.eu/uploads/produkt-1.jpg',
  ]) {
    const r = await releaseCollageFile({ url, ownerStatus: 'draft', otherUrls: async () => [], uploadDir: dir });
    assert.equal(r, 'invalid', url);
  }
  assert.equal(fs.existsSync(outside), true);
  assert.equal(fs.existsSync(product), true);
});

test('kasowanie: brak pliku i błąd odczytu użycia nie rzucają', async () => {
  const { dir } = tmpUploads();
  const missing = await quiet(() => releaseCollageFile({ url: 'https://crm.antyramy.eu/uploads/kolaz-404.jpg', ownerStatus: 'draft', otherUrls: async () => [], uploadDir: dir }));
  assert.equal(missing, 'missing');
  const file = put(dir, 'kolaz-1.jpg');
  const failed = await quiet(() => releaseCollageFile({
    url: 'https://crm.antyramy.eu/uploads/kolaz-1.jpg', ownerStatus: 'draft',
    otherUrls: async () => { throw new Error('Firestore niedostępny'); }, uploadDir: dir,
  }));
  assert.equal(failed, 'error');
  assert.equal(fs.existsSync(file), true); // gdy nie wiadomo, czy ktoś używa — plik zostaje
});
