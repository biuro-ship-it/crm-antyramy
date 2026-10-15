// Zdjęcie towaru dostawcy: zmniejszanie w przeglądarce (Canvas, jak kolaż — bez bibliotek na serwerze),
// walidacja linku przed wysłaniem, wybór adresu miniatury. Testy czystych funkcji: materialImage.test.ts.
// Serwer i tak sprawdza wszystko sam (backend/src/services/supplierImages.ts).
import { decodeImage } from './collage';
import type { SupplierMaterialImage } from '../services/api';

export const IMAGE_MAX_SIDE = 1600;   // dłuższy bok zdjęcia
export const THUMB_SHORT_SIDE = 160;  // krótszy bok miniatury (kadr object-cover w kwadracie 44 px, ekrany 3×)
export const THUMB_MAX_LONG = 640;    // dłuższy bok miniatury (bardzo wąskie panoramy) — limit serwera
export const SOURCE_MAX_BYTES = 30 * 1024 * 1024; // plik z telefonu przed zmniejszeniem
const JPEG_QUALITY = 0.85;
const THUMB_QUALITY = 0.8;

// HEIC/HEIF z iPhone'a — Safari je dekoduje, a my i tak wysyłamy JPG
// `image/jpg` — niestandardowy typ, który podaje część telefonów z Androidem
const SOURCE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const SOURCE_ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif';
export const IMAGE_LINK_MAX_LENGTH = 2000; // jak na serwerze, liczone po normalizacji adresu

/** Komunikat błędu albo null, gdy plik można spróbować zmniejszyć. Pusty typ (część telefonów) przepuszczamy. */
export const sourceFileError = (file: { type: string; size: number }): string | null => {
  if (file.type && !SOURCE_TYPES.includes(file.type.toLowerCase())) return 'Dozwolone zdjęcia JPG, PNG lub WebP.';
  if (file.size > SOURCE_MAX_BYTES) return 'Zdjęcie jest za duże (ponad 30 MB).';
  return null;
};

/** Wymiary po zmniejszeniu tak, by dłuższy bok ≤ maxSide (bez powiększania). */
export const fitLongSide = (w: number, h: number, maxSide: number): { width: number; height: number } => {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
};

/** Wymiary miniatury: krótszy bok ≈ shortSide, dłuższy najwyżej maxLong (limit serwera), bez powiększania. */
export const fitShortSide = (w: number, h: number, shortSide: number, maxLong = THUMB_MAX_LONG): { width: number; height: number } => {
  const scale = Math.min(1, shortSide / Math.min(w, h), maxLong / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
};

/** Te same reguły co serwer (supplierImages.ts → validateImageLink). Zwraca błąd albo null. */
export const imageLinkError = (raw: string): string | null => {
  const s = raw.trim();
  if (!s) return 'Wpisz link do zdjęcia.';
  if (/\s/.test(s)) return 'Link nie może zawierać spacji.';
  let u: URL;
  try { u = new URL(s); } catch { return 'To nie jest poprawny adres.'; }
  if (u.protocol !== 'https:') return 'Dozwolone tylko linki https://';
  if (u.username || u.password) return 'Link nie może zawierać loginu ani hasła.';
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host.startsWith('.') || host.endsWith('.')) return 'Nieprawidłowy adres serwera w linku.';
  // Długość po normalizacji: polskie litery w ścieżce rosną do %C4%85
  if (u.toString().length > IMAGE_LINK_MAX_LENGTH) return 'Link jest za długi.';
  return null;
};

/** Adres miniatury do listy (wgrane: mała miniatura, link: sam link). */
export const thumbSrc = (image: SupplierMaterialImage | undefined): string | null =>
  image ? image.thumbUrl || image.url : null;

// ─── Przeglądarka ───────────────────────────────────────────────────────────

const toJpeg = (source: CanvasImageSource, w: number, h: number, quality: number): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Przeglądarka nie obsługuje zmniejszania zdjęć.'));
  ctx.fillStyle = '#ffffff'; // przezroczyste PNG → białe tło zamiast czarnego
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Nie udało się przygotować zdjęcia.'))), 'image/jpeg', quality));
};

/** Zdjęcie (dłuższy bok ≤ 1600 px) i miniatura (krótszy bok 160 px) jako JPG. Orientacja z EXIF. */
export const prepareMaterialImage = async (file: File): Promise<{ image: Blob; thumb: Blob }> => {
  const decoded = await decodeImage(file).catch(() => {
    throw new Error('Nie udało się odczytać zdjęcia. Użyj pliku JPG, PNG lub WebP.');
  });
  try {
    const big = fitLongSide(decoded.width, decoded.height, IMAGE_MAX_SIDE);
    const small = fitShortSide(decoded.width, decoded.height, THUMB_SHORT_SIDE);
    const image = await toJpeg(decoded.source, big.width, big.height, JPEG_QUALITY);
    const thumb = await toJpeg(decoded.source, small.width, small.height, THUMB_QUALITY);
    return { image, thumb };
  } finally {
    decoded.release();
  }
};
