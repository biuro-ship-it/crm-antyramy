import type { CampaignDraft } from '../services/api';

// Kampanie — czyste reguły kroku „Wysyłka”: co musi być uzupełnione
// i czy mail testowy dotyczył aktualnej wersji maila.

type DraftContent = Pick<CampaignDraft, 'variantA' | 'variantB'>;

/** Braki w temacie / treści (krok 2) — komunikat albo null. */
export const contentError = (d: DraftContent): string | null => {
  if (!d.variantA.subject.trim()) return 'Uzupełnij temat maila (krok 2).';
  if (!d.variantA.content.trim()) return 'Uzupełnij treść maila (krok 2).';
  if (d.variantB && !d.variantB.subject.trim()) return 'Uzupełnij temat B albo wyłącz test A/B (krok 2).';
  if (d.variantB && d.variantB.content !== null && !d.variantB.content.trim()) return 'Uzupełnij treść B albo użyj wspólnej (krok 2).';
  return null;
};

export const recipientsError = (sendableCount: number): string | null =>
  sendableCount === 0 ? 'Wybierz odbiorców (krok 3).' : null;

/**
 * Odcisk tego, co widzi odbiorca: tytuł, produkty, temat i treść A/B, kolaż.
 * Nazwa kampanii i lista odbiorców nie wpływają na wygląd maila — ich zmiana
 * nie unieważnia wysłanego testu.
 */
export const contentFingerprint = (d: CampaignDraft): string =>
  JSON.stringify([
    d.pdfTitle,
    d.productIds,
    d.variantA.subject,
    d.variantA.content,
    d.variantB ? [d.variantB.subject, d.variantB.content] : null,
    d.heroImageUrl ?? null,
  ]);
