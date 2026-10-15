/**
 * Dzisiejsza data jako YYYY-MM-DD w LOKALNEJ strefie użytkownika.
 *
 * `new Date().toISOString().split('T')[0]` zwraca datę UTC — w Polsce (UTC+1/+2)
 * między północą a 2:00 dawało to dzień POPRZEDNI, więc sprzedaż albo notatka
 * dodane nocą zapisywały się z wczorajszą datą.
 */
export const todayISO = (d: Date = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Data sprzed `days` dni (YYYY-MM-DD, strefa lokalna) — np. najwcześniejsza data wysyłki zamówienia. */
export const daysAgoISO = (days: number, now: Date = new Date()): string => {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return todayISO(d);
};

/** Czy podana data (YYYY-MM-DD) jest wcześniejsza niż dziś. */
export const isPastDate = (dateStr: string): boolean => !!dateStr && dateStr < todayISO();
