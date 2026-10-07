// Kolaż z 3 zdjęć do kampanii (1200×800 JPG, maks. ~250 KB) — rysowany w przeglądarce na Canvas.
// Układ, przycięcie i dobór jakości to czyste funkcje (testy: collage.test.ts);
// createCollage dekoduje zdjęcia, rysuje i eksportuje. Decyzje: DECISIONS.md, „Kolaż z 3 zdjęć”.

export interface Rect { x: number; y: number; w: number; h: number }
export interface SourceRect { sx: number; sy: number; sw: number; sh: number }

export interface CollageResult {
  blob: Blob;
  quality: number;
  sizeKB: number;
  overLimit: boolean; // true = nawet przy najniższej jakości plik jest większy niż limit
}

export const COLLAGE_WIDTH = 1200;
export const COLLAGE_HEIGHT = 800;
export const COLLAGE_GAP = 6;
export const COLLAGE_MAX_BYTES = 250 * 1024;

export const BADGE_TEXT = 'OFERTA TYGODNIA';
export const BADGE_COLOR = '#1a56db'; // kolor nagłówka maila kampanii
const BADGE_FONT_SIZE = 34;
const BADGE_FONT = `700 ${BADGE_FONT_SIZE}px Inter, sans-serif`;
const BADGE_PAD_X = 18;
const BADGE_PAD_Y = 12;
const BADGE_LETTER_SPACING = 2; // ≈ 0,06 em
const FONT_LOAD_TIMEOUT_MS = 3000;

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png'];
export const UNSUPPORTED_FORMAT_ERROR =
  'Ten format nie jest obsługiwany. Użyj JPG lub PNG - w iPhonie: Ustawienia > Aparat > Formaty > Najbardziej zgodne';

// 0,90 → 0,50 co 0,05 (liczone na setnych, bez błędów zmiennoprzecinkowych)
export const JPEG_QUALITY_STEPS: number[] = Array.from({ length: 9 }, (_, i) => (90 - i * 5) / 100);

// ─── Czyste funkcje ─────────────────────────────────────────────────────────

/**
 * [duże po lewej, małe prawe górne, małe prawe dolne]. Duże ma 60% szerokości po odjęciu
 * odstępu, prawa kolumna i dolne małe dostają resztę — suma z odstępem zawsze = width × height.
 */
export const computeCollageLayout = (
  width = COLLAGE_WIDTH,
  height = COLLAGE_HEIGHT,
  gap = COLLAGE_GAP,
): [Rect, Rect, Rect] => {
  const bigW = Math.round((width - gap) * 0.6);
  const rightX = bigW + gap;
  const rightW = width - gap - bigW;
  const topH = Math.round((height - gap) / 2);
  const bottomH = height - gap - topH;
  return [
    { x: 0, y: 0, w: bigW, h: height },
    { x: rightX, y: 0, w: rightW, h: topH },
    { x: rightX, y: topH + gap, w: rightW, h: bottomH },
  ];
};

/** Fragment źródła o proporcjach pola docelowego, wyśrodkowany („cover”). */
export const computeCoverCrop = (srcW: number, srcH: number, dstW: number, dstH: number): SourceRect => {
  if (![srcW, srcH, dstW, dstH].every(v => Number.isFinite(v) && v > 0)) {
    throw new Error('Nieprawidłowe wymiary zdjęcia');
  }
  const dstRatio = dstW / dstH;
  if (srcW / srcH > dstRatio) {
    // źródło szersze niż pole — przycinamy boki
    const sw = srcH * dstRatio;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  // źródło wyższe (lub te same proporcje) — przycinamy górę i dół
  const sh = srcW / dstRatio;
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh };
};

/** Szerokość napisu rysowanego znak po znaku z odstępem między literami. */
export const spacedTextWidth = (charWidths: number[], spacing: number): number =>
  charWidths.reduce((sum, w) => sum + w, 0) + spacing * Math.max(0, charWidths.length - 1);

export const assertSupportedImage = (file: { type: string }): void => {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) throw new Error(UNSUPPORTED_FORMAT_ERROR);
};

const toKB = (bytes: number) => Math.round(bytes / 1024);

/**
 * Adres pliku wgranego z lokalnego backendu (upload.ts składa URL z hosta żądania).
 * Taki obrazek nie wyświetli się odbiorcy maila — kolaże robimy na produkcji.
 */
export const isLocalUploadUrl = (url: string): boolean =>
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(url.trim());

export const COLLAGE_ABORTED = 'Generowanie kolażu przerwane';
export const isCollageAborted = (e: unknown) => e instanceof Error && e.message === COLLAGE_ABORTED;
const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error(COLLAGE_ABORTED);
};

/**
 * Pierwsza jakość z `steps`, przy której plik mieści się w `maxBytes`.
 * Gdy żadna — najmniejszy wynik z `overLimit: true` (bez błędu, UI pokazuje rozmiar).
 */
export const fitJpegQuality = async (
  encode: (quality: number) => Promise<Blob>,
  maxBytes = COLLAGE_MAX_BYTES,
  steps = JPEG_QUALITY_STEPS,
  signal?: AbortSignal,
): Promise<CollageResult> => {
  let best: { blob: Blob; quality: number } | null = null;
  for (const quality of steps) {
    throwIfAborted(signal);
    const blob = await encode(quality);
    if (blob.size <= maxBytes) return { blob, quality, sizeKB: toKB(blob.size), overLimit: false };
    if (!best || blob.size < best.blob.size) best = { blob, quality };
  }
  if (!best) throw new Error('Brak poziomów jakości JPG');
  return { ...best, sizeKB: toKB(best.blob.size), overLimit: true };
};

// ─── Przeglądarka ───────────────────────────────────────────────────────────

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

// Orientacja z EXIF: createImageBitmap z 'from-image'. Gdy ta ścieżka zawiedzie
// (starsze przeglądarki), dekodowanie przez <img> — przeglądarki też obracają wg EXIF.
const decodeImage = async (file: File): Promise<DecodedImage> => {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
    } catch {
      URL.revokeObjectURL(url);
      throw new Error(`Nie udało się odczytać zdjęcia „${file.name}”.`);
    }
  }
};

const withTimeout = (p: Promise<unknown>, ms: number) =>
  Promise.race([p, new Promise(resolve => setTimeout(resolve, ms))]);

// Inter z Google Fonts. Brak sieci / fontu → canvas użyje sans-serif (z BADGE_FONT), bez błędu.
const loadBadgeFont = async (): Promise<void> => {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await withTimeout(document.fonts.load(`700 ${BADGE_FONT_SIZE}px Inter`), FONT_LOAD_TIMEOUT_MS);
    await withTimeout(document.fonts.ready, FONT_LOAD_TIMEOUT_MS);
  } catch { /* fallback: sans-serif */ }
};

// Plakietka przyklejona do lewego górnego rogu (x, y). Odstęp między literami rysowany
// ręcznie — ctx.letterSpacing nie działa w starszym Safari.
const drawBadge = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.font = BADGE_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const chars = [...BADGE_TEXT];
  const widths = chars.map(ch => ctx.measureText(ch).width);
  const metrics = ctx.measureText(BADGE_TEXT);
  // Obrys wielkich liter — tekst optycznie na środku plakietki
  const ascent = metrics.actualBoundingBoxAscent || BADGE_FONT_SIZE * 0.73;
  const descent = metrics.actualBoundingBoxDescent || 0;

  const w = Math.ceil(spacedTextWidth(widths, BADGE_LETTER_SPACING) + BADGE_PAD_X * 2);
  const h = Math.ceil(ascent + descent + BADGE_PAD_Y * 2);
  ctx.fillStyle = BADGE_COLOR;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = '#ffffff';
  let cx = x + BADGE_PAD_X;
  const baseline = y + BADGE_PAD_Y + ascent;
  chars.forEach((ch, i) => {
    ctx.fillText(ch, cx, baseline);
    cx += widths[i] + BADGE_LETTER_SPACING;
  });
};

const canvasToJpeg = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Nie udało się zapisać kolażu jako JPG.'))),
      'image/jpeg',
      quality,
    );
  });

/**
 * Kolaż z 3 zdjęć: [0] = duże po lewej, [1] i [2] = małe po prawej (góra, dół).
 * `signal` przerywa pracę między etapami (dekodowanie, kolejne jakości JPG) —
 * przerwane wywołanie rzuca błąd rozpoznawany przez isCollageAborted().
 */
export const createCollage = async (
  files: [File, File, File],
  opts: { signal?: AbortSignal } = {},
): Promise<CollageResult> => {
  const { signal } = opts;
  if (files.length !== 3) throw new Error('Kolaż wymaga dokładnie 3 zdjęć.');
  files.forEach(assertSupportedImage);

  const fontReady = loadBadgeFont();
  const canvas = document.createElement('canvas');
  canvas.width = COLLAGE_WIDTH;
  canvas.height = COLLAGE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Przeglądarka nie obsługuje rysowania (Canvas).');

  const decoded: DecodedImage[] = [];
  try {
    // Po kolei, nie równolegle — mniejsze zużycie pamięci na telefonie przy dużych zdjęciach
    for (const file of files) {
      throwIfAborted(signal);
      decoded.push(await decodeImage(file));
    }
    await fontReady;
    throwIfAborted(signal);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, COLLAGE_WIDTH, COLLAGE_HEIGHT);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const layout = computeCollageLayout(COLLAGE_WIDTH, COLLAGE_HEIGHT, COLLAGE_GAP);
    layout.forEach((r, i) => {
      const img = decoded[i];
      const c = computeCoverCrop(img.width, img.height, r.w, r.h);
      ctx.drawImage(img.source, c.sx, c.sy, c.sw, c.sh, r.x, r.y, r.w, r.h);
    });
    drawBadge(ctx, layout[0].x, layout[0].y);
  } finally {
    decoded.forEach(d => d.release());
  }

  return fitJpegQuality(q => canvasToJpeg(canvas, q), COLLAGE_MAX_BYTES, JPEG_QUALITY_STEPS, signal);
};
