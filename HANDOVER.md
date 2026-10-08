# HANDOVER — moduł Kampanie (CRM_ANTYRAMY)

**Ostatnia aktualizacja:** 2026-10-08
**Wersja produkcyjna:** commit `81b8677` — https://crm.antyramy.eu (deploy 2026-10-08, `/health` = 200). Lokalnie czekają niewypchnięte commity: poprawka komunikatu błędu (`b0d5dc9`) + dokumentacja.

Decyzje i ich uzasadnienia: [DECISIONS.md](DECISIONS.md). Instrukcja dla Claude: [CLAUDE.md](CLAUDE.md), opis funkcji: [SPEC.md](SPEC.md).

## Stan obecny

### ✅ Działa (wdrożone)
- Kampanie: edytor w 4 krokach (**Produkty i kolaż → Treść → Odbiorcy → Wysyłka**), szkice, duplikat, import JSON, test A/B, wysyłka partiami po 10, wznowienie.
- **Kampania z samym kolażem albo samym tekstem** — produkty są opcjonalne (bez produktów mail idzie bez tabeli i PDF). To była naprawa z 2026-10-08.
- **Obowiązkowa wysyłka testowa** na info@pluszek.pl przed wysyłką do wszystkich (`POST /api/campaigns/:id/send-test`).
- Kolaż „Oferta tygodnia” z 3 zdjęć (krok 1), pomiar wyników (odpowiedzi, zamówienia, follow-upy, ranking), automat dzienny 6:45.

### 🔧 W trakcie
- **Token Gmail odnowiony 2026-10-08 ok. 21:20** (wygenerowany przez Krzyśka, przeniesiony na serwer, restart, Google przyjmuje go lokalnie i na serwerze). Prawdziwej wysyłki po odnowieniu jeszcze nie było — pierwszy test z CRM to potwierdzi.
- **Czekają testy ręczne na produkcji** — wysyłka testowa i kolaż (listy niżej, w sekcjach z 2026-10-08 i 2026-10-07). Prawdziwy mail `[TEST]` jeszcze ani razu nie doszedł.
- Lokalny, niewdrożony commit `b0d5dc9`: czytelny komunikat o wygasłym tokenie Gmail i błąd testu / wysyłki pokazywany przy przyciskach w kroku 4 (na produkcji nadal tylko u góry strony, jako samo „invalid_grant”). Testy i build przechodzą (backend 62, frontend 66).

### 🐛 Znane problemy / ograniczenia
- **Token Gmail może znów wygasnąć.** Token z 2026-09-29 przestał działać po 9 dniach (Google: „Token has been expired or revoked”; w `logs/error.log` na serwerze `GaxiosError: invalid_grant`) — nie działał wtedy ani test, ani wysyłka kampanii, ani Kalendarz Google (ten sam token). Prawdopodobna przyczyna (niepotwierdzona): aplikacja OAuth w Google Cloud ma status „Testing”, w którym tokeny wygasają po 7 dniach — do sprawdzenia w Google Cloud Console → „OAuth consent screen”; trwałe rozwiązanie to typ „Internal” (konto Workspace) albo „Publish app”. Jeśli nic się nie zmieni, kolejne wygaśnięcie ok. 2026-10-15. Naprawa: sekcja „Uprawnienie Gmail” niżej.
- Po odświeżeniu strony edytora test trzeba wysłać ponownie (blokada żyje w pamięci karty).
- Adres testowy jest stałą w kodzie w dwóch miejscach: `backend/src/routes/campaigns.ts` (`CAMPAIGN_TEST_EMAIL`) i `frontend/src/services/api.ts` (napis na przycisku).
- Outlook blokuje kolaż do kliknięcia „Pokaż obrazy” (inline CID — osobne zadanie). Pliki-sieroty kolażu nie są sprzątane.

## Następne kroki (kolejność = priorytet)
0. **Sprawdzić w Google Cloud Console status aplikacji OAuth** („Testing” → „Internal” albo „Publish app”), żeby token Gmail nie wygasał co 7 dni. Gdy poczta znów stanie: `node backend/scripts/get-gmail-token.js` → linia `GMAIL_REFRESH_TOKEN` do `public_nodejs/.env` na serwerze → `devil www restart crm.antyramy.eu`.
1. Testy ręczne wysyłki testowej na produkcji (sekcja „Kolaż w kroku 1…”, punkty 1–7) — najpierw punkt 1–2: sam kolaż → test → mail `[TEST]` w info@pluszek.pl.
2. Testy ręczne kolażu z telefonu i w Gmailu/Outlooku (sekcja „Kolaż z 3 zdjęć”, punkty 1–8).
3. Wypchnąć lokalne commity (`! git push origin main` — push = deploy): poprawka komunikatu błędu `b0d5dc9` + dokumentacja. Po deployu sprawdzić `/health`.
4. Opcjonalnie: adres testowy jako ustawienie w Administracji; kolaż ze zdjęć produktów z katalogu (odłożone 2026-10-08).

## Ważne do zapamiętania
- **Push robi Krzysiek** (`! git push origin main`) — hook blokuje `git push` u Claude. Push na `main` = deploy przez GitHub Actions (ok. 2 min). Status bez logowania: `https://api.github.com/repos/biuro-ship-it/crm-antyramy/actions/runs?per_page=3`; potem `/health` i nowa nazwa `assets/index-*.js`.
- Lokalna aplikacja wymaga logowania Google — Claude sprawdza ekrany na tymczasowej stronie testowej (komponent + podstawiony `fetch`), którą po sprawdzeniu usuwa.
- Wysyłka testowa niczego nie zapisuje (ani w kampanii, ani w historii klienta) — tak ma zostać, inaczej zaburzy pomiar i ostrzeżenie „kampania w ostatnich 7 dniach”.
- Kolaże i uploady testować tylko na produkcji (plik wgrany lokalnie nie wyświetli się w mailu).

## Historia sesji
- **2026-10-08** — Naprawa: kampania z samym kolażem nie dawała się wysłać. Kolaż przeniesiony do kroku 1, nowa kolejność kroków, obowiązkowa wysyłka testowa na info@pluszek.pl. Wdrożone (`81b8677`). Wieczorem: test nie doszedł, bo wygasł token Gmail (`invalid_grant`) — token odnowiony i przeniesiony na serwer; lokalnie czytelniejszy komunikat błędu (`b0d5dc9`, niewdrożone).
- **2026-10-07** — Kolaż z 3 zdjęć „Oferta tygodnia” (Canvas w przeglądarce, `heroImageUrl`, bezpieczne kasowanie plików). Wdrożone tego samego dnia (`2fbe062`).
- **2026-09-29** — Etap 2: sprawdzanie odpowiedzi z Gmaila, przypisanie zamówień, follow-upy telefoniczne, raport, ranking, automat dzienny (cron 6:45).
- **2026-09-28** — Etap 1: backend i ekran Kampanii, podpis w Administracji, migracja Promocji → Kampanie, usunięcie modułu Promocje.
- **2026-09-27** — Założenia modułu Kampanie, pola klienta (zwrot, tagi, wypis), naprawa czyszczenia plików klienta przy „Edytuj dane”.

---

# Szczegóły

## Kolaż w kroku 1 + obowiązkowa wysyłka testowa — zrobione i wdrożone 2026-10-08 (commit `81b8677`; testy ręczne na produkcji jeszcze nie zrobione)

**Naprawiony błąd:** kampania z samym kolażem (bez produktu w kroku 1) nie dawała się wysłać.

Edytor ma teraz kroki **1 Produkty i kolaż → 2 Treść → 3 Odbiorcy → 4 Wysyłka**. Produkty i kolaż są niezależne i opcjonalne (bez produktów = mail bez tabeli i PDF; haczyk „Bez tabeli i PDF” zniknął). W kroku 4: podgląd końcowy, „✉ 1. Wyślij test na info@pluszek.pl”, a dopiero po teście aktualnej wersji — „2. Wyślij do N odbiorców”.

| Co | Gdzie |
|---|---|
| Kroki, kolaż w kroku 1, podgląd w krokach 2 i 4, przyciski testu i wysyłki | `frontend/src/components/CampaignEditor.tsx` |
| Reguły: co musi być uzupełnione, „odcisk treści” (czy test dotyczył aktualnej wersji) | `frontend/src/utils/campaignSend.ts` (+ `campaignSend.test.ts`) |
| `sendCampaignTest`, napis z adresem testowym | `frontend/src/services/api.ts` |
| `POST /api/campaigns/:id/send-test` (adres na sztywno: `CAMPAIGN_TEST_EMAIL`), nowy komunikat w `start` | `backend/src/routes/campaigns.ts` |
| `campaignContentError`, `testSubject` | `backend/src/services/campaignRender.ts` (+ testy) |

### Sprawdzone
- Testy: backend 60, frontend 66; `npm run build` frontendu bez błędów.
- W Chrome na tymczasowej stronie testowej z prawdziwym `CampaignEditor` i podstawionym backendem (bez logowania, żaden mail nie wyszedł): kolejność kroków, kolaż w kroku 1 (okno się otwiera), kampania bez produktów bez błędu (zapis `noProducts: true`), przycisk wysyłki nieaktywny przed testem, aktywny po teście, znów nieaktywny po zmianie treści lub produktów, aktywny po zmianie samych odbiorców.
- **Niesprawdzone:** prawdziwa wysyłka testowa (Gmail), wygląd maila `[TEST]` w skrzynce, zalogowana aplikacja, telefon.

### Testy ręczne na produkcji (po deployu)
1. **Sam kolaż (scenariusz błędu):** Kampanie → Nowa kampania → krok 1: tytuł + „Utwórz kolaż”, **bez produktów** → krok 2: temat i treść → krok 3: klient testowy z własnym adresem → krok 4: brak błędu o produktach, w podglądzie kolaż nad treścią, bez tabeli.
2. **Test:** „2. Wyślij do…” jest szary → „✉ 1. Wyślij test na info@pluszek.pl” → informacja „Test tej wersji wysłany” → w skrzynce info@pluszek.pl mail `[TEST] {temat}` z kolażem, bez tabeli i bez PDF, ze zwrotem klienta wybranego w podglądzie. W historii kontaktów tego klienta **nie ma** nowego wpisu.
3. **Zmiana po teście:** wróć do kroku 2, dopisz słowo → krok 4: żółte „Mail zmieniony po teście”, wysyłka znów szara → wyślij test ponownie → aktywna. Zmiana samych odbiorców (krok 3) nie wymaga nowego testu.
4. **Wysyłka:** „2. Wyślij do 1 odbiorców” → potwierdzenie → pasek postępu → mail u klienta testowego bez dopisku `[TEST]`.
5. **Produkty + kolaż:** drugi szkic z 1–2 produktami i kolażem → test ma kolaż, tabelę i PDF w załączniku.
6. **A/B:** szkic z tematem B → test = dwa maile: `[TEST A] …` i `[TEST B] …`.
7. **Stary szkic** (zapisany przed zmianą, z produktami albo z „bez tabeli i PDF”) otwiera się z tymi samymi produktami / bez produktów.

### Otwarte
- Po odświeżeniu strony test trzeba wysłać ponownie (blokada żyje w pamięci edytora — decyzja 2026-10-08).
- Adres testowy jest stałą w kodzie (backend + napis we frontendzie), nie ustawieniem w Administracji.

## Kolaż z 3 zdjęć — zrobione i wdrożone 2026-10-07 (commit `2fbe062`; testy ręczne na produkcji jeszcze nie zrobione)

Przycisk „🖼 Utwórz kolaż” w kroku 1 edytora kampanii (do 2026-10-08: w kroku 3) → 3 zdjęcia → JPG 1200×800 (≤ ~250 KB) z plakietką „OFERTA TYGODNIA” → `<img>` 600 px w mailu między tytułem a treścią. Kolaż rysowany w przeglądarce (Canvas), bez nowych bibliotek; nie trafia do PDF.

| Co | Gdzie |
|---|---|
| Układ, przycięcie, plakietka, dobór jakości JPG, przerywanie generowania | `frontend/src/utils/collage.ts` (+ `collage.test.ts`) |
| Okno „Utwórz kolaż” (3 pola, „Ustaw jako duże”, podgląd = zapisywany plik, KB i jakość, ostrzeżenia) | `frontend/src/components/CollageDialog.tsx` |
| Sekcja „Kolaż nad treścią” w kroku 1 (Utwórz / Zmień / Usuń, ostrzeżenie o localhost), kolaż w podglądzie maila | `frontend/src/components/CampaignEditor.tsx`, `services/api.ts` |
| Upload `POST /api/upload?kind=kolaz` → `kolaz-<czas>-<los>.jpg` | `backend/src/routes/upload.ts` |
| Walidacja `heroImageUrl`, zapis częściowy, bezpieczne kasowanie pliku (współdzielenie) | `backend/src/services/collageFiles.ts` (+ `collageFiles.test.ts`) |
| Pole `heroImageUrl` w szkicu, duplikacie, usuwaniu, podglądach i wysyłce | `backend/src/routes/campaigns.ts` |
| Blok `<img>` w mailu; wzorzec HTML sprzed zmiany | `backend/src/services/campaignRender.ts`, `services/__fixtures__/` |

**Zasady plików:** kolaż zmieniony/usunięty w szkicu albo usunięty szkic → plik kasowany, chyba że ten sam plik ma inna kampania (dowolny status) lub produkt; wysłana kampania nigdy nie kasuje swojego kolażu. Adresy spoza `https://crm.antyramy.eu/uploads/kolaz-*.jpg` są odrzucane (400).

### Sprawdzone automatycznie / lokalnie
- Testy: backend 58, frontend 57; `npm run build` frontendu bez błędów.
- W Chrome (strona testowa z prawdziwym `CollageDialog`, bez logowania): orientacja z EXIF (plik z obrotem 6), plakietka w pełnej rozdzielczości, szybkie zamiany kolejności bez wyścigu, ostrzeżenie > 250 KB, błąd HEIC, szerokość 390 px.
- **Niesprawdzone:** prawdziwy upload i zapis w zalogowanej aplikacji, prawdziwy iPhone/Safari i zdjęcia z aparatu, wygląd w Gmailu/Outlooku.

### Testy ręczne na produkcji (po deployu)
1. **Kolaż z telefonu:** Kampanie → szkic → krok 1 → „Utwórz kolaż” → „Wybierz zdjęcia” z galerii: 1 poziome + 2 pionowe zdjęcia **z aparatu** (nie zrzuty). Wszystkie stoją prosto (nie obrócone o 90°), przycięcie bez czarnych pasów; „Ustaw jako duże” zmienia podgląd. To samo z komputera (przeciągnięcie pliku na pole).
2. **Plakietka na iPhonie/Safari:** czytelna, proporcjonalna do zdjęcia, litery „OFERTA TYGODNIA” kompletne i równo rozstawione (odstępy między literami), tekst na środku niebieskiego prostokąta, prostokąt w samym rogu. Polskich znaków w plakietce nie ma — tylko litery i odstępy.
3. **Rozmiar:** pod podglądem rozmiar w KB i jakość JPG — zwykle ≤ 250 KB; przy > 250 KB żółte ostrzeżenie, a „Zapisz kolaż” nadal działa. Po zapisie: miniatura w kroku 1, w podglądzie maila (krok 2 lub 4) obrazek pod tytułem; adres obrazka (prawy klik → kopiuj adres) zaczyna się od `https://crm.antyramy.eu/uploads/kolaz-`. Brak żółtego ostrzeżenia o localhost.
4. **Wysyłka** (najpierw test na info@pluszek.pl, potem tylko klient testowy z własnym adresem): w **Gmailu** kolaż od razu, na pełną szerokość karty, nad treścią; w **Outlooku** (desktop i/lub web) — po „Pokaż obrazy” kolaż nie wystaje poza kartę 600 px; tekst alternatywny przed pokazaniem obrazów: „Oferta tygodnia - {tytuł}”. PDF w załączniku bez kolażu.
5. **Duplikat:** wysłana (albo dowolna) kampania z kolażem → „Duplikuj kampanię” → w kopii kolaż jest → w kopii „Usuń” → zapis → oryginał nadal pokazuje kolaż (szczegóły → podgląd), a plik otwiera się pod swoim adresem. Potem w kopii nowy kolaż i „Zmień” — oryginał bez zmian.
6. **Kampania bez kolażu** (nowa i stara wysłana): podgląd i mail wyglądają jak dotąd.
7. **Zapis z innego kroku:** szkic z kolażem → zmień coś w kroku 2 → „Zapisz szkic” → odśwież stronę → kolaż nadal jest.
8. (opcjonalnie) Usunięcie szkicu z kolażem → plik `kolaz-…` znika z `public_nodejs/public/uploads/` (log: `[campaigns] kolaż … deleted`).

### Otwarte
- Inline CID dla Outlooka — osobne zadanie (decyzja 2026-10-07).
- Pliki-sieroty (upload bez zapisanego szkicu) nie są sprzątane automatycznie.
- Protokół adresów uploadu na produkcji niesprawdzony (backend i tak zapisuje kolaż jako `https://`) — potwierdza test 3.


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
4. **Kampanie → Nowa kampania:** 4 kroki (od 2026-10-08: produkty i kolaż → treść → odbiorcy → wysyłka), filtry (w tym „od X dni”), kolumna „Zwrot w mailu” (⚠ przy braku).
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
