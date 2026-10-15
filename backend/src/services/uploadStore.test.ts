import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveSafe, deleteUploadFile, detectUploadType, isUserUploadFilename } from './uploadStore';

const ROOT = path.join(os.tmpdir(), 'crm-upload-test');

describe('resolveSafe — ścieżka pliku w uploads', () => {
  it('dokleja nazwę i podkatalog do katalogu uploadów', () => {
    assert.equal(resolveSafe('a.pdf', undefined, ROOT), path.join(ROOT, 'a.pdf'));
    assert.equal(resolveSafe('towar-1.jpg', 'suppliers', ROOT), path.join(ROOT, 'suppliers', 'towar-1.jpg'));
    assert.equal(resolveSafe('zamowienie-1.pdf', 'orders', ROOT), path.join(ROOT, 'orders', 'zamowienie-1.pdf'));
  });
  it('odrzuca ścieżki, „..”, ukośniki, spacje i pustą nazwę', () => {
    for (const bad of ['../x.pdf', '..', 'a/b.pdf', 'a\\b.pdf', '', 'a b.pdf', 'x%2f.pdf']) {
      assert.throws(() => resolveSafe(bad, undefined, ROOT), /Nieprawidłowa nazwa/, bad);
    }
  });
});

describe('deleteUploadFile', () => {
  it('kasuje plik, a brak pliku nie jest błędem', async () => {
    await fsp.mkdir(path.join(ROOT, 'orders'), { recursive: true });
    const file = path.join(ROOT, 'orders', 'do-usuniecia.pdf');
    await fsp.writeFile(file, 'x');
    await deleteUploadFile('do-usuniecia.pdf', 'orders', ROOT);
    await assert.rejects(fsp.access(file));
    await deleteUploadFile('do-usuniecia.pdf', 'orders', ROOT); // drugi raz — bez błędu
  });
});

describe('detectUploadType — typ po zawartości dla /api/upload', () => {
  it('obrazy, PDF, DOCX (ZIP), DOC (OLE)', () => {
    assert.equal(detectUploadType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'jpg');
    assert.equal(detectUploadType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'png');
    assert.equal(detectUploadType(Buffer.from('%PDF-1.7\n...')), 'pdf');
    assert.equal(detectUploadType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0])), 'docx');
    assert.equal(detectUploadType(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0])), 'doc');
  });
  it('HTML, SVG i skrypt udające obrazek → null', () => {
    assert.equal(detectUploadType(Buffer.from('<html><script>alert(1)</script></html>')), null);
    assert.equal(detectUploadType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')), null);
    assert.equal(detectUploadType(Buffer.from('alert(1)')), null);
    assert.equal(detectUploadType(Buffer.alloc(0)), null);
  });
});

describe('isUserUploadFilename — co wolno skasować przez /api/upload', () => {
  it('tylko pliki `produkt-…` z /api/upload', () => {
    assert.equal(isUserUploadFilename('produkt-1760000000000-123456.jpg'), true);
    assert.equal(isUserUploadFilename('produkt-1760000000000-a1b2c3d4e5f60718.pdf'), true);
  });
  it('kolaże, PDF-y zamówień, zdjęcia towarów, ścieżki → nie', () => {
    for (const bad of ['kolaz-1-2.jpg', 'zamowienie-2026-10-15-abcdef12.pdf', 'towar-' + 'a'.repeat(32) + '.jpg',
      'produkt-../x.jpg', 'orders/produkt-1.pdf', 'produkt-1', '', null, undefined]) {
      assert.equal(isUserUploadFilename(bad), false, String(bad));
    }
  });
});
