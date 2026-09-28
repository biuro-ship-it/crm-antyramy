// Ostrzeżenie „podpis dodaje się automatycznie” — gdy w ostatnich 3 niepustych
// liniach treści jest słowo „Antyramy” i numer telefonu (min. 9 cyfr).
const PHONE_RE = /(?:\+?48[\s-]?)?(?:\d[\s-]?){9}/;

export const endsWithSignature = (content: string): boolean => {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(-3);
  const tail = lines.join('\n');
  return /antyramy/i.test(tail) && PHONE_RE.test(tail);
};

export const SIGNATURE_WARNING = 'Podpis dodaje się automatycznie, usuń go z treści.';
