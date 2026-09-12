import * as admin from 'firebase-admin';

// Formatter na sztywno w strefie Europe/Warsaw — nie polegamy na TZ serwera
// (Passenger na s61 startuje w UTC, więc `new Date().toISOString()` przed 2:00
// czasu polskiego zwracałby jeszcze dzień poprzedni).
const WARSAW = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Warsaw',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Dzisiejsza data w Polsce, YYYY-MM-DD. */
export const todayISO = (): string => {
  const parts = WARSAW.formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

/**
 * Przelicza `lastContactAt` na najpóźniejszą datę z podkolekcji `interactions`.
 *
 * Wcześniej pole ustawiane było bezwarunkowo na datę dopisywanej notatki, więc
 * dopisanie zaległego kontaktu (np. z marca) COFAŁO „ostatni kontakt" — klient
 * wypadał z sortowania „najdawniej kontaktowani" i z kafelka „Aktywni (30 dni)".
 * Edycja daty istniejącej notatki nie przeliczała pola w ogóle.
 */
export const recomputeLastContact = async (
  ref: admin.firestore.DocumentReference,
): Promise<void> => {
  const snap = await ref.collection('interactions').orderBy('contactDate', 'desc').limit(1).get();
  const latest = snap.empty ? null : ((snap.docs[0].data().contactDate as string) || null);
  await ref.update({ lastContactAt: latest, updatedAt: new Date().toISOString() });
};
