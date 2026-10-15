// Zapis i kasowanie plików tworzonych przez backend (np. PDF zamówienia) w katalogu uploadów.
import { promises as fsp } from 'fs';
import * as path from 'path';
import { UPLOAD_DIR } from './collageFiles';

const SAFE_NAME_RE = /^[A-Za-z0-9._-]+$/;

const resolveSafe = (filename: string): string => {
  if (!SAFE_NAME_RE.test(filename) || filename.includes('..') || path.basename(filename) !== filename) {
    throw new Error(`Nieprawidłowa nazwa pliku: ${filename}`);
  }
  return path.join(UPLOAD_DIR, filename);
};

export const saveUploadFile = async (filename: string, data: Buffer): Promise<void> => {
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  await fsp.writeFile(resolveSafe(filename), data, { flag: 'wx' }); // wx — nigdy nie nadpisujemy istniejącego pliku
};

/** Kasuje plik; brak pliku nie jest błędem (np. już usunięty). */
export const deleteUploadFile = async (filename: string): Promise<void> => {
  try {
    await fsp.unlink(resolveSafe(filename));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
};
