import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getGmailClient, buildRawMessage } from './gmail';

describe('getGmailClient — smoke test konfiguracji', () => {
  const saved: Partial<Record<string, string>> = {};
  const vars = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'] as const;

  beforeEach(() => {
    vars.forEach(k => { saved[k] = process.env[k]; });
  });

  afterEach(() => {
    vars.forEach(k => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });

  it('rzuca błąd gdy brakuje GMAIL_CLIENT_ID', () => {
    delete process.env.GMAIL_CLIENT_ID;
    process.env.GMAIL_CLIENT_SECRET = 'secret';
    process.env.GMAIL_REFRESH_TOKEN = 'token';
    assert.throws(() => getGmailClient(), /Brak konfiguracji Gmail API w \.env/);
  });

  it('rzuca błąd gdy brakuje GMAIL_CLIENT_SECRET', () => {
    process.env.GMAIL_CLIENT_ID = 'id';
    delete process.env.GMAIL_CLIENT_SECRET;
    process.env.GMAIL_REFRESH_TOKEN = 'token';
    assert.throws(() => getGmailClient(), /Brak konfiguracji Gmail API w \.env/);
  });

  it('rzuca błąd gdy brakuje GMAIL_REFRESH_TOKEN', () => {
    process.env.GMAIL_CLIENT_ID = 'id';
    process.env.GMAIL_CLIENT_SECRET = 'secret';
    delete process.env.GMAIL_REFRESH_TOKEN;
    assert.throws(() => getGmailClient(), /Brak konfiguracji Gmail API w \.env/);
  });

  it('zwraca klienta gdy wszystkie zmienne są ustawione', () => {
    process.env.GMAIL_CLIENT_ID = 'test-client-id';
    process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
    process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';
    assert.doesNotThrow(() => getGmailClient());
  });
});

// Ciało maila było wcześniej wysyłane jako surowy HTML pod nagłówkiem
// `Content-Transfer-Encoding: quoted-printable` — każde `=` w atrybutach HTML
// psuło treść u zgodnych ze specyfikacją klientów pocztowych. Te testy pilnują,
// że ciało jest base64 i że po odkodowaniu wraca bajt w bajt.
describe('buildRawMessage — kodowanie wiadomości', () => {
  const HTML =
    '<html><body style="margin:0;padding:0">' +
    '<p style="color:#333">Zażółć gęślą jaźń — 1 234,50 zł netto</p>' +
    '<a href="https://antyramy.eu">antyramy.eu</a></body></html>';

  const decodeRaw = (raw: string): string =>
    Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');

  /** Wyciąga i odkodowuje część text/html z wiadomości MIME. */
  const htmlPart = (message: string): string => {
    const marker = 'Content-Transfer-Encoding: base64\r\n\r\n';
    const start = message.indexOf(marker, message.indexOf('text/html'));
    assert.notEqual(start, -1, 'część text/html musi deklarować base64');
    const after = message.slice(start + marker.length);
    const end = after.search(/\r\n(\r\n|--)/);
    const b64 = (end === -1 ? after : after.slice(0, end)).replace(/\r\n/g, '');
    return Buffer.from(b64, 'base64').toString('utf-8');
  };

  it('bez załącznika: ciało jest base64 i odkodowuje się bez zmian', () => {
    const message = decodeRaw(
      buildRawMessage({ to: 'k@example.com', subject: 'Test', htmlBody: HTML }, 'biuro@antyramy.eu')
    );
    assert.match(message, /Content-Type: text\/html; charset=UTF-8/);
    assert.doesNotMatch(message, /quoted-printable/);
    assert.equal(htmlPart(message), HTML);
  });

  it('z załącznikiem PDF: ciało HTML i PDF są osobnymi częściami base64', () => {
    const pdf = Buffer.from('%PDF-1.4 udawany plik');
    const message = decodeRaw(
      buildRawMessage(
        { to: 'k@example.com', subject: 'Oferta', htmlBody: HTML, pdfBuffer: pdf, pdfFilename: 'oferta.pdf' },
        'biuro@antyramy.eu'
      )
    );
    assert.match(message, /Content-Type: multipart\/mixed; boundary="boundary_\d+"/);
    assert.doesNotMatch(message, /quoted-printable/);
    assert.equal(htmlPart(message), HTML);
    assert.match(message, /Content-Disposition: attachment; filename="oferta\.pdf"/);
    assert.ok(
      message.includes(pdf.toString('base64')),
      'załącznik musi trafić do wiadomości jako base64'
    );
  });

  it('temat z polskimi znakami jest kodowany jako =?UTF-8?B?', () => {
    const message = decodeRaw(
      buildRawMessage({ to: 'k@example.com', subject: 'Wrześniowa oferta', htmlBody: '<p>x</p>' }, 'biuro@antyramy.eu')
    );
    assert.match(message, /Subject: =\?UTF-8\?B\?/);
    const encoded = /Subject: =\?UTF-8\?B\?(.+?)\?=/.exec(message)?.[1] ?? '';
    assert.equal(Buffer.from(encoded, 'base64').toString('utf-8'), 'Wrześniowa oferta');
  });

  it('długie ciało jest łamane na linie nie dłuższe niż 76 znaków (RFC 2045)', () => {
    const long = `<p>${'a'.repeat(5000)}</p>`;
    const message = decodeRaw(
      buildRawMessage({ to: 'k@example.com', subject: 'Długi', htmlBody: long }, 'biuro@antyramy.eu')
    );
    assert.equal(htmlPart(message), long);
    const tooLong = message.split('\r\n').filter(l => l.length > 76 && !l.startsWith('Content-'));
    assert.deepEqual(tooLong, [], 'żadna linia base64 nie może przekroczyć 76 znaków');
  });
});
