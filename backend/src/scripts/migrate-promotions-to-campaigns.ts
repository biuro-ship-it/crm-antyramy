/**
 * Jednorazowe przeniesienie archiwum Promocji (kolekcja `promotions`) do Kampanii
 * (kolekcja `campaigns`). Stara kolekcja zostaje w bazie jako kopia.
 *
 * Domyślnie TYLKO podgląd (nic nie zapisuje). Zapis dopiero z --live.
 * Przed --live zrób kopię: zakładka Archiwum → ZIP.
 *
 * Uruchomienie:
 *   cd backend
 *   npx ts-node src/scripts/migrate-promotions-to-campaigns.ts          # podgląd
 *   npx ts-node src/scripts/migrate-promotions-to-campaigns.ts --live   # zapis
 *
 * Co robi:
 *   - każda promocja → kampania `status: 'sent'`, `legacy: true`, z zapisanym HTML
 *     maila (`htmlBody`) i migawką produktów; wariant A = temat i treść promocji,
 *   - `lastCampaignAt` klientów, którym mail doszedł (tylko gdy późniejszy niż obecny),
 *   - idempotentnie: pole `migratedFrom` = id promocji; ponowne uruchomienie pomija przeniesione.
 */

import { db } from '../services/firebase';

const LIVE = process.argv.includes('--live');

interface PromotionDoc {
  title: string;
  subject?: string;
  content?: string;
  htmlBody?: string;
  products?: Array<{ id: string; name: string; code: string; priceNetto: number; imageUrl: string }>;
  recipients?: Array<{ clientId: string; companyName: string; email: string; status: 'sent' | 'failed'; error?: string }>;
  sentCount?: number;
  failedCount?: number;
  totalCount?: number;
  skippedNoEmail?: number;
  sentAt: string;
  sentBy?: string;
}

async function main() {
  console.log(LIVE ? '\n=== TRYB ZAPISU (--live) ===\n' : '\n=== PODGLĄD (bez zapisu; dodaj --live, aby zapisać) ===\n');

  const [promosSnap, migratedSnap] = await Promise.all([
    db.collection('promotions').orderBy('sentAt', 'asc').get(),
    db.collection('campaigns').where('migratedFrom', '!=', null).select('migratedFrom').get(),
  ]);
  const done = new Set(migratedSnap.docs.map(d => d.data().migratedFrom as string));
  console.log(`Promocji: ${promosSnap.size}, już przeniesionych: ${done.size}`);

  // Najpóźniejsza kampania per klient (do lastCampaignAt)
  const lastByClient = new Map<string, string>();
  let created = 0;

  for (const doc of promosSnap.docs) {
    const p = doc.data() as PromotionDoc;
    const products = p.products ?? [];
    const recipients = (p.recipients ?? []).map(r => ({
      clientId: r.clientId,
      companyName: r.companyName || '',
      email: r.email || '',
      variant: 'A' as const,
      status: r.status,
      error: r.status === 'failed' ? (r.error || 'Błąd wysyłki') : null,
      gmailMessageId: null,
      gmailThreadId: null,
      sentAt: r.status === 'sent' ? p.sentAt : null,
    }));
    recipients.filter(r => r.status === 'sent').forEach(r => {
      const prev = lastByClient.get(r.clientId);
      if (!prev || p.sentAt > prev) lastByClient.set(r.clientId, p.sentAt);
    });

    const line = `${p.sentAt.slice(0, 10)}  „${p.title}”  wysłano ${p.sentCount ?? 0}/${p.totalCount ?? recipients.length}  produktów: ${products.length}`;
    if (done.has(doc.id)) {
      console.log(`  [pomijam — już jest] ${line}`);
      continue;
    }
    console.log(`  [${LIVE ? 'zapisuję' : 'do zapisu'}] ${line}`);

    if (LIVE) {
      await db.collection('campaigns').add({
        name: p.title,
        status: 'sent',
        noProducts: products.length === 0,
        productIds: products.map(x => x.id),
        pdfTitle: p.title,
        productsSnapshot: products,
        variantA: { subject: p.subject ?? '', content: p.content ?? '' },
        variantB: null,
        recipients,
        counts: {
          total: p.totalCount ?? recipients.length,
          sent: p.sentCount ?? recipients.filter(r => r.status === 'sent').length,
          failed: p.failedCount ?? recipients.filter(r => r.status === 'failed').length,
          skippedNoEmail: p.skippedNoEmail ?? 0,
          skippedNoMarketing: 0,
        },
        results: { repliesA: 0, repliesB: 0, orders: 0, orderValueNet: 0, byPhone: 0 },
        createdAt: p.sentAt,
        updatedAt: new Date().toISOString(),
        createdBy: p.sentBy || 'system',
        sentAt: p.sentAt,
        sentBy: p.sentBy || 'system',
        sendLockUntil: null,
        legacy: true,
        htmlBody: p.htmlBody ?? '',
        migratedFrom: doc.id,
      });
    }
    created++;
  }

  // lastCampaignAt — tylko gdy późniejszy niż obecny na kliencie
  let clientsUpdated = 0;
  for (const [clientId, sentAt] of lastByClient) {
    const ref = db.collection('clients').doc(clientId);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const current = snap.data()!.lastCampaignAt as string | undefined;
    if (current && current >= sentAt) continue;
    if (LIVE) await ref.update({ lastCampaignAt: sentAt });
    clientsUpdated++;
  }

  console.log(`\n${LIVE ? 'Zapisano' : 'Do zapisu'}: kampanii ${created}, lastCampaignAt u ${clientsUpdated} klientów`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Błąd:', err);
    process.exit(1);
  });
