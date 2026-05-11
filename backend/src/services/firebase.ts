import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!serviceAccountPath) {
  throw new Error('Brak zmiennej środowiskowej FIREBASE_SERVICE_ACCOUNT_PATH');
}

const resolvedPath = path.resolve(serviceAccountPath);

if (!fs.existsSync(resolvedPath)) {
  throw new Error(`Nie znaleziono pliku serviceAccountKey.json pod ścieżką: ${resolvedPath}`);
}

const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const db = admin.firestore();
export const auth = admin.auth();
