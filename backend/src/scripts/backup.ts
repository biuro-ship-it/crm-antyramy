import '../polyfill';
import dotenv from 'dotenv';
dotenv.config();

import * as admin from 'firebase-admin';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { Readable } from 'stream';

// --- Konfiguracja kolekcji ---
const COLLECTIONS = [
  { name: 'clients',        subcollections: ['interactions'] },
  { name: 'products',       subcollections: [] },
  { name: 'followups',      subcollections: [] },
  { name: 'notes',          subcollections: [] },
  { name: 'suppliers',      subcollections: ['interactions'] },
  { name: 'emailTemplates', subcollections: [] },
] as const;

const GDRIVE_FOLDER_ID  = process.env.GDRIVE_BACKUP_FOLDER_ID ?? '';
const UPLOADS_DIR       = path.join(process.cwd(), 'public', 'uploads');
const KEEP_FIRESTORE    = 30;
const KEEP_UPLOADS      = 8;

// --- Firebase Admin ---
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

// --- Google Drive (service account) ---
function driveClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

// --- Konwersja Firestore Timestamp przy restore ---
function reviveTimestamps(val: unknown): unknown {
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(reviveTimestamps);
  const o = val as Record<string, unknown>;
  if ('_seconds' in o && '_nanoseconds' in o && Object.keys(o).length === 2)
    return new admin.firestore.Timestamp(o._seconds as number, o._nanoseconds as number);
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, reviveTimestamps(v)]));
}

// --- Export Firestore ---
async function exportCollection(name: string, subcollections: readonly string[]): Promise<Record<string, unknown>> {
  const snapshot = await db.collection(name).get();
  const result: Record<string, unknown> = {};
  for (const doc of snapshot.docs) {
    const data: Record<string, unknown> = { ...doc.data() };
    for (const sub of subcollections) {
      const subSnap = await doc.ref.collection(sub).get();
      data[`_sub_${sub}`] = subSnap.docs.map(s => ({ _id: s.id, ...s.data() }));
    }
    result[doc.id] = data;
  }
  return result;
}

async function exportAll(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {
    _meta: { timestamp: new Date().toISOString(), version: 1 },
  };
  for (const col of COLLECTIONS) {
    console.log(`  • ${col.name}`);
    out[col.name] = await exportCollection(col.name, col.subcollections);
  }
  return out;
}

// --- Drive: upload + cleanup ---
type Drive = ReturnType<typeof driveClient>;

async function uploadToDrive(drive: Drive, name: string, body: string | Buffer, mime: string): Promise<void> {
  await drive.files.create({
    requestBody: { name, parents: [GDRIVE_FOLDER_ID] },
    media: { mimeType: mime, body: Readable.from(body) },
  });
}

async function cleanupDrive(drive: Drive, prefix: string, keep: number): Promise<void> {
  const res = await drive.files.list({
    q: `'${GDRIVE_FOLDER_ID}' in parents and name contains '${prefix}' and trashed = false`,
    orderBy: 'createdTime desc',
    fields: 'files(id,name)',
  });
  const old = (res.data.files ?? []).slice(keep);
  for (const f of old) {
    await drive.files.delete({ fileId: f.id! });
    console.log(`  Usunięto stary backup: ${f.name}`);
  }
}

// --- Archiwum uploads ---
function packUploads(tmpDir: string): Buffer | null {
  if (!fs.existsSync(UPLOADS_DIR) || fs.readdirSync(UPLOADS_DIR).length === 0) return null;
  const out = path.join(tmpDir, 'uploads.tar.gz');
  execSync(`tar -czf "${out}" -C "${UPLOADS_DIR}" .`);
  return fs.readFileSync(out);
}

// --- Tryb: list ---
async function listBackups(drive: Drive): Promise<void> {
  const res = await drive.files.list({
    q: `'${GDRIVE_FOLDER_ID}' in parents and trashed = false`,
    orderBy: 'createdTime desc',
    fields: 'files(id,name,size,createdTime)',
  });
  const files = res.data.files ?? [];
  console.log(`\nDostępne backupy (${files.length}):`);
  files.forEach((f, i) => {
    const kb = Math.round(Number(f.size ?? 0) / 1024);
    console.log(`  ${i + 1}. ${f.name}  [${kb} KB]  ${f.createdTime}`);
  });
}

// --- Tryb: restore ---
async function restore(drive: Drive, filename: string, live: boolean): Promise<void> {
  const res = await drive.files.list({
    q: `'${GDRIVE_FOLDER_ID}' in parents and name = '${filename}' and trashed = false`,
    fields: 'files(id,name)',
  });
  const file = res.data.files?.[0];
  if (!file) throw new Error(`Nie znaleziono pliku: ${filename}`);

  const dl = await drive.files.get({ fileId: file.id!, alt: 'media' }, { responseType: 'stream' }) as { data: NodeJS.ReadableStream };
  let raw = '';
  await new Promise<void>((ok, fail) => {
    dl.data.on('data', (c: Buffer) => { raw += c.toString(); });
    dl.data.on('end', ok);
    dl.data.on('error', fail);
  });

  type BackupData = Record<string, Record<string, Record<string, unknown>>>;
  const backup = JSON.parse(raw) as BackupData;
  const prefix = live ? '' : '_restore_';
  console.log(live ? 'TRYB LIVE — zapisuję na produkcję!' : `Tryb testowy — kolekcje z prefixem _restore_`);

  for (const col of COLLECTIONS) {
    const docs = backup[col.name];
    if (!docs) continue;
    const target = `${prefix}${col.name}`;
    console.log(`  Restore → ${target}`);

    for (const [docId, rawDoc] of Object.entries(docs)) {
      const mainFields: Record<string, unknown> = {};
      const subs: Record<string, unknown[]> = {};
      for (const [k, v] of Object.entries(rawDoc)) {
        if (k.startsWith('_sub_')) subs[k.slice(5)] = v as unknown[];
        else if (k !== '_id') mainFields[k] = reviveTimestamps(v);
      }
      const ref = db.collection(target).doc(docId);
      await ref.set(mainFields);
      for (const [subName, subDocs] of Object.entries(subs)) {
        for (const sub of subDocs as Array<Record<string, unknown>>) {
          const { _id: subId, ...subFields } = sub;
          await ref.collection(subName).doc(subId as string).set(
            Object.fromEntries(Object.entries(subFields).map(([k, v]) => [k, reviveTimestamps(v)]))
          );
        }
      }
    }
  }
  console.log('Restore zakończony!');
}

// --- Tryb: backup ---
async function backup(drive: Drive, args: string[]): Promise<void> {
  const dateStr  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-bak-'));
  try {
    console.log(`\nBackup CRM Antyramy — ${dateStr}\n`);

    console.log('[1/3] Eksport Firestore:');
    const data    = await exportAll();
    const json    = JSON.stringify(data, null, 2);
    const jFile   = `crm-firestore-${dateStr}.json`;
    await uploadToDrive(drive, jFile, json, 'application/json');
    console.log(`  ✓ ${jFile} (${Math.round(json.length / 1024)} KB)`);
    await cleanupDrive(drive, 'crm-firestore-', KEEP_FIRESTORE);

    const isSunday      = new Date().getDay() === 0;
    const forceUploads  = args.includes('--include-uploads');
    console.log(`\n[2/3] Uploads: ${isSunday || forceUploads ? 'pakuję...' : 'pomijam (nie niedziela)'}`);
    if (isSunday || forceUploads) {
      const archive = packUploads(tmpDir);
      if (archive) {
        const uFile = `crm-uploads-${dateStr}.tar.gz`;
        await uploadToDrive(drive, uFile, archive, 'application/gzip');
        console.log(`  ✓ ${uFile} (${(archive.length / 1024 / 1024).toFixed(1)} MB)`);
        await cleanupDrive(drive, 'crm-uploads-', KEEP_UPLOADS);
      } else {
        console.log('  Brak plików — pomijam');
      }
    }

    console.log('\n[3/3] Gotowe! Backup zakończony pomyślnie.');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// --- Punkt wejścia ---
async function main(): Promise<void> {
  if (!GDRIVE_FOLDER_ID) throw new Error('Brak GDRIVE_BACKUP_FOLDER_ID w .env');

  const [mode, ...rest] = process.argv.slice(2);
  const drive = driveClient();

  if (mode === 'list')    { await listBackups(drive); return; }
  if (mode === 'restore') {
    if (!rest[0]) throw new Error('Użycie: node backup.js restore <nazwa-pliku> [--live]');
    await restore(drive, rest[0], rest.includes('--live'));
    return;
  }
  await backup(drive, process.argv.slice(2));
}

main().catch(err => { console.error('BŁĄD:', err.message); process.exit(1); });
