import { describe, it, expect } from 'vitest';
import { fitLongSide, fitShortSide, imageLinkError, sourceFileError, thumbSrc, SOURCE_MAX_BYTES } from './materialImage';

describe('fitLongSide — zdjęcie do 1600 px', () => {
  it('zmniejsza poziome i pionowe, zachowuje proporcje', () => {
    expect(fitLongSide(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitLongSide(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
  });
  it('nie powiększa małych zdjęć', () => {
    expect(fitLongSide(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});

describe('wymiary skrajne — nigdy ponad limity serwera (1600 / 640 px)', () => {
  it.each([[1601, 1], [1, 10000], [20000, 20000], [16000, 9]])('%i×%i', (w, h) => {
    const big = fitLongSide(w, h, 1600);
    const small = fitShortSide(w, h, 160);
    expect(Math.max(big.width, big.height)).toBeLessThanOrEqual(1600);
    expect(Math.max(small.width, small.height)).toBeLessThanOrEqual(640);
    expect(Math.min(big.width, big.height, small.width, small.height)).toBeGreaterThanOrEqual(1);
  });
});

describe('fitShortSide — miniatura', () => {
  it('krótszy bok 160 px', () => {
    expect(fitShortSide(4000, 3000, 160)).toEqual({ width: 213, height: 160 });
    expect(fitShortSide(3000, 4000, 160)).toEqual({ width: 160, height: 213 });
  });
  it('panorama: dłuższy bok najwyżej 640 px', () => {
    const r = fitShortSide(8000, 1000, 160);
    expect(r.width).toBe(640);
    expect(r.height).toBe(80);
  });
  it('małe zdjęcie zostaje', () => {
    expect(fitShortSide(100, 50, 160)).toEqual({ width: 100, height: 50 });
  });
});

describe('imageLinkError', () => {
  it('https:// przechodzi', () => {
    expect(imageLinkError(' https://sklep.pl/ramka.jpg ')).toBeNull();
  });
  it.each([
    ['', /Wpisz/],
    ['http://sklep.pl/a.jpg', /https/],
    ['javascript:alert(1)', /https/],
    ['https://a:b@sklep.pl/a.jpg', /loginu/],
    ['https://sklep.pl/a b.jpg', /spacji/],
    ['https://localhost/a.jpg', /serwera/],
    ['https://.pl/a.jpg', /serwera/],
    ['https://sklep.pl./a.jpg', /serwera/],
    ['sklep.pl/a.jpg', /poprawny/],
  ])('%s → błąd', (input, msg) => {
    expect(imageLinkError(input)).toMatch(msg);
  });
  it('długość jak na serwerze: liczona po normalizacji (polskie litery)', () => {
    expect(imageLinkError('https://x.pl/' + 'ł'.repeat(400))).toMatch(/za długi/);
    expect(imageLinkError('https://x.pl/' + 'ł'.repeat(100))).toBeNull();
    expect(imageLinkError('https://x.pl/' + 'a'.repeat(2000 - 13))).toBeNull();
    expect(imageLinkError('https://x.pl/' + 'a'.repeat(2001 - 13))).toMatch(/za długi/);
  });
  it('HTTPS wielkimi literami przechodzi', () => {
    expect(imageLinkError('HTTPS://Sklep.PL/a.jpg')).toBeNull();
  });
});

describe('sourceFileError', () => {
  it('JPG/PNG/WebP/HEIC i pusty typ przechodzą', () => {
    for (const type of ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', '']) {
      expect(sourceFileError({ type, size: 1000 })).toBeNull();
    }
  });
  it('PDF, GIF, SVG i za duży plik → błąd', () => {
    expect(sourceFileError({ type: 'application/pdf', size: 1 })).toMatch(/JPG/);
    expect(sourceFileError({ type: 'image/gif', size: 1 })).toMatch(/JPG/);
    expect(sourceFileError({ type: 'image/svg+xml', size: 1 })).toMatch(/JPG/);
    expect(sourceFileError({ type: 'image/jpeg', size: SOURCE_MAX_BYTES + 1 })).toMatch(/30 MB/);
  });
});

describe('thumbSrc', () => {
  it('wgrane → miniatura, link → link, brak → null', () => {
    expect(thumbSrc({ source: 'upload', url: 'https://x/a.jpg', thumbUrl: 'https://x/a-min.jpg', createdAt: '' })).toBe('https://x/a-min.jpg');
    expect(thumbSrc({ source: 'link', url: 'https://x/b.jpg', createdAt: '' })).toBe('https://x/b.jpg');
    expect(thumbSrc(undefined)).toBeNull();
  });
});
