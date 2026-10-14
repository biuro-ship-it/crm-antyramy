import { google } from 'googleapis';
import { parseGmailMessage, ThreadMessage } from './campaignResults';

export const getGmailClient = () => {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;

  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new Error('Brak konfiguracji Gmail API w .env (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN)');
  }

  const oauth2Client = new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    'http://localhost:3456/callback'
  );

  oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth: oauth2Client });
};

export interface SendEmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
  pdfBuffer?: Buffer;
  pdfFilename?: string;
}

/** Eksportowane dla testów — składa wiadomość RFC 2822 zakodowaną base64url. */
export const buildRawMessage = (options: SendEmailOptions, sender: string): string => {
  const { to, subject, htmlBody, pdfBuffer, pdfFilename } = options;
  const boundary = `boundary_${Date.now()}`;

  const encodeBase64Url = (str: string) =>
    Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;

  // Cialo HTML kodujemy base64 w liniach po 76 znakow (RFC 2045).
  // Wczesniej deklarowalismy quoted-printable, ale wstawialismy surowy HTML —
  // a w QP kazde `=` (czyli kazde `style=`, `href=`, `width=`) to poczatek
  // sekwencji escape, wiec zgodny ze specyfikacja klient pocztowy psul tresc
  // i polskie znaki diakrytyczne.
  const bodyBase64 = Buffer.from(htmlBody, 'utf-8')
    .toString('base64')
    .replace(/(.{76})/g, '$1\r\n');

  let raw: string;

  if (pdfBuffer && pdfFilename) {
    const pdfBase64 = pdfBuffer.toString('base64');
    raw = [
      `From: ${sender}`,
      `To: ${to}`,
      `Subject: ${subjectEncoded}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      '',
      bodyBase64,
      '',
      `--${boundary}`,
      `Content-Type: application/pdf; name="${pdfFilename}"`,
      `Content-Transfer-Encoding: base64`,
      `Content-Disposition: attachment; filename="${pdfFilename}"`,
      '',
      pdfBase64,
      '',
      `--${boundary}--`,
    ].join('\r\n');
  } else {
    raw = [
      `From: ${sender}`,
      `To: ${to}`,
      `Subject: ${subjectEncoded}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      '',
      bodyBase64,
    ].join('\r\n');
  }

  return encodeBase64Url(raw);
};

export interface SentEmailIds {
  id: string | null;
  threadId: string | null;
}

// Zwraca id wiadomości i wątku z Gmaila — kampanie zapisują je, żeby później
// sprawdzać odpowiedzi w wątku. Dotychczasowe wywołania mogą wynik ignorować.
export const sendEmail = async (options: SendEmailOptions): Promise<SentEmailIds> => {
  const gmail = getGmailClient();
  const sender = process.env.GMAIL_SENDER || 'biuro@antyramy.eu';

  const raw = buildRawMessage(options, sender);
  try {
    const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return { id: res.data.id ?? null, threadId: res.data.threadId ?? null };
  } catch (err) {
    if (isInvalidGrant(err)) throw new Error(GMAIL_TOKEN_ERROR);
    throw err;
  }
};

// Google odpowiada „invalid_grant”, gdy refresh token wygasł albo został cofnięty —
// sam komunikat nic nie mówi użytkownikowi, więc zamieniamy go na instrukcję.
export const GMAIL_TOKEN_ERROR =
  'Gmail odrzucił wysyłkę: token poczty wygasł albo został cofnięty. Wygeneruj nowy (node scripts/get-gmail-token.js, patrz HANDOVER.md) i przenieś go na serwer';

export const isInvalidGrant = (err: unknown): boolean => {
  const e = err as { message?: string; response?: { data?: { error?: string } } } | null;
  return e?.response?.data?.error === 'invalid_grant' || /invalid_grant/.test(e?.message ?? '');
};

export const GMAIL_READ_SCOPE_ERROR =
  'Brak uprawnienia do czytania poczty — wygeneruj nowy token Gmail (node scripts/get-gmail-token.js, patrz HANDOVER.md)';

export const GMAIL_RATE_LIMIT_ERROR =
  'Gmail chwilowo ogranicza liczbę zapytań — spróbuj ponownie za minutę';

type GoogleApiError = { code?: number | string; message?: string; errors?: Array<{ reason?: string }> } | null;

// Limit zapytań Google zwraca jako 429 albo 403 („Quota exceeded…”, rateLimitExceeded) —
// to NIE jest brak uprawnienia, tylko chwilowa blokada.
export const isRateLimitError = (err: unknown): boolean => {
  const e = err as GoogleApiError;
  if (!e) return false;
  if (Number(e.code) === 429) return true;
  const reason = e.errors?.[0]?.reason ?? '';
  return /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(reason)
    || /quota exceeded|rate limit/i.test(e.message ?? '');
};

export const isMissingScopeError = (err: unknown): boolean => {
  const e = err as GoogleApiError;
  if (!e || isRateLimitError(e)) return false;
  return Number(e.code) === 403 || /insufficient|scope/i.test(e.message ?? '');
};

const RATE_LIMIT_RETRY_DELAYS_MS = [1000, 2000, 4000];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Wiadomości wątku (kampanie: wykrywanie odpowiedzi). Wymaga scope gmail.readonly.
// Przy limicie zapytań ponawia po 1, 2 i 4 s.
export const getThreadMessages = async (threadId: string): Promise<ThreadMessage[]> => {
  const gmail = getGmailClient();
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
      return (res.data.messages ?? []).map(parseGmailMessage);
    } catch (err) {
      if (isRateLimitError(err)) {
        if (attempt < RATE_LIMIT_RETRY_DELAYS_MS.length) {
          await sleep(RATE_LIMIT_RETRY_DELAYS_MS[attempt]);
          continue;
        }
        console.error(`[gmail] limit zapytań, wątek ${threadId}:`, (err as Error).message);
        throw new Error(GMAIL_RATE_LIMIT_ERROR);
      }
      if (isMissingScopeError(err)) {
        console.error(`[gmail] brak uprawnienia, wątek ${threadId}:`, (err as Error).message);
        throw new Error(GMAIL_READ_SCOPE_ERROR);
      }
      throw err;
    }
  }
};

export const sendBulkEmails = async (
  recipients: Array<{ email: string; name: string }>,
  subject: string,
  htmlBody: string,
  pdfBuffer?: Buffer,
  pdfFilename?: string
): Promise<{ sent: number; failed: Array<{ email: string; error: string }> }> => {
  let sent = 0;
  const failed: Array<{ email: string; error: string }> = [];

  for (const recipient of recipients) {
    try {
      await sendEmail({
        to: recipient.email,
        subject,
        htmlBody,
        pdfBuffer,
        pdfFilename,
      });
      sent++;
      // Przerwa 200ms między mailami — ochrona przed rate limit Gmail API
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error(`[gmail] wysyłka do ${recipient.email} nieudana:`, err);
      failed.push({ email: recipient.email, error: (err as Error).message });
    }
  }

  return { sent, failed };
};
