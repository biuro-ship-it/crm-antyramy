/**
 * Jednorazowy skrypt do wygenerowania Gmail refresh_token.
 * Uruchom: node scripts/get-gmail-token.js
 * Wymaga: gmail_credentials.json w katalogu backend/
 *
 * Nowy refresh token zapisuje się od razu w backend/.env (poprzednia wersja
 * pliku → .env.bak) — nie wypisujemy go na ekran, żeby nie trafił do logów/czatu.
 * Na serwer trzeba go przenieść osobno (patrz HANDOVER.md).
 */

const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'gmail_credentials.json');
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events', // integracja z Google Calendar
  'https://www.googleapis.com/auth/gmail.readonly',  // kampanie: wykrywanie odpowiedzi w wątkach
];
const ENV_PATH = path.join(__dirname, '..', '.env');

// Podmienia (albo dopisuje) GMAIL_REFRESH_TOKEN w backend/.env
const writeRefreshToken = (token) => {
  const current = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  if (current) fs.writeFileSync(`${ENV_PATH}.bak`, current);
  const line = `GMAIL_REFRESH_TOKEN=${token}`;
  const next = /^GMAIL_REFRESH_TOKEN=.*$/m.test(current)
    ? current.replace(/^GMAIL_REFRESH_TOKEN=.*$/m, line)
    : `${current.replace(/\s*$/, '')}\n${line}\n`;
  fs.writeFileSync(ENV_PATH, next);
};
const REDIRECT_PORT = 3456;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

if (!fs.existsSync(CREDENTIALS_PATH)) {
  console.error('\n❌ Brak pliku gmail_credentials.json w katalogu backend/');
  console.error('   Pobierz go z Google Cloud Console → Credentials → pobierz JSON\n');
  process.exit(1);
}

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
const { client_id, client_secret } = credentials.installed || credentials.web;

const oauth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log('\n🔐 Otwieranie przeglądarki — zaloguj się na biuro@antyramy.eu\n');

// Otwórz przeglądarkę
const openCmd = process.platform === 'win32' ? `start "" "${authUrl}"` : `open "${authUrl}"`;
exec(openCmd);

// Lokaly serwer do złapania callback
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  if (parsedUrl.pathname !== '/callback') return;

  const code = parsedUrl.query.code;
  if (!code) {
    res.end('Brak kodu autoryzacji.');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2 style="font-family:sans-serif;color:green">OK — mozesz zamknac te karte.</h2>');
    server.close();

    if (tokens.refresh_token) {
      writeRefreshToken(tokens.refresh_token);
      console.log('\n✅ Gotowe! Nowy GMAIL_REFRESH_TOKEN zapisany w backend/.env (poprzedni plik: .env.bak).');
      console.log(`   Uprawnienia: ${SCOPES.map(s => s.split('/').pop()).join(', ')}\n`);
    }

    if (!tokens.refresh_token) {
      console.warn('⚠️  Brak refresh_token — jeśli to nie pierwsza autoryzacja,');
      console.warn('   odwołaj dostęp na https://myaccount.google.com/permissions i uruchom skrypt ponownie.\n');
    }
  } catch (err) {
    res.end('Błąd: ' + err.message);
    console.error('\n❌ Błąd:', err.message);
    server.close();
  }
});

server.listen(REDIRECT_PORT, () => {
  console.log(`⏳ Czekam na autoryzację na porcie ${REDIRECT_PORT}...\n`);
  console.log(`   Jeśli przeglądarka się nie otworzyła, wejdź ręcznie:\n   ${authUrl}\n`);
});
