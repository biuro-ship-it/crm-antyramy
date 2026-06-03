/**
 * Skrypt migracyjny: naprawia imageUrl produktów w Firestore
 * Zamienia https://api.crm.antyramy.eu/uploads/... → https://crm.antyramy.eu/uploads/...
 *
 * Uruchomienie:
 *   cd backend
 *   npx ts-node src/scripts/fix-product-image-urls.ts
 */

import { db } from '../services/firebase';

const OLD_BASE = 'https://api.crm.antyramy.eu';
const NEW_BASE = 'https://crm.antyramy.eu';

async function fixImageUrls() {
  const snapshot = await db.collection('products').get();

  if (snapshot.empty) {
    console.log('Brak produktów w bazie.');
    return;
  }

  const toFix = snapshot.docs.filter(doc => {
    const url: string = doc.data().imageUrl || '';
    return url.startsWith(OLD_BASE);
  });

  if (toFix.length === 0) {
    console.log(`Sprawdzono ${snapshot.size} produktów — brak błędnych URL-i. Nic do poprawienia.`);
    return;
  }

  console.log(`Znaleziono ${toFix.length} produktów do naprawienia (z ${snapshot.size} łącznie):`);

  const batch = db.batch();

  for (const doc of toFix) {
    const oldUrl: string = doc.data().imageUrl;
    const newUrl = oldUrl.replace(OLD_BASE, NEW_BASE);
    console.log(`  [${doc.id}] ${oldUrl}`);
    console.log(`          → ${newUrl}`);
    batch.update(doc.ref, { imageUrl: newUrl, updatedAt: new Date().toISOString() });
  }

  await batch.commit();
  console.log(`\nGotowe — zaktualizowano ${toFix.length} produktów.`);
}

fixImageUrls().catch(err => {
  console.error('Błąd:', err);
  process.exit(1);
});
