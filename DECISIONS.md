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
