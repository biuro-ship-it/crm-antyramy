import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

export const deleteFile = async (filename: string): Promise<void> => {
  // Walidacja — nie pozwól na escape path (../../ itp)
  if (filename.includes('..') || filename.includes('/')) {
    throw new Error('Nieprawidłowa nazwa pliku');
  }

  const filePath = path.join(UPLOAD_DIR, filename);

  // Sprawdź czy plik jest w upload dir
  if (!filePath.startsWith(UPLOAD_DIR)) {
    throw new Error('Dostęp zabroniony');
  }

  // Usuń plik
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  } else {
    throw new Error('Plik nie istnieje');
  }
};
