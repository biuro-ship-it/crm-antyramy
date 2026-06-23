import { google, calendar_v3 } from 'googleapis';

/**
 * Klient Google Calendar — reużywa tej samej konfiguracji OAuth2 co Gmail
 * (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN).
 *
 * WAŻNE: refresh token musi mieć scope 'https://www.googleapis.com/auth/calendar.events'.
 * Domyślnie wygenerowany token ma tylko 'gmail.send' — trzeba go zregenerować
 * skryptem scripts/get-gmail-token.js z dodanym scope (patrz README/plan).
 */
export const getCalendarClient = (): calendar_v3.Calendar => {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;

  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new Error('Brak konfiguracji Google API w .env (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN)');
  }

  const oauth2Client = new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    'http://localhost:3456/callback'
  );

  oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
  return google.calendar({ version: 'v3', auth: oauth2Client });
};

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

interface CalendarEventInput {
  summary: string;
  description?: string;
  date: string; // YYYY-MM-DD (wydarzenie całodniowe)
}

// Następny dzień w formacie YYYY-MM-DD (Google wymaga end.date jako dzień PO wydarzeniu całodniowym)
const nextDay = (date: string): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
};

/** Tworzy wydarzenie całodniowe z przypomnieniami. Zwraca eventId. */
export const createEvent = async (input: CalendarEventInput): Promise<string> => {
  const calendar = getCalendarClient();
  const res = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary: input.summary,
      description: input.description,
      start: { date: input.date },
      end: { date: nextDay(input.date) },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 9 * 60 },   // tego dnia rano (9:00 dla wydarzenia o północy)
          { method: 'email', minutes: 24 * 60 },   // dzień wcześniej mailem
        ],
      },
    },
  });
  return res.data.id || '';
};

/** Aktualizuje istniejące wydarzenie (patch). */
export const updateEvent = async (
  eventId: string,
  patch: Partial<CalendarEventInput>
): Promise<void> => {
  const calendar = getCalendarClient();
  const requestBody: calendar_v3.Schema$Event = {};
  if (patch.summary !== undefined) requestBody.summary = patch.summary;
  if (patch.description !== undefined) requestBody.description = patch.description;
  if (patch.date !== undefined) {
    requestBody.start = { date: patch.date };
    requestBody.end = { date: nextDay(patch.date) };
  }
  await calendar.events.patch({ calendarId: CALENDAR_ID, eventId, requestBody });
};

/** Usuwa wydarzenie. Ignoruje 404/410 (już usunięte). */
export const deleteEvent = async (eventId: string): Promise<void> => {
  const calendar = getCalendarClient();
  try {
    await calendar.events.delete({ calendarId: CALENDAR_ID, eventId });
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code !== 404 && code !== 410) throw err;
  }
};
