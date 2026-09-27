// Odtwarzanie archiwum promocji z historii kontaktów klientów.
// Przed archiwum (kolekcja `promotions`) jedynym śladem wysyłki był wpis
// „Wysłano promocję: {tytuł}” w podkolekcji interactions każdego odbiorcy.
// Czysta funkcja — bez Firestore, żeby dało się ją przetestować.

export const PROMO_PREFIX = 'Wysłano promocję: ';

export interface LegacyInteraction {
  clientId: string;
  companyName: string;
  email: string;
  contactDate: string;   // YYYY-MM-DD
  notes: string;
  tradeNotes?: string;
  products?: string[];
  createdBy?: string;
  createdAt?: string;    // ISO
}

export interface LegacyPromotionGroup {
  title: string;
  content: string;
  contactDate: string;
  productIds: string[];
  sentAt: string;
  sentBy: string;
  recipients: Array<{ clientId: string; companyName: string; email: string }>;
}

export const isPromotionInteraction = (notes: unknown): boolean =>
  typeof notes === 'string' && notes.startsWith(PROMO_PREFIX);

// Jedna wysyłka = ten sam dzień + tytuł + treść. Każdy klient liczony raz.
export const groupLegacyPromotions = (items: LegacyInteraction[]): LegacyPromotionGroup[] => {
  const groups = new Map<string, LegacyPromotionGroup>();

  for (const it of items) {
    if (!isPromotionInteraction(it.notes)) continue;
    const title = it.notes.slice(PROMO_PREFIX.length).trim();
    const content = it.tradeNotes ?? '';
    const key = JSON.stringify([it.contactDate, title, content]);
    const createdAt = it.createdAt || `${it.contactDate}T00:00:00.000Z`;

    let g = groups.get(key);
    if (!g) {
      g = {
        title,
        content,
        contactDate: it.contactDate,
        productIds: [...(it.products ?? [])],
        sentAt: createdAt,
        sentBy: it.createdBy || 'system',
        recipients: [],
      };
      groups.set(key, g);
    } else if (createdAt < g.sentAt) {
      g.sentAt = createdAt;
      if (it.createdBy) g.sentBy = it.createdBy;
    }

    if (!g.recipients.some(r => r.clientId === it.clientId)) {
      g.recipients.push({ clientId: it.clientId, companyName: it.companyName, email: it.email });
    }
  }

  return [...groups.values()].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
};
