import { google } from 'googleapis';

const getGmailClient = () => {
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

interface SendEmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
  pdfBuffer?: Buffer;
  pdfFilename?: string;
}

const buildRawMessage = (options: SendEmailOptions, sender: string): string => {
  const { to, subject, htmlBody, pdfBuffer, pdfFilename } = options;
  const boundary = `boundary_${Date.now()}`;

  const encodeBase64Url = (str: string) =>
    Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;

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
      `Content-Transfer-Encoding: quoted-printable`,
      '',
      htmlBody,
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
      '',
      htmlBody,
    ].join('\r\n');
  }

  return encodeBase64Url(raw);
};

export const sendEmail = async (options: SendEmailOptions): Promise<void> => {
  const gmail = getGmailClient();
  const sender = process.env.GMAIL_SENDER || 'biuro@antyramy.eu';

  const raw = buildRawMessage(options, sender);
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
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
      failed.push({ email: recipient.email, error: (err as Error).message });
    }
  }

  return { sent, failed };
};
