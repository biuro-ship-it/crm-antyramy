// Podpis w stopce maili (kampanie, promocje, szablony). Treść edytowalna
// w Administracji (dokument settings/emailSignature); tu wartości domyślne
// i składanie HTML — jedno miejsce dla wszystkich maili.
// Firebase ładowany dopiero w getSignature(): buildSignatureHtml jest czysty
// i testowany bez .env (CI odpala testy bez konta serwisowego).

export interface EmailSignature {
  greeting: string;
  name: string;
  website: string;
  phone: string;
  email: string;
}

export const SIGNATURE_DOC = 'settings/emailSignature';

export const DEFAULT_SIGNATURE: EmailSignature = {
  greeting: 'Pozdrawiam',
  name: 'Krzysztof Godek',
  website: 'https://b2b.antyramy.eu/',
  phone: '500 601 601',
  email: 'biuro@antyramy.eu',
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Puste pole w ustawieniach = pominięte w stopce (nie wraca do domyślnego)
export const buildSignatureHtml = (sig: EmailSignature): string => {
  const contacts: string[] = [];
  if (sig.website) {
    const href = /^https?:\/\//i.test(sig.website) ? sig.website : `https://${sig.website}`;
    contacts.push(`<a href="${escapeHtml(href)}" style="color:#1a56db;text-decoration:none">${escapeHtml(sig.website)}</a>`);
  }
  if (sig.phone) {
    const tel = sig.phone.replace(/[^\d+]/g, '');
    const telHref = tel.startsWith('+') ? tel : `+48${tel}`;
    contacts.push(`<a href="tel:${escapeHtml(telHref)}" style="color:#888;text-decoration:none">${escapeHtml(sig.phone)}</a>`);
  }
  if (sig.email) {
    contacts.push(`<a href="mailto:${escapeHtml(sig.email)}" style="color:#888;text-decoration:none">${escapeHtml(sig.email)}</a>`);
  }

  return [
    sig.greeting ? `${escapeHtml(sig.greeting)},` : '',
    sig.name ? `<strong style="color:#333">${escapeHtml(sig.name)}</strong>` : '',
    contacts.join(', '),
  ].filter(Boolean).join('<br>\n            ');
};

export const getSignature = async (): Promise<EmailSignature> => {
  try {
    const { db } = await import('./firebase');
    const snap = await db.doc(SIGNATURE_DOC).get();
    return snap.exists ? { ...DEFAULT_SIGNATURE, ...(snap.data() as Partial<EmailSignature>) } : DEFAULT_SIGNATURE;
  } catch (err) {
    // Brak ustawień nie może zablokować wysyłki — lepszy domyślny podpis niż błąd
    console.error('[emailSignature] odczyt ustawień nieudany, używam domyślnego:', err);
    return DEFAULT_SIGNATURE;
  }
};

export const getSignatureHtml = async (): Promise<string> => buildSignatureHtml(await getSignature());
