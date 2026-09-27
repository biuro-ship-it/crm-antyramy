/**
 * Jednorazowe odtworzenie archiwum promocji (kolekcja `promotions`) z historii
 * kontaktów klientów — dla wysyłek sprzed wprowadzenia archiwum.
 *
 * Domyślnie TYLKO podgląd (nic nie zapisuje). Zapis dopiero z --live.
 * Przed --live zrób kopię: zakładka Archiwum → ZIP.
 *
 * Uruchomienie:
 *   cd backend
 *   npx ts-node src/scripts/backfill-promotions.ts          # podgląd
 *   npx ts-node src/scripts/backfill-promotions.ts --live   # zapis
 *
 * Ograniczenia odtworzonych kampanii (oznaczone legacy: true):
 *   - temat maila nieznany (subject: ''),
 *   - produkty i ceny z BIEŻĄCEGO katalogu (usunięte produkty są pomijane),
 *   - brak informacji o nieudanych wysyłkach (wpis powstawał tylko przy sukcesie).
 * Ponowne uruchomienie nie tworzy duplikatów (klucz: tytuł + dzień, względem całego archiwum).
 */

import { db } from '../services/firebase';
import { buildPromotionEmailHtml } from '../services/promotionEmail';
import { groupLegacyPromotions, isPromotionInteraction, LegacyInteraction } from '../services/promotionBackfill';

const LIVE = process.argv.includes('--live');

interface CatalogProduct {
  id: string; name: string; code: string; priceNetto: number; imageUrl: string;
}

async function main() {
  console.log(LIVE ? '\n=== TRYB ZAPISU (--live) ===\n' : '\n=== PODGLĄD (bez zapisu; dodaj --live, aby zapisać) ===\n');

  // 1. Wpisy „Wysłano promocję” ze wszystkich klientów
  const clientsSnap = await db.collection('clients').get();
  const items: LegacyInteraction[] = [];
  for (const client of clientsSnap.docs) {
    const c = client.data() as { companyName?: string; email?: string };
    const inter = await client.ref.collection('interactions').get();
    for (const doc of inter.docs) {
      const d = doc.data();
      if (!isPromotionInteraction(d.notes)) continue;
      items.push({
        clientId: client.id,
        companyName: c.companyName || '',
        email: c.email || '',
        contactDate: d.contactDate || '',
        notes: d.notes,
        tradeNotes: d.tradeNotes,
        products: Array.isArray(d.products) ? d.products : [],
        createdBy: d.createdBy,
        createdAt: d.createdAt,
      });
    }
  }
  console.log(`Klientów: ${clientsSnap.size}, wpisów o promocjach: ${items.length}`);

  const groups = groupLegacyPromotions(items);
  if (groups.length === 0) {
    console.log('Brak promocji do odtworzenia.');
    return;
  }

  // 2. Katalog produktów i już istniejące rekordy (idempotencja)
  const productsSnap = await db.collection('products').get();
  const catalog = new Map<string, CatalogProduct>(
    productsSnap.docs.map(d => {
      const p = d.data();
      return [d.id, { id: d.id, name: p.name || '', code: p.code || '', priceNetto: p.priceNetto || 0, imageUrl: p.imageUrl || '' }];
    })
  );

  // Wszystkie rekordy, nie tylko legacy — nowe wysyłki też zostawiają wpis
  // „Wysłano promocję” u klientów i bez tego skrypt by je zdublował.
  const existingSnap = await db.collection('promotions').select('title', 'sentAt').get();
  const existingKeys = new Set(existingSnap.docs.map(d => {
    const x = d.data();
    return `${x.title}|${String(x.sentAt).slice(0, 10)}`;
  }));

  // 3. Zapis / podgląd
  let created = 0;
  let skipped = 0;
  for (const g of groups) {
    const key = `${g.title}|${g.sentAt.slice(0, 10)}`;
    const products = g.productIds.map(id => catalog.get(id)).filter((p): p is CatalogProduct => !!p);
    const missing = g.productIds.length - products.length;

    const line = `${g.contactDate}  „${g.title}”  odbiorców: ${g.recipients.length}  produktów: ${products.length}` +
      (missing > 0 ? ` (brak w katalogu: ${missing})` : '');

    if (existingKeys.has(key)) {
      console.log(`  [pomijam — już jest] ${line}`);
      skipped++;
      continue;
    }
    console.log(`  [${LIVE ? 'zapisuję' : 'do zapisu'}] ${line}`);

    if (LIVE) {
      await db.collection('promotions').add({
        title: g.title,
        subject: '',
        content: g.content,
        htmlBody: buildPromotionEmailHtml(g.title, g.content, products),
        products,
        recipients: g.recipients.map(r => ({ ...r, status: 'sent' })),
        sentCount: g.recipients.length,
        failedCount: 0,
        totalCount: g.recipients.length,
        skippedNoEmail: 0,
        sentAt: g.sentAt,
        sentBy: g.sentBy,
        legacy: true,
      });
    }
    created++;
  }

  console.log(`\n${LIVE ? 'Zapisano' : 'Do zapisu'}: ${created}, pominięto (już w archiwum): ${skipped}`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Błąd:', err);
    process.exit(1);
  });
