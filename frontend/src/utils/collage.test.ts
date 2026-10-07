import { describe, it, expect } from 'vitest';
import {
  computeCollageLayout, computeCoverCrop, spacedTextWidth, assertSupportedImage, fitJpegQuality,
  Rect, UNSUPPORTED_FORMAT_ERROR, JPEG_QUALITY_STEPS, COLLAGE_MAX_BYTES,
} from './collage';

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('computeCollageLayout', () => {
  it('domyślnie 1200×800, odstęp 6: konkretne pola', () => {
    expect(computeCollageLayout()).toEqual([
      { x: 0, y: 0, w: 716, h: 800 },
      { x: 722, y: 0, w: 478, h: 397 },
      { x: 722, y: 403, w: 478, h: 397 },
    ]);
  });

  it.each([
    [1200, 800, 6],
    [1201, 801, 7],
    [600, 400, 3],
  ])('%i×%i, odstęp %i: suma wymiarów z odstępem = całość, wszystko w granicach', (W, H, gap) => {
    const [big, top, bottom] = computeCollageLayout(W, H, gap);
    expect(big.w + gap + top.w).toBe(W);
    expect(top.w).toBe(bottom.w);
    expect(top.h + gap + bottom.h).toBe(H);
    expect(big.h).toBe(H);
    for (const r of [big, top, bottom]) {
      expect(Number.isInteger(r.x) && Number.isInteger(r.y) && Number.isInteger(r.w) && Number.isInteger(r.h)).toBe(true);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(W);
      expect(r.y + r.h).toBeLessThanOrEqual(H);
    }
  });

  it('pola się nie nakładają, a między nimi jest dokładnie odstęp', () => {
    const [big, top, bottom] = computeCollageLayout(1200, 800, 6);
    expect(overlaps(big, top)).toBe(false);
    expect(overlaps(big, bottom)).toBe(false);
    expect(overlaps(top, bottom)).toBe(false);
    expect(top.x - (big.x + big.w)).toBe(6);
    expect(bottom.y - (top.y + top.h)).toBe(6);
  });

  it('duże zdjęcie ma ok. 60% szerokości', () => {
    const [big] = computeCollageLayout(1200, 800, 6);
    expect(big.w / 1194).toBeCloseTo(0.6, 2);
  });
});

describe('computeCoverCrop', () => {
  const [big, top] = computeCollageLayout();

  const expectCover = (srcW: number, srcH: number, dst: Rect) => {
    const c = computeCoverCrop(srcW, srcH, dst.w, dst.h);
    // proporcje fragmentu = proporcje pola
    expect(c.sw / c.sh).toBeCloseTo(dst.w / dst.h, 6);
    // w granicach źródła
    expect(c.sx).toBeGreaterThanOrEqual(0);
    expect(c.sy).toBeGreaterThanOrEqual(0);
    expect(c.sx + c.sw).toBeLessThanOrEqual(srcW + 1e-9);
    expect(c.sy + c.sh).toBeLessThanOrEqual(srcH + 1e-9);
    // wyśrodkowany
    expect(c.sx).toBeCloseTo((srcW - c.sw) / 2, 6);
    expect(c.sy).toBeCloseTo((srcH - c.sh) / 2, 6);
    // cover: jeden wymiar wykorzystany w całości
    expect(c.sw === srcW || c.sh === srcH).toBe(true);
    return c;
  };

  it('zdjęcie poziome 4000×3000 w dużym (pionowym) polu — przycięte boki, pełna wysokość', () => {
    const c = expectCover(4000, 3000, big);
    expect(c.sh).toBe(3000);
    expect(c.sy).toBe(0);
    expect(c.sw).toBeLessThan(4000);
  });

  it('zdjęcie pionowe 3000×4000 w małym (poziomym) polu — przycięta góra i dół, pełna szerokość', () => {
    const c = expectCover(3000, 4000, top);
    expect(c.sw).toBe(3000);
    expect(c.sx).toBe(0);
    expect(c.sh).toBeLessThan(4000);
  });

  it('zdjęcie pionowe w dużym polu i poziome w małym', () => {
    expectCover(3024, 4032, big);
    expectCover(4032, 3024, top);
  });

  it('te same proporcje — całe zdjęcie bez przycinania', () => {
    expect(computeCoverCrop(2400, 1600, 1200, 800)).toEqual({ sx: 0, sy: 0, sw: 2400, sh: 1600 });
  });

  it('zerowe lub nieliczbowe wymiary — błąd', () => {
    expect(() => computeCoverCrop(0, 100, 10, 10)).toThrow();
    expect(() => computeCoverCrop(100, 100, 10, NaN)).toThrow();
  });
});

describe('spacedTextWidth', () => {
  it('suma szerokości znaków + odstęp między nimi (bez odstępu na końcu)', () => {
    expect(spacedTextWidth([10, 20, 30], 2)).toBe(64);
    expect(spacedTextWidth([10], 2)).toBe(10);
    expect(spacedTextWidth([], 2)).toBe(0);
  });
});

describe('assertSupportedImage', () => {
  it('JPG i PNG przechodzą', () => {
    expect(() => assertSupportedImage({ type: 'image/jpeg' })).not.toThrow();
    expect(() => assertSupportedImage({ type: 'image/png' })).not.toThrow();
  });

  it('HEIC, HEIF, WebP i brak typu — komunikat z instrukcją dla iPhone’a', () => {
    for (const type of ['image/heic', 'image/heif', 'image/webp', '']) {
      expect(() => assertSupportedImage({ type })).toThrow(UNSUPPORTED_FORMAT_ERROR);
    }
  });
});

describe('fitJpegQuality', () => {
  it('kroki jakości: 0,90 → 0,50 co 0,05', () => {
    expect(JPEG_QUALITY_STEPS).toEqual([0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5]);
  });

  // Rozmiar maleje z jakością: q=0,90 → 400 KB, każdy krok 0,05 o 25 KB mniej (q=0,50 → 200 KB)
  const fakeEncode = (calls: number[]) => async (q: number) => {
    calls.push(q);
    const kb = 400 - Math.round((0.9 - q) * 500);
    return new Blob([new Uint8Array(kb * 1024)]);
  };

  it('bierze pierwszą jakość z plikiem ≤ 250 KB i dalej nie koduje', async () => {
    const calls: number[] = [];
    const r = await fitJpegQuality(fakeEncode(calls));
    expect(r.quality).toBe(0.6);
    expect(r.sizeKB).toBe(250);
    expect(r.overLimit).toBe(false);
    expect(calls).toEqual([0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6]);
  });

  it('nawet 0,50 za duże — najmniejszy wynik z overLimit, bez błędu', async () => {
    const calls: number[] = [];
    const r = await fitJpegQuality(fakeEncode(calls), 100 * 1024);
    expect(r.overLimit).toBe(true);
    expect(r.quality).toBe(0.5);
    expect(r.sizeKB).toBe(200);
    expect(calls).toHaveLength(JPEG_QUALITY_STEPS.length);
  });

  it('domyślny limit to 250 KB', () => {
    expect(COLLAGE_MAX_BYTES).toBe(256000);
  });
});
