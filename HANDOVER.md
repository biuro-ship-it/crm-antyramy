# HANDOVER — moduł Kampanie (CRM_ANTYRAMY)

Stan na 2026-09-28. Decyzje i ich uzasadnienia: [DECISIONS.md](DECISIONS.md).

## Etap 1 — zrobione

| # | Punkt specyfikacji | Gdzie |
|---|---|---|
| 1 | Kolekcja `campaigns`, Promocje zapisują się jako kampanie, „Duplikuj kampanię” | `backend/src/routes/campaigns.ts`, `frontend/src/components/Campaign*.tsx` |
| 2 | Test A/B (drugi temat, opcjonalnie osobna treść), „Podziel losowo na A i B” | edytor, krok 2 i 3 |
| 3 | Placeholdery `{zwrot\|Dzień dobry}`, `{firma}`, `{miasto}`; podgląd dla wybranego odbiorcy | `backend/src/services/campaignRender.ts` |
| 4 | Filtry: typ, wyszukiwarka, kolor, trasa, województwo, tagi, brak zamówienia / kontaktu / kampanii od X dni; ostrzeżenie „kampania w ostatnich 7 dniach” + „Odznacz ich” | `frontend/src/utils/campaignFilters.ts`, `RecipientFilters.tsx` |
| 5 | Tagi klienta (chipsy na karcie) | `frontend/src/components/ClientMarketing.tsx`, `PATCH /api/clients/:id/marketing` |
| 6 | Wypis `noMarketing` (checkbox na karcie), kampanie pomijają; stopka „Nie chcą Państwo otrzymywać ofert? Wystarczy odpisać NIE.” | jw. + `campaignRender.ts` |
| 7 | Podpis konfigurowalny w Administracji (domyślnie obecny) | `SignatureSettings.tsx`, `backend/src/services/emailSignature.ts` |
| 8 | „Wklej z JSON” — wypełnia formularz, zaznacza odbiorców, nie wysyła; nieznane kody = ostrzeżenie | `frontend/src/utils/campaignImport.ts` |
| 9 | Kampania bez produktów („bez tabeli i PDF”) | edytor, krok 1 |
| 10 | Wysyłka partiami po 10 z paskiem postępu, zapis `gmailMessageId` / `gmailThreadId` | `POST /:id/start`, `POST /:id/send-batch`, `CampaignSendRunner.tsx` |
| — | Poprawki Krzyśka: pole `salutation` (zwrot) zamiast imienia, kolumna zwrotu w kroku „Odbiorcy”, ostrzeżenie o podpisie w treści i w imporcie JSON | |

Dodatkowo naprawiony istniejący błąd: zapis formularza „Edytuj dane” klienta czyścił jego pliki i faktury z Fakturowni.

## Migracja Promocji → Kampanie

```
cd backend
npx ts-node src/scripts/migrate-promotions-to-campaigns.ts          # podgląd
npx ts-node src/scripts/migrate-promotions-to-campaigns.ts --live   # zapis (po kopii bazy)
```
Idempotentna (`migratedFrom`). Przeniesione kampanie mają znaczek „z Promocji” i zapisany HTML maila. Ustawia `lastCampaignAt` klientom, którym mail doszedł — dlatego przy najbliższej kampanii pojawi się ostrzeżenie „dostali kampanię w ostatnich 7 dniach” dla odbiorców wysyłki z 27.09. Kolekcja `promotions` zostaje w bazie jako kopia.

## Testy automatyczne

- backend: `cd backend && npm test` — m.in. `campaignRender.test.ts` (placeholdery, escapowanie, HTML z/bez produktów, A/B, rozliczanie partii), `emailSignature.test.ts`
- frontend: `cd frontend && npm test` — `campaignTools.test.ts` (filtry, ostrzeżenie o podpisie, import JSON)

## Do przetestowania ręcznie (Etap 1)

1. **Karta klienta:** zwrot, 2 tagi, wypis → odśwież stronę, wszystko zostaje; znaczek „wypisany” na liście.
2. **„Edytuj dane” klienta** z plikami i fakturami → zapis nie usuwa plików ani faktur.
3. **Administracja → Podpis:** zmień, zapisz, odśwież; mail z szablonu ma nową stopkę; przywróć.
4. **Kampanie → Nowa kampania:** 4 kroki, filtry (w tym „od X dni”), kolumna „Zwrot w mailu” (⚠ przy braku).
5. **Treść:** placeholdery kliknięciem, podgląd dla różnych odbiorców, A/B z osobną treścią, ostrzeżenie po wpisaniu podpisu z telefonem na końcu.
6. **Szkic:** zapisz, wyjdź, wejdź — dane zostają; usuń szkic z listy.
7. **Wklej z JSON:** poprawny (z nieznanym kodem produktu → ostrzeżenie), niepoprawny (→ komunikat), z filtrem (→ zaznaczeni odbiorcy, wypisani pominięci).
8. **Wysyłka testowa:** tylko klient testowy z własnym adresem (najlepiej 2 — A i B) → pasek postępu → szczegóły: ✓ przy odbiorcach, mail w skrzynce z właściwym tematem, zwrotem, PDF (lub bez, przy „bez tabeli i PDF”), podpisem i tekstem wypisu; wpis „Wysłano kampanię” w historii klienta.
9. **Wznowienie:** kampania na kilkanaście adresów testowych, zamknij kartę w trakcie → lista pokazuje „przerwana” → szczegóły → „Wznów wysyłkę”; nikt nie dostaje maila dwa razy.
10. **Duplikuj kampanię** w szczegółach → otwiera się edytor z kopią (bez odbiorców).
11. **Kampanie z Promocji** (po migracji): 3 pozycje z podglądem oryginalnego maila i PDF.
12. **Archiwum → Excel:** arkusz „Kampanie”.

## Etap 2 — do zrobienia (osobny plan)

Wymaga nowego uprawnienia Gmail **`gmail.readonly`**: wygenerować nowy refresh token (`backend/scripts/get-gmail-token.js` z dodanym scope) i podmienić `GMAIL_REFRESH_TOKEN` w `.env` na serwerze.

- 11: „Sprawdź odpowiedzi” po `gmailThreadId`; odpowiedź „NIE” → `unsubscribeRequest` + przycisk „Oznacz jako wypisany” (bez automatu).
- 12: przypisanie zamówień w ciągu N dni (konfigurowalne), potwierdzanie ręczne.
- 13: „Utwórz follow-upy” (+2 dni robocze) z szybkim wynikiem rozmowy.
- 14–15: raport kampanii (A vs B, zamówienia, wartość) i ranking z wykresem.

Pola pod Etap 2 są już w modelu: `recipients[].gmailThreadId`, `results { repliesA, repliesB, orders, orderValueNet, byPhone }`.
