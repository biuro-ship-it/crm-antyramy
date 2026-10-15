import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectImageType, imageDimensions, checkUploadedImage, supplierImageFilenames, supplierImageFileFromUrl,
  imageFilesOf, validateImageLink, buildUploadedImage, buildLinkImage, mergeMaterialImages, replaceMaterialImage,
  SUPPLIER_IMAGE_MAX_BYTES, MaterialImage,
} from './supplierImages';

// Minimalne nagłówki plików — wystarczą do rozpoznania typu i wymiarów.
const jpeg = (w: number, h: number) => Buffer.from([
  0xff, 0xd8,
  0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // APP0 JFIF
  0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 0xff, w >> 8, w & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  0xff, 0xd9,
]);

const png = (w: number, h: number) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};

const webpVp8x = (w: number, h: number) => {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(22, 4);
  b.write('WEBP', 8, 'ascii');
  b.write('VP8X', 12, 'ascii');
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
};

const webpVp8 = (w: number, h: number) => {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii');
  b.write('WEBP', 8, 'ascii');
  b.write('VP8 ', 12, 'ascii');
  b.writeUInt16LE(w, 26);
  b.writeUInt16LE(h, 28);
  return b;
};

const HEX = 'a'.repeat(32);
const UP = (f: string) => `https://crm.antyramy.eu/uploads/suppliers/${f}`;
const uploaded: MaterialImage = buildUploadedImage(UP(`towar-${HEX}.jpg`), UP(`towar-${HEX}-min.jpg`), '2026-10-15T10:00:00.000Z');
const linked: MaterialImage = buildLinkImage('https://example.com/a.jpg', '2026-10-15T10:00:00.000Z');

describe('detectImageType — typ po zawartości', () => {
  it('rozpoznaje JPG, PNG i WebP', () => {
    assert.equal(detectImageType(jpeg(10, 10)), 'jpg');
    assert.equal(detectImageType(png(10, 10)), 'png');
    assert.equal(detectImageType(webpVp8x(10, 10)), 'webp');
  });
  it('odrzuca inne pliki, nawet z „obrazkowym” rozszerzeniem', () => {
    assert.equal(detectImageType(Buffer.from('%PDF-1.7 ...')), null);
    assert.equal(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
    assert.equal(detectImageType(Buffer.from('GIF89a......')), null);
    assert.equal(detectImageType(Buffer.alloc(0)), null);
  });
});

describe('imageDimensions — wymiary z nagłówka', () => {
  it('JPG (znacznik SOF po APP0)', () => assert.deepEqual(imageDimensions(jpeg(1600, 1200), 'jpg'), { width: 1600, height: 1200 }));
  it('PNG (IHDR)', () => assert.deepEqual(imageDimensions(png(800, 600), 'png'), { width: 800, height: 600 }));
  it('WebP VP8X i VP8', () => {
    assert.deepEqual(imageDimensions(webpVp8x(1234, 567), 'webp'), { width: 1234, height: 567 });
    assert.deepEqual(imageDimensions(webpVp8(300, 200), 'webp'), { width: 300, height: 200 });
  });
  it('uszkodzony JPG → null', () => assert.equal(imageDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]), 'jpg'), null));
});

describe('checkUploadedImage', () => {
  it('przyjmuje zdjęcie do 1600 px i miniaturę do 640 px', () => {
    assert.deepEqual(checkUploadedImage(jpeg(1600, 900), 'image'), { ok: true, type: 'jpg' });
    assert.deepEqual(checkUploadedImage(jpeg(284, 160), 'thumb'), { ok: true, type: 'jpg' });
  });
  it('odrzuca za duże wymiary, zły typ, pusty i za duży plik', () => {
    assert.equal(checkUploadedImage(jpeg(1601, 900), 'image').ok, false);
    assert.equal(checkUploadedImage(jpeg(1600, 900), 'thumb').ok, false);
    assert.equal(checkUploadedImage(Buffer.from('%PDF-1.7'), 'image').ok, false);
    assert.equal(checkUploadedImage(Buffer.alloc(0), 'image').ok, false);
    const big = Buffer.concat([jpeg(100, 100), Buffer.alloc(SUPPLIER_IMAGE_MAX_BYTES)]);
    const r = checkUploadedImage(big, 'image');
    assert.equal(r.ok, false);
    assert.match((r as { error: string }).error, /8 MB/);
  });
});

describe('nazwy plików i adresy', () => {
  it('losowa para nazw ze wspólnym rdzeniem', () => {
    assert.deepEqual(supplierImageFilenames('jpg', 'jpg', () => HEX), { image: `towar-${HEX}.jpg`, thumb: `towar-${HEX}-min.jpg` });
    const a = supplierImageFilenames('png', 'jpg');
    assert.match(a.image, /^towar-[a-f0-9]{32}\.png$/);
    assert.notEqual(a.image, supplierImageFilenames('png', 'jpg').image);
  });
  it('wyłuskuje nazwę tylko z /uploads/suppliers/ i tylko pasującą do wzorca', () => {
    assert.equal(supplierImageFileFromUrl(UP(`towar-${HEX}.jpg`)), `towar-${HEX}.jpg`);
    assert.equal(supplierImageFileFromUrl(`http://localhost:4000/uploads/suppliers/towar-${HEX}-min.webp`), `towar-${HEX}-min.webp`);
    assert.equal(supplierImageFileFromUrl(`https://crm.antyramy.eu/uploads/towar-${HEX}.jpg`), null);
    assert.equal(supplierImageFileFromUrl('https://crm.antyramy.eu/uploads/suppliers/produkt-1.jpg'), null);
    assert.equal(supplierImageFileFromUrl('https://crm.antyramy.eu/uploads/suppliers/..%2f..%2fdist%2findex.js'), null);
    assert.equal(supplierImageFileFromUrl(undefined), null);
  });
  it('pliki zdjęcia: wgrane → oba, link → żadne', () => {
    assert.deepEqual(imageFilesOf(uploaded), [`towar-${HEX}.jpg`, `towar-${HEX}-min.jpg`]);
    assert.deepEqual(imageFilesOf(linked), []);
    assert.deepEqual(imageFilesOf(undefined), []);
    // link udający plik z serwera nie kasuje niczego
    assert.deepEqual(imageFilesOf(buildLinkImage(UP(`towar-${HEX}.jpg`), 'x')), []);
  });
});

describe('validateImageLink', () => {
  it('przyjmuje https://', () => {
    assert.deepEqual(validateImageLink('  https://sklep.pl/foto/ramka.jpg?w=800 '), { ok: true, url: 'https://sklep.pl/foto/ramka.jpg?w=800' });
  });
  it('odrzuca http, inne protokoły, login w adresie, spacje, śmieci', () => {
    for (const bad of ['http://sklep.pl/a.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAA', 'ftp://x.pl/a.jpg',
      'https://user:pass@sklep.pl/a.jpg', 'https://sklep.pl/a b.jpg', 'https://localhost/a.jpg', 'sklep.pl/a.jpg', '', '   ', 42]) {
      assert.equal(validateImageLink(bad).ok, false, String(bad));
    }
    assert.equal(validateImageLink('https://x.pl/' + 'a'.repeat(2000)).ok, false);
  });
});

describe('mergeMaterialImages — zapis katalogu nie rusza zdjęć', () => {
  const stored = [
    { id: 'm1', name: 'Szkło', image: uploaded },
    { id: 'm2', name: 'HDF', image: linked },
    { id: 'm3', name: 'Listwa' },
  ];
  it('formularz bez zdjęcia → zdjęcie z bazy zostaje', () => {
    const { materials, orphaned } = mergeMaterialImages(stored, [{ id: 'm1', name: 'Szkło 3 mm' }, { id: 'm2', name: 'HDF' }, { id: 'm3', name: 'Listwa' }]);
    assert.deepEqual(materials[0], { id: 'm1', name: 'Szkło 3 mm', image: uploaded });
    assert.equal(materials[1].image, linked);
    assert.equal('image' in materials[2], false);
    assert.deepEqual(orphaned, []);
  });
  it('podrobione zdjęcie z formularza jest ignorowane, nowy towar bez zdjęcia', () => {
    const fake = buildLinkImage('https://zle.pl/x.jpg', 'x');
    const { materials } = mergeMaterialImages(stored, [{ id: 'm1', name: 'Szkło', image: fake }, { id: 'nowy', name: 'Nowy', image: fake }]);
    assert.equal(materials[0].image, uploaded);
    assert.equal('image' in materials[1], false);
  });
  it('usunięty towar → jego zdjęcie do sprzątnięcia', () => {
    const { orphaned } = mergeMaterialImages(stored, [{ id: 'm3', name: 'Listwa' }]);
    assert.deepEqual(orphaned, [uploaded, linked]);
  });
  it('brak katalogu w bazie', () => {
    assert.deepEqual(mergeMaterialImages(undefined, [{ id: 'a' }]), { materials: [{ id: 'a' }], orphaned: [] });
  });
});

describe('replaceMaterialImage', () => {
  const list = [{ id: 'm1', name: 'Szkło', image: uploaded }, { id: 'm2', name: 'HDF' }];
  it('zastępuje i zwraca poprzednie', () => {
    const r = replaceMaterialImage(list, 'm1', linked)!;
    assert.equal(r.materials[0].image, linked);
    assert.equal(r.previous, uploaded);
    assert.equal(r.materials[1], list[1]);
  });
  it('null usuwa pole', () => {
    const r = replaceMaterialImage(list, 'm1', null)!;
    assert.equal('image' in r.materials[0], false);
    assert.equal(r.previous, uploaded);
  });
  it('brak towaru → null; towar bez zdjęcia → previous null', () => {
    assert.equal(replaceMaterialImage(list, 'xx', linked), null);
    assert.equal(replaceMaterialImage(list, 'm2', linked)!.previous, null);
  });
});

// ─── Przypadki brzegowe z przeglądu kodu ─────────────────────────────────────

const webpVp8l = (w: number, h: number, signature = 0x2f) => {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii');
  b.write('WEBP', 8, 'ascii');
  b.write('VP8L', 12, 'ascii');
  b[20] = signature;
  const W = w - 1, H = h - 1; // 14 bitów szerokości, 14 bitów wysokości
  b[21] = W & 0xff;
  b[22] = ((W >> 8) & 0x3f) | ((H & 0x03) << 6);
  b[23] = (H >> 2) & 0xff;
  b[24] = (H >> 10) & 0x0f;
  return b;
};

const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
const sof = (marker: number, w: number, h: number) =>
  seg(marker, [0x08, h >> 8, h & 0xff, w >> 8, w & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);

describe('imageDimensions — trudniejsze pliki', () => {
  it('WebP bezstratny (VP8L); zła sygnatura → null', () => {
    assert.deepEqual(imageDimensions(webpVp8l(1600, 1200), 'webp'), { width: 1600, height: 1200 });
    assert.deepEqual(imageDimensions(webpVp8l(1, 16384), 'webp'), { width: 1, height: 16384 });
    assert.equal(imageDimensions(webpVp8l(100, 100, 0x00), 'webp'), null);
  });
  it('JPEG z telefonu: EXIF (APP1), ICC (APP2), DQT, bajty wypełnienia, potem SOF0', () => {
    const buf = Buffer.from([0xff, 0xd8,
      ...seg(0xe1, Array(300).fill(0x45)), ...seg(0xe2, Array(40).fill(0x11)), ...seg(0xdb, Array(65).fill(1)),
      0xff, 0xff, ...sof(0xc0, 4032, 3024), 0xff, 0xd9]);
    assert.deepEqual(imageDimensions(buf, 'jpg'), { width: 4032, height: 3024 });
  });
  it('JPEG progresywny (SOF2)', () => {
    const buf = Buffer.from([0xff, 0xd8, ...seg(0xe0, Array(14).fill(0)), ...sof(0xc2, 800, 600), 0xff, 0xd9]);
    assert.deepEqual(imageDimensions(buf, 'jpg'), { width: 800, height: 600 });
  });
  it('JPEG: dane obrazu (SOS) przed SOF, ucięty SOF, długość segmentu < 2 → null', () => {
    assert.equal(imageDimensions(Buffer.from([0xff, 0xd8, ...seg(0xda, [1, 2, 3]), ...sof(0xc0, 10, 10)]), 'jpg'), null);
    assert.equal(imageDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00]), 'jpg'), null);
    assert.equal(imageDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0x00, 0x00]), 'jpg'), null);
  });
  it('za krótkie PNG i WebP → null', () => {
    assert.equal(imageDimensions(png(10, 10).subarray(0, 20), 'png'), null);
    assert.equal(imageDimensions(webpVp8x(10, 10).subarray(0, 25), 'webp'), null);
  });
});

describe('checkUploadedImage — granice', () => {
  it('miniatura 640 px przechodzi, 641 px nie', () => {
    assert.equal(checkUploadedImage(jpeg(640, 160), 'thumb').ok, true);
    assert.equal(checkUploadedImage(jpeg(641, 160), 'thumb').ok, false);
  });
  it('plik dokładnie 8 MB przechodzi', () => {
    const head = jpeg(100, 100);
    const exact = Buffer.concat([head, Buffer.alloc(SUPPLIER_IMAGE_MAX_BYTES - head.length)]);
    assert.equal(checkUploadedImage(exact, 'image').ok, true);
  });
  it('PNG o szerokości 0 → odrzucony; miniatura PNG/WebP przyjęta', () => {
    assert.equal(checkUploadedImage(png(0, 10), 'image').ok, false);
    assert.deepEqual(checkUploadedImage(png(200, 160), 'thumb'), { ok: true, type: 'png' });
    assert.deepEqual(checkUploadedImage(webpVp8l(200, 160), 'thumb'), { ok: true, type: 'webp' });
  });
  it('wgrane zdjęcie bez miniatury → kasujemy tylko zdjęcie', () => {
    assert.deepEqual(imageFilesOf({ source: 'upload', url: UP(`towar-${HEX}.jpg`), createdAt: 'x' }), [`towar-${HEX}.jpg`]);
  });
});

describe('validateImageLink — granice', () => {
  it('długość liczona po normalizacji (polskie litery w ścieżce)', () => {
    const r = validateImageLink('https://x.pl/' + 'ł'.repeat(400)); // 400 znaków → ok. 2400 po zakodowaniu
    assert.equal(r.ok, false);
    assert.match((r as { error: string }).error, /za długi/);
    assert.equal(validateImageLink('https://x.pl/' + 'ł'.repeat(100)).ok, true);
  });
  it('dokładnie 2000 znaków przechodzi, 2001 nie', () => {
    const base = 'https://x.pl/';
    assert.equal(validateImageLink(base + 'a'.repeat(2000 - base.length)).ok, true);
    assert.equal(validateImageLink(base + 'a'.repeat(2001 - base.length)).ok, false);
  });
  it('host „.pl”, „sklep.pl.” → odrzucone; HTTPS wielkimi literami → przyjęte', () => {
    assert.equal(validateImageLink('https://.pl/a.jpg').ok, false);
    assert.equal(validateImageLink('https://sklep.pl./a.jpg').ok, false);
    assert.deepEqual(validateImageLink('HTTPS://Sklep.PL/a.jpg'), { ok: true, url: 'https://sklep.pl/a.jpg' });
  });
});
