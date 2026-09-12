/**
 * Firestore `.update()` na nieistniejącym dokumencie rzuca gRPC NOT_FOUND (code 5).
 * Bez tego rozpoznania użytkownik dostawał 500 („Błąd aktualizacji klienta") w sytuacji,
 * która jest zwykłym 404 — np. gdy rekord usunięto w drugiej karcie przeglądarki.
 */
export const isNotFound = (err: unknown): boolean =>
  (err as { code?: number })?.code === 5;
