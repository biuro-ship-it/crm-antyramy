// Zapis i kasowanie plików tworzonych przez backend (np. PDF zamówienia) w katalogu uploadów.
import { promises as fsp } from 'fs';
import * as path from 'path';
import { UPLOAD_DIR } from './collageFiles';

const SAFE_NAME_RE = /^[A-Za-z0-9._-]+$/;

// Podkatalogi uploadów — stała lista, nazwa z żądania nigdy nie trafia do ścieżki.
export type UploadSubdir = 'suppliers';

const dirOf = (subdir?: UploadSubdir): string => (subdir ? path.join(UPLOAD_DIR, subdir) : UPLOAD_DIR);

const resolveSafe = (filename: string, subdir?: UploadSubdir): string => {
  if (!SAFE_NAME_RE.test(filename) || filename.includes('..') || path.basename(filename) !== filename) {
    throw new Error(`Nieprawidłowa nazwa pliku: ${filename}`);
  }
  return path.join(dirOf(subdir), filename);
};

export const saveUploadFile = async (filename: string, data: Buffer, subdir?: UploadSubdir): Promise<void> => {
  await fsp.mkdir(dirOf(subdir), { recursive: true });
  await fsp.writeFile(resolveSafe(filename, subdir), data, { flag: 'wx' }); // wx — nigdy nie nadpisujemy istniejącego pliku
};

/** Kasuje plik; brak pliku nie jest błędem (np. już usunięty). */
export const deleteUploadFile = async (filename: string, subdir?: UploadSubdir): Promise<void> => {
  try {
    await fsp.unlink(resolveSafe(filename, subdir));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
};
