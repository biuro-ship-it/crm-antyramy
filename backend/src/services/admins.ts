// Administratorzy CRM — konta z ADMIN_EMAILS w .env (po przecinku), domyślnie biuro@antyramy.eu.
// Mogą np. usunąć błędny wpis z Historii zamówień dostawcy. Testy: admins.test.ts.

/** Lista adresów z .env (po przecinku), małymi literami; pusta zmienna → domyślna lista. */
export const parseEmailList = (value: string | undefined, fallback: string): string[] =>
  (value && value.trim() ? value : fallback).split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

export const isAdminEmail = (email: string | undefined, admins: string[]): boolean =>
  !!email && admins.includes(email.trim().toLowerCase());

export const ADMIN_EMAILS = parseEmailList(process.env.ADMIN_EMAILS, 'biuro@antyramy.eu');

export const isAdmin = (email: string | undefined): boolean => isAdminEmail(email, ADMIN_EMAILS);
