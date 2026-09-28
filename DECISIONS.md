# Decyzje — moduł Kampanie (CRM_ANTYRAMY)

Rejestr decyzji projektowych. Najnowsze na dole sekcji.

## 2026-09-27 — założenia (zaakceptowane przez Krzyśka)

- **Kampanie zastępują Promocje.** Zakładka „Promocje” → „Kampanie”. Rekordy z kolekcji `promotions` przenosi skrypt migracyjny; sama kolekcja zostaje w bazie jako kopia.
- **Niezmiennik:** nic nie wychodzi bez kliknięcia „Wyślij” po podglądzie. `sendEmail` (Gmail API) i wpisy w historii kontaktów klienta działają jak dotąd.
- **Nazwy pól po angielsku** (spójnie z resztą kodu). Import JSON zostaje z polskimi kluczami ze specyfikacji. Mapowanie:

  | specyfikacja | Firestore `campaigns` |
  |---|---|
  | nazwa | `name` |
  | dataUtworzenia / dataWysylki | `createdAt` / `sentAt` |
  | status: szkic / wyslana | `status: 'draft' \| 'sending' \| 'sent'` |
  | produkty | `productIds` (+ `productsSnapshot` przy wysyłce) |
  | tytulPdf | `pdfTitle` |
  | wariantA / wariantB `{temat, tresc}` | `variantA` / `variantB` `{subject, content}` (`content: null` w B = treść wspólna z A) |
  | odbiorcy `{clientId, wariant, gmailMessageId, gmailThreadId, wyslano, blad}` | `recipients` `{clientId, companyName, email, variant, gmailMessageId, gmailThreadId, status, error, sentAt}` |
  | wyniki `{odpowiedziA, odpowiedziB, zamowienia, wartoscNetto, poTelefonie}` | `results` `{repliesA, repliesB, orders, orderValueNet, byPhone}` |

- **`wyslano` + `blad` → jedno pole `status`** (`pending` / `sent` / `failed`) i `error`. Jeden stan zamiast dwóch pól, które mogą sobie przeczyć.
- **Dodatkowy status `sending`** — wysyłka partiami w toku. Kampania przerwana (zamknięta karta) zostaje w tym stanie i można ją wznowić.
- **Wysyłka partiami sterowana z przeglądarki**, nie kolejka na serwerze. Frontend woła `POST /campaigns/:id/send-batch` (do 10 maili) w pętli z paskiem postępu. Powód: backend działa pod Passengerem na mydevil, który może ubić proces w tle; każda partia to krótkie żądanie.
- **Odbiorcy jako tablica w dokumencie kampanii** — skala 60–200 klientów, daleko od limitu 1 MB dokumentu.
- **Domyślny podpis = obecny** („Pozdrawiam, Krzysztof Godek, https://b2b.antyramy.eu/, 500 601 601, biuro@antyramy.eu”), konfigurowalny w Administracji.

## 2026-09-27 — poprawki Krzyśka do planu

- **Zwrot zamiast imienia:** pole klienta `salutation` (wołacz, np. „Panie Marku”), placeholder `{zwrot|Dzień dobry}`. `{imie}` działa tylko wewnętrznie, bez ściągi w UI. W kroku „Odbiorcy” kolumna z rozwiniętym zwrotem.
- **Stopka wypisu:** „Nie chcą Państwo otrzymywać ofert? Wystarczy odpisać NIE.” (bez linków, obsługa ręczna).
- **Etap 2:** odpowiedź „NIE” (sama lub zaczynająca się od „NIE” i krótsza niż 30 znaków) nie liczy się jako odpowiedź na ofertę — odbiorca dostaje `unsubscribeRequest`, a raport pokazuje przycisk „Oznacz jako wypisany” (bez automatu).
- **Ostrzeżenie o podpisie w treści** (edytor i import JSON), gdy ostatnie 3 linie zawierają „Antyramy” i numer telefonu.

## 2026-09-27 — commit 1: pola klienta

- Nowe pola klienta: `salutation`, `tags` (małe litery, bez duplikatów), `noMarketing`, `lastCampaignAt` (ustawia tylko wysyłka kampanii, poza schematem PUT).
- Edycja na karcie klienta przez **`PATCH /api/clients/:id/marketing`**, żeby nie nadpisywać reszty klienta.
- **Poprawiony błąd:** `files`, `fakturowniaInvoices`, `fakturowniaSyncedAt` miały w schemacie `.default()`, a formularz „Edytuj dane” ich nie wysyła — każdy zapis formularza czyścił pliki i migawkę faktur klienta. Teraz mają samo `.optional()` (brak klucza w PUT = bez zmian). Ta sama zasada dla nowych pól.

## 2026-09-28 — commit 2: podpis w Administracji

- Dokument **`settings/emailSignature`** `{ greeting, name, website, phone, email }`; brak dokumentu = domyślny podpis. **Puste pole = pominięte w stopce** (nie wraca do domyślnego), żeby dało się np. usunąć stronę.
- Podpis składa jedna funkcja `buildSignatureHtml` (`backend/src/services/emailSignature.ts`), używana przez maile z szablonów, obecne Promocje i (następnie) Kampanie.
- Błąd odczytu ustawień nie blokuje wysyłki — używany jest podpis domyślny.
- Pola escapowane do HTML; telefon dostaje link `tel:+48…`, strona bez `https://` dostaje go w linku.

## 2026-09-28 — commit 3: backend kampanii

- **Trasy `/api/campaigns`:** lista, odczyt, szkic (POST/PUT/DELETE — zmiany i usuwanie tylko w stanie `draft`), `duplicate`, podglądy (`POST /preview`, `POST /preview-pdf` z edytora bez zapisu; `GET /:id/preview`, `GET /:id/pdf` dla zapisanej), `start`, `send-batch`.
- **`start` nic nie wysyła** — waliduje, zamraża `productsSnapshot` i listę odbiorców (bieżące dane klientów), pomija wypisanych (`skippedNoMarketing`) i bez e-maila (`skippedNoEmail`). Maile wychodzą wyłącznie w `send-batch`.
- **Wynik każdego maila zapisywany od razu po wysyłce** (transakcja per mail), a nie na końcu partii — przerwane żądanie nie powoduje ponownej wysyłki do już obsłużonych. Blokada `sendLockUntil` (120 s, przedłużana co mail) chroni przed równoległą wysyłką z dwóch okien.
- `send-batch` sprawdza klienta tuż przed mailem: usunięty lub świeżo wypisany → `failed` z opisem, bez maila.
- **Placeholdery** rozwijane per odbiorca (temat bez escapowania — zwykły tekst; treść z escapowaniem wartości). **PDF wspólny** dla wszystkich — placeholdery w nim rozwinięte do tekstów zastępczych (np. „Dzień dobry”). PDF generowany raz na partię (bez plików tymczasowych na serwerze).
- Historia kontaktów: wpis „Wysłano kampanię: {nazwa} (wariant X)” z rozwiniętą treścią, produktami i `campaignId`; `lastCampaignAt` i `recomputeLastContact` jak dotąd. Błąd zapisu historii nie cofa wysyłki.
- `sendEmail` zwraca `{ id, threadId }` z Gmail API (dotąd `void`; stare wywołania bez zmian).
- W bez-produktowej kampanii tytuł PDF (jeśli podany) nadal jest nagłówkiem maila; pusty tytuł = bez nagłówka.

## 2026-09-28 — commit 4: ekran Kampanii

- Zakładka „Promocje” nazywa się teraz **„Kampanie”** (id zakładki `promotions` bez zmian — linki i nawigacja mobilna działają jak dotąd). Stary ekran Promocji odłączony; pliki i trasę usuwa commit 5 razem z migracją.
- Edytor w 4 krokach (Produkty → Odbiorcy → Treść → Wysyłka), kroki klikalne w dowolnej kolejności; szkic zapisywany przyciskiem „Zapisz szkic” i automatycznie przed wysyłką.
- **Filtry** działają na froncie (lista klientów i tak jest ładowana w całości): „od X dni” traktuje brak daty jako spełnienie warunku (nigdy nie zamawiał / brak kontaktu / nie dostał kampanii). Ostatnie zamówienie = ręczne zamówienia + faktury z Fakturowni bez korekt.
- Wypisani i klienci bez e-maila są widoczni na liście, ale nie da się ich zaznaczyć.
- „Podziel losowo na A i B” dzieli zaznaczonych i włącza test A/B; jeśli temat B jest, a podziału nie ma — ostrzeżenie „wszyscy dostaną A”.
- Podgląd maila liczony na backendzie (ten sam kod co wysyłka), odświeżany 0,5 s po zmianie treści. Placeholdery wstawiane kliknięciem w miejscu kursora.
- **Wysyłka:** potwierdzenie → zapis szkicu → `start` → pętla `send-batch` z paskiem postępu. Pętla chroniona numerem uruchomienia (podwójny efekt w StrictMode / odmontowanie nie uruchamia dwóch pętli). Przerwaną kampanię wznawia się w szczegółach.
- Szczegóły kampanii: liczniki, tematy A/B z liczbą wysłanych, podgląd dla wybranego odbiorcy (z aktualnym podpisem), PDF, lista odbiorców ze statusem, „Duplikuj kampanię” (otwiera kopię w edytorze).

## 2026-09-28 — commit 5: migracja i usunięcie Promocji

- Skrypt `migrate-promotions-to-campaigns.ts` (podgląd / `--live`, idempotentny przez `migratedFrom`). Przeniesione kampanie: `legacy: true`, `htmlBody` z oryginalnym mailem (szczegóły pokazują go zamiast ponownego renderu), wariant A = temat i treść promocji.
- `lastCampaignAt` klientów ustawiany z przeniesionych wysyłek (tylko gdy późniejszy) — ochrona przed zmęczeniem obejmuje też wysyłki sprzed Kampanii.
- Usunięte: trasa `/api/promotions`, `PromotionsPanel`, `PromotionsArchive`, `promotionEmail.ts`, jednorazowy skrypt `backfill-promotions.ts` (zrobił swoje 2026-09-27). Kolekcja `promotions` zostaje w bazie i w kopii zapasowej.
- Eksport Excel: arkusz „Promocje” zastąpiony arkuszem „Kampanie”.
