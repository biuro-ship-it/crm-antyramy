/**
 * Dzienny pomiar kampanii (cron na mydevil, codziennie rano).
 * Dla kampanii wysłanych w ostatnich 30 dniach: sprawdza odpowiedzi w Gmailu,
 * potem przelicza przypisanie zamówień we wszystkich kampaniach.
 *
 * TYLKO czyta pocztę i zapisuje wyniki — nie wysyła żadnych maili.
 * Faktur z Fakturowni nie pobiera (decyzja 2026-09-29) — zamówienia z faktur
 * dochodzą po ręcznej „hurtowej aktualizacji z Fakturowni”.
 *
 * Uruchomienie (serwer):
 *   cd /usr/home/Pluszek/domains/crm.antyramy.eu/public_nodejs
 *   node20 dist/scripts/campaign-daily.js
 * Lokalnie:
 *   cd backend && npx ts-node src/scripts/campaign-daily.ts
 */

import { db } from '../services/firebase';
import { checkReplies, recomputeOrders } from '../services/campaignMeasure';
import { GMAIL_READ_SCOPE_ERROR } from '../services/gmail';

const DAYS_BACK = 30;

async function main() {
  const started = new Date();
  console.log(`\n[campaign-daily] start ${started.toISOString()}`);

  const since = new Date(started.getTime() - DAYS_BACK * 24 * 60 * 60 * 1000).toISOString();
  // Filtr daty w kodzie — zapytanie status + sentAt wymagałoby indeksu złożonego w Firestore
  const snap = await db.collection('campaigns').where('status', '==', 'sent').get();
  const recent = snap.docs.filter(d => String(d.data().sentAt ?? '') >= since);
  console.log(`[campaign-daily] kampanie z ostatnich ${DAYS_BACK} dni: ${recent.length}`);

  let scopeProblem = false;
  for (const doc of recent) {
    const name = doc.data().name as string;
    if (scopeProblem) break;
    try {
      const r = await checkReplies(doc.id);
      console.log(`  „${name}”: sprawdzono ${r.checked}, nowe odpowiedzi ${r.newReplies}, prośby o wypis ${r.newUnsubscribeRequests}` +
        (r.noThread ? `, bez wątku ${r.noThread}` : '') + (r.errors ? `, błędy ${r.errors}` : ''));
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`  „${name}”: BŁĄD — ${msg}`);
      if (msg === GMAIL_READ_SCOPE_ERROR) scopeProblem = true; // bez uprawnienia nie ma sensu próbować dalej
    }
  }

  const orders = await recomputeOrders();
  console.log(`[campaign-daily] zamówienia przeliczone: zmiany w ${orders.changed} z ${orders.campaigns} kampanii`);
  console.log(`[campaign-daily] koniec (${Math.round((Date.now() - started.getTime()) / 1000)} s)`);
  if (scopeProblem) process.exitCode = 2;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(err => {
    console.error('[campaign-daily] BŁĄD:', err);
    process.exit(1);
  });
