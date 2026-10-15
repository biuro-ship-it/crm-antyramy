// Zdjęcie towaru (surowca) dostawcy: walidacja pliku i linku, budowanie pola `image`,
// zachowanie zdjęć przy zapisie katalogu. Bez Firestore i Express — testy: supplierImages.test.ts.
// Zmniejszanie robi przeglądarka (Canvas); serwer sprawdza typ po zawartości i wymiary.
import * as crypto from 'crypto';

export const SUPPLIER_IMAGE_SUBDIR = 'suppliers';
export const SUPPLIER_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_MAX_SIDE = 1600;     // dłuższy bok zdjęcia po zmniejszeniu
export const THUMB_MAX_SIDE = 640;      // miniatura: krótszy bok ok. 160 px, dłuższy z zapasem
export const IMAGE_LINK_MAX_LENGTH = 2000;

export type ImageType = 'jpg' | 'png' | 'webp';

export interface MaterialImage {
  source: 'upload' | 'link';
  url: string;
  thumbUrl?: string;
  createdAt: string;
}

export interface MaterialWithImage {
  id: string;
  image?: MaterialImage;
  [key: string]: unknown;
}

const IMAGE_FILE_RE = /^towar-[a-f0-9]{32}(-min)?\.(jpg|png|webp)$/;

// ─── Typ i wymiary po zawartości pliku ───────────────────────────────────────

/** Typ obrazu po pierwszych bajtach (nie po rozszerzeniu ani nagłówku z przeglądarki). */
export const detectImageType = (buf: Buffer): ImageType | null => {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
};

// Znaczniki SOF w JPEG (bez DHT C4, JPG C8, DAC CC)
const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

const jpegSize = (buf: Buffer): { width: number; height: number } | null => {
  let off = 2;
  while (off + 4 <= buf.length) {
    if (buf[off] !== 0xff) return null;
    const marker = buf[off + 1];
    if (marker === 0xff) { off += 1; continue; }                 // bajty wypełnienia
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { off += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return null;          // koniec / dane obrazu przed SOF
    const len = buf.readUInt16BE(off + 2);
    if (len < 2) return null;
    if (JPEG_SOF.has(marker)) {
      if (off + 9 > buf.length) return null;
      return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
    }
    off += 2 + len;
  }
  return null;
};

const webpSize = (buf: Buffer): { width: number; height: number } | null => {
  if (buf.length < 30) return null;
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const [b0, b1, b2, b3] = [buf[21], buf[22], buf[23], buf[24]];
    return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
  }
  if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  return null;
};

/** Wymiary z nagłówka pliku albo null (uszkodzony / nieobsługiwany). */
export const imageDimensions = (buf: Buffer, type: ImageType): { width: number; height: number } | null => {
  try {
    if (type === 'png') return buf.length >= 24 ? { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) } : null;
    if (type === 'jpg') return jpegSize(buf);
    return webpSize(buf);
  } catch {
    return null;
  }
};

export type CheckedImage = { ok: true; type: ImageType } | { ok: false; error: string };

/** Sprawdza wgrany plik: typ po zawartości, rozmiar, wymiary (zdjęcie ≤ 1600 px, miniatura ≤ 640 px). */
export const checkUploadedImage = (buf: Buffer, role: 'image' | 'thumb'): CheckedImage => {
  const what = role === 'image' ? 'Zdjęcie' : 'Miniatura';
  if (!buf.length) return { ok: false, error: `${what}: pusty plik` };
  if (buf.length > SUPPLIER_IMAGE_MAX_BYTES) return { ok: false, error: `${what}: plik większy niż 8 MB` };
  const type = detectImageType(buf);
  if (!type) return { ok: false, error: `${what}: dozwolone tylko JPG, PNG i WebP` };
  const size = imageDimensions(buf, type);
  if (!size || size.width < 1 || size.height < 1) return { ok: false, error: `${what}: nie udało się odczytać wymiarów obrazu` };
  const max = role === 'image' ? IMAGE_MAX_SIDE : THUMB_MAX_SIDE;
  if (Math.max(size.width, size.height) > max) {
    return { ok: false, error: `${what}: za duże wymiary (${size.width}×${size.height}, maks. ${max} px)` };
  }
  return { ok: true, type };
};

// ─── Nazwy plików i adresy ───────────────────────────────────────────────────

/** Losowe nazwy pary plików: zdjęcie i miniatura (wspólny losowy rdzeń). */
export const supplierImageFilenames = (imageType: ImageType, thumbType: ImageType, random = () => crypto.randomBytes(16).toString('hex')) => {
  const base = `towar-${random()}`;
  return { image: `${base}.${imageType}`, thumb: `${base}-min.${thumbType}` };
};

/** Nazwa pliku zdjęcia towaru z adresu `/uploads/suppliers/<plik>` albo null. */
export const supplierImageFileFromUrl = (url: string | null | undefined): string | null => {
  if (typeof url !== 'string' || !url.trim() || /\.\.|\\|%2e|%2f|%5c/i.test(url)) return null;
  try {
    const m = /^\/uploads\/suppliers\/([^/]+)$/.exec(new URL(url.trim(), 'https://crm.antyramy.eu').pathname);
    return m && IMAGE_FILE_RE.test(m[1]) ? m[1] : null;
  } catch {
    return null;
  }
};

/** Pliki na serwerze należące do zdjęcia (tylko `upload`; link nie ma plików). */
export const imageFilesOf = (image: MaterialImage | null | undefined): string[] => {
  if (!image || image.source !== 'upload') return [];
  return [image.url, image.thumbUrl]
    .map(supplierImageFileFromUrl)
    .filter((f): f is string => !!f);
};

// ─── Link ────────────────────────────────────────────────────────────────────

export type CheckedLink = { ok: true; url: string } | { ok: false; error: string };

/** Link do zdjęcia: tylko https://, poprawny host, bez loginu/hasła i spacji. Linku nie pobieramy. */
export const validateImageLink = (raw: unknown): CheckedLink => {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: 'Wpisz link do zdjęcia' };
  const s = raw.trim();
  if (s.length > IMAGE_LINK_MAX_LENGTH) return { ok: false, error: 'Link jest za długi' };
  if (/\s/.test(s)) return { ok: false, error: 'Link nie może zawierać spacji' };
  let u: URL;
  try { u = new URL(s); } catch { return { ok: false, error: 'To nie jest poprawny adres' }; }
  if (u.protocol !== 'https:') return { ok: false, error: 'Dozwolone tylko linki https://' };
  if (u.username || u.password) return { ok: false, error: 'Link nie może zawierać loginu ani hasła' };
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host.startsWith('.') || host.endsWith('.')) return { ok: false, error: 'Nieprawidłowy adres serwera w linku' };
  return { ok: true, url: u.toString() };
};

// ─── Pole `image` ────────────────────────────────────────────────────────────

export const buildUploadedImage = (url: string, thumbUrl: string, now: string): MaterialImage =>
  ({ source: 'upload', url, thumbUrl, createdAt: now });

export const buildLinkImage = (url: string, now: string): MaterialImage =>
  ({ source: 'link', url, createdAt: now });

/** Kopia towaru bez pola image (Firestore nie przyjmuje `undefined`). */
const withoutImage = <T extends MaterialWithImage>(m: T): T => {
  const { image: _image, ...rest } = m;
  return rest as T;
};

/**
 * Zapis katalogu (PUT dostawcy): zdjęcia NIE przychodzą z formularza — dla towaru o tym samym id
 * zostaje zdjęcie z bazy, nowy towar jest bez zdjęcia. Zdjęcia towarów usuniętych z katalogu
 * wracają w `orphaned` (do skasowania plików po zapisie).
 */
export const mergeMaterialImages = <T extends MaterialWithImage>(stored: MaterialWithImage[] | undefined, incoming: T[]) => {
  const byId = new Map((stored ?? []).map(m => [m.id, m]));
  const incomingIds = new Set(incoming.map(m => m.id));
  const materials = incoming.map((m): T & { image?: MaterialImage } => {
    const image = byId.get(m.id)?.image;
    return image ? { ...withoutImage(m), image } : withoutImage(m);
  });
  const orphaned = (stored ?? [])
    .filter(m => !incomingIds.has(m.id) && m.image)
    .map(m => m.image as MaterialImage);
  return { materials, orphaned };
};

/** Ustawia (albo usuwa: null) zdjęcie jednego towaru. null, gdy towaru nie ma w katalogu. */
export const replaceMaterialImage = <T extends MaterialWithImage>(materials: T[], materialId: string, image: MaterialImage | null) => {
  const current = materials.find(m => m.id === materialId);
  if (!current) return null;
  const next = materials.map((m): T & { image?: MaterialImage } => {
    if (m.id !== materialId) return m;
    return image ? { ...withoutImage(m), image } : withoutImage(m);
  });
  return { materials: next, previous: current.image ?? null };
};
