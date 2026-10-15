// Zapis i kasowanie plików w katalogu uploadów (PDF zamówień, zdjęcia towarów, pliki z /api/upload).
// Testy czystych funkcji: uploadStore.test.ts.
import { promises as fsp } from 'fs';
import * as path from 'path';
import { UPLOAD_DIR } from './collageFiles';
import { detectImageType } from './supplierImages';

const SAFE_NAME_RE = /^[A-Za-z0-9._-]+$/;

// Podkatalogi uploadów — stała lista, nazwa z żądania nigdy nie trafia do ścieżki.
export type UploadSubdir = 'suppliers' | 'orders';

const dirOf = (subdir?: UploadSubdir, root = UPLOAD_DIR): string => (subdir ? path.join(root, subdir) : root);

/** Pełna ścieżka pliku w katalogu uploadów; rzuca przy nazwie ze ścieżką, `..` albo dziwnych znakach. */
export const resolveSafe = (filename: string, subdir?: UploadSubdir, root = UPLOAD_DIR): string => {
  if (!SAFE_NAME_RE.test(filename) || filename.includes('..') || path.basename(filename) !== filename) {
    throw new Error(`Nieprawidłowa nazwa pliku: ${filename}`);
  }
  return path.join(dirOf(subdir, root), filename);
};

export const saveUploadFile = async (filename: string, data: Buffer, subdir?: UploadSubdir): Promise<void> => {
  await fsp.mkdir(dirOf(subdir), { recursive: true });
  await fsp.writeFile(resolveSafe(filename, subdir), data, { flag: 'wx' }); // wx — nigdy nie nadpisujemy istniejącego pliku
};

/** Kasuje plik; brak pliku nie jest błędem (np. już usunięty). */
export const deleteUploadFile = async (filename: string, subdir?: UploadSubdir, root = UPLOAD_DIR): Promise<void> => {
  try {
    await fsp.unlink(resolveSafe(filename, subdir, root));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
};

// ─── Pliki z ogólnego /api/upload (zdjęcia produktów, dokumenty klientów, dostawców, notatek) ──────────

export type UploadKind = 'jpg' | 'png' | 'webp' | 'pdf' | 'docx' | 'doc';

/**
 * Typ pliku po zawartości (nie po nazwie ani typie z przeglądarki) — od niego zależy rozszerzenie,
 * więc plik HTML/SVG udający obrazek nie trafi do /uploads jako strona z naszej domeny.
 * DOCX to ZIP (PK…) — inne ZIP-y też przejdą, ale z rozszerzeniem .docx serwowane są jako dokument Worda.
 */
export const detectUploadType = (buf: Buffer): UploadKind | null => {
  const image = detectImageType(buf);
  if (image) return image;
  if (buf.length >= 5 && buf.toString('latin1', 0, 5) === '%PDF-') return 'pdf';
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'docx';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return 'doc';
  return null;
};

// Pliki z /api/upload mają prefiks `produkt-` (także dokumenty — historyczna nazwa). Tylko takie
// wolno kasować trasą DELETE /api/upload i przez listę plików dostawcy: PDF-y zamówień (orders/),
// kolaże (`kolaz-`, releaseCollageFile) i zdjęcia towarów (suppliers/) mają własne sprzątanie.
const USER_UPLOAD_RE = /^produkt-[A-Za-z0-9_-]+\.[a-z0-9]{1,5}$/;

export const isUserUploadFilename = (name: string | null | undefined): name is string =>
  typeof name === 'string' && USER_UPLOAD_RE.test(name);
