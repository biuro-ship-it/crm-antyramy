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

## Etap 2 — zrobione (2026-09-29)

| # | Punkt specyfikacji | Gdzie |
|---|---|---|
| 11 | „Sprawdź odpowiedzi” (przycisk w raporcie + raz dziennie): odpowiedź w wątku Gmail od adresu odbiorcy; „NIE” → prośba o wypis + „Oznacz jako wypisany” (bez automatu); wpis w historii kontaktów | `services/campaignResults.ts`, `services/campaignMeasure.ts`, `POST /api/campaigns/:id/check-replies` |
| 12 | Przypisanie zamówień w oknie N dni (Administracja, domyślnie 14) do **ostatniej** kampanii przed zamówieniem; „do potwierdzenia” → ✓ / ✕ | `attributeOrders`, `POST /recompute-orders`, `PATCH /:id/orders` |
| 13 | „Utwórz follow-upy” → „Telefon: {kampania}” +2 dni robocze; szybki wynik zamówił / oddzwonić / nie teraz / nie odebrał (+ notatka → historia; oddzwonić i nie odebrał → kolejny telefon) | `services/campaignFollowups.ts`, `FollowUpOutcome.tsx`, Kalendarz i lista zadań |
| 14 | Raport kampanii: wysłano, błędy, odpowiedzi A vs B (liczba i %), prośby o wypis, zamówienia, wartość netto, z maila / po telefonie, odbiorcy ze statusem | `CampaignDetails.tsx` |
| 15 | Ranking: tabela sortowalna, wykres wartości zamówień, „który temat wygrał” | `CampaignRanking.tsx` |

### Uprawnienie Gmail (zrobione 2026-09-29)
Token z `gmail.readonly` wygenerowany (`node backend/scripts/get-gmail-token.js` — zapisuje token w `backend/.env`, nie na ekran) i przeniesiony na serwer (`public_nodejs/.env`, kopia `.env.bak`). Po ponownym generowaniu tokenu: przenieść linię `GMAIL_REFRESH_TOKEN` na serwer i zrestartować aplikację (`devil www restart crm.antyramy.eu`).

### Automat dzienny
- Skrypt: `backend/src/scripts/campaign-daily.ts` → `dist/scripts/campaign-daily.js`. Kampanie wysłane w ostatnich 30 dniach: sprawdza odpowiedzi, potem przelicza zamówienia we wszystkich. **Nic nie wysyła, nie pobiera faktur z Fakturowni.**
- Cron na s61 (6:45, przed zadaniami Ramiarza o 7:00):
  `45 6 * * * cd /usr/home/Pluszek/domains/crm.antyramy.eu/public_nodejs && /usr/local/bin/node20 dist/scripts/campaign-daily.js >> /usr/home/Pluszek/domains/crm.antyramy.eu/logs/campaign-daily.log 2>&1`
- Log: `/usr/home/Pluszek/domains/crm.antyramy.eu/logs/campaign-daily.log`. Kod wyjścia 2 = brak uprawnienia do czytania poczty (wygenerować token).

### Ograniczenia
- Kampanie przeniesione z Promocji nie mają wątków Gmail — odpowiedzi dla nich nie są mierzone (w rankingu „—”); zamówienia tak.
- Odpowiedź z innego adresu niż ten, na który poszedł mail, nie zostanie wykryta.
- Dni robocze bez świąt. Zamówienia z faktur liczą się dopiero po „hurtowej aktualizacji z Fakturowni”.

## Do przetestowania ręcznie (Etap 2)

1. **Administracja → Kampanie:** okno przypisania (np. 14) — zapis i odświeżenie.
2. **Kampania testowa na 2 Twoje adresy** (A i B) → z jednego odpisz normalnie („Poproszę cennik”), z drugiego „NIE”.
3. W raporcie **„📬 Sprawdź odpowiedzi”** → 1 odpowiedź (💬 z fragmentem), 1 prośba o wypis (🚫) → „Oznacz jako wypisany” → karta klienta ma zaznaczony wypis; w historii kontaktów obu klientów nowe wpisy.
4. **„📞 Utwórz follow-upy”** (dla klienta bez odpowiedzi) → zadanie „Telefon: …” w Kalendarzu na +2 dni robocze i w Google Calendar; ponowne kliknięcie nie dubluje.
5. W Kalendarzu przy zadaniu **„📞 Wynik”** → „oddzwonić” z notatką → nowe zadanie za 2 dni robocze, wpis w historii; potem „zamówił” → w raporcie „rozmowy zamówił: 1”.
6. **Zamówienie:** dopisz klientowi testowemu zamówienie z dzisiejszą datą → „Przelicz zamówienia” → 🧾 „do potwierdzenia” → ✓ (licznik bez zmian, zielone) → ✕ (znika z sumy) → ✓.
7. **Ranking:** tabela sortuje się po kliknięciu nagłówków; wykres pokazuje kampanie z zamówieniami (podpowiedź po najechaniu, klik otwiera raport); przy kampanii A/B werdykt („za mało danych” poniżej 10 maili na wariant).
8. **Automat:** następnego dnia rano sprawdź log `logs/campaign-daily.log` na serwerze (albo poproś mnie).
