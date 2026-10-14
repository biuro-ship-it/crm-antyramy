# CRM Antyramy – decyzje

Dziennik decyzji: co postanowiliśmy i dlaczego. Nowe wpisy dopisujemy **na górze**.
Zmiana zdania = nowy wpis, a stary dostaje status „zastąpiona przez #N”.
Wpisy #001–#008 spisane wstecz 2026-10-14 z kodu, `CLAUDE.md`, audytu z 2026-09-12 i poniższego archiwum;
gdzie daty albo powodu nie było w notatkach, jest to zaznaczone („nie zapisano”).
Szczegółowy dziennik prac nad modułem Kampanie (wrzesień–październik 2026, układ „commit po commicie”)
zostaje bez zmian w sekcji **Archiwum** na dole pliku.

<!-- Nowe wpisy dodawaj NA GÓRZE -->

## #011 – 2026-10-14 – Odpowiedź ze zmienionym tematem też jest odpowiedzią na kampanię
- **Status:** obowiązuje
- **Decyzja:** Po sprawdzeniu wątków kampanii `checkReplies` szuka maili od odbiorców bez odpowiedzi (`from:(…) after:<wysyłka − 1 h>`, po 25 adresów na zapytanie, ze spamem) poza wątkami kampanii. Mail liczy się jako odpowiedź tylko wtedy, gdy jego `In-Reply-To` / `References` wskazują na `Message-ID` naszego maila kampanii do tego odbiorcy; mail na inny temat — nie. Filtr cytatu rozpoznaje też nagłówek „W liście datowanym … napisano:” (Onet / Interia / WP).
- **Dlaczego:** biuro@fotogasek.pl odpowiedział 12.10 na kampanię z 8.10 tematem „Zamówienie FotoGAsek” — Gmail założył nowy wątek i CRM tego nie widział, choć nagłówki wskazywały na nasz mail. Sprawdzone na sucho: kampania z 8.10 → 1 nowa odpowiedź (fotogasek.pl, fragment „Witam!”), 0 błędów, ok. 7 s.
- **Odrzucone opcje:** Liczenie każdego maila od odbiorcy po wysyłce (łapałoby korespondencję na inne tematy); dopasowanie po temacie „Re: …” (klient zmienił temat).
- **Konsekwencje:** Funkcje `listMessageRefs`, `getMessage`, `getThreadMessageIds` (gmail.ts), `recipientMailQueries`, `repliesToAny`, `messageIdsIn` (campaignResults.ts, testy). Kilka dodatkowych zapytań do Gmaila na kampanię — tylko dla maili od odbiorców spoza wątków kampanii.

## #010 – 2026-10-14 – Sprawdzanie odpowiedzi: najpierw lista poczty przychodzącej, potem tylko te wątki
- **Status:** obowiązuje (uzupełnia #009)
- **Decyzja:** `checkReplies` jednym zapytaniem `messages.list` (`after:<najwcześniejsza wysyłka − 1 h> -from:me`, ze spamem i koszem) ustala wątki, do których coś przyszło, i pobiera (`threads.get`) tylko te. Gdy zawężenie się nie uda (brak daty wysyłki, ponad 10 000 wiadomości, inny błąd listy) — sprawdza wszystkie wątki jak dawniej.
- **Dlaczego:** Zmierzony limit Gmaila dla projektu to ok. 70 pobrań wątku na minutę (po minucie ciszy 69 udanych w 26 s, potem 403 „Quota exceeded”); kampania na 62 adresy zjadała go w całości nawet z ponawianiem (#009). Po zmianie kampania z 2026-10-08: 5 pobrań zamiast 62, lista 0,8 s; porównanie z pełnym sprawdzeniem — te same wątki, żadna odpowiedź nie pominięta.
- **Odrzucone opcje:** Tylko wolniejsze sprawdzanie (1 s/wątek) — kampania 62 adresów > 1 min, większa przekroczyłaby czas żądania HTTP; podniesienie limitu w Google Cloud Console — niezależne od kodu, nie usuwa problemu przy większych kampaniach.
- **Konsekwencje:** Funkcje `listThreadIdsWithIncomingMail` (gmail.ts), `incomingMailQuery` (campaignResults.ts, testy). Odpowiedź z innego adresu w tym samym wątku nadal nie jest liczona (bez zmian).

## #009 – 2026-10-14 – Limit zapytań Gmaila to nie brak uprawnienia
- **Status:** obowiązuje
- **Decyzja:** Przy sprawdzaniu odpowiedzi błąd 429 albo 403 „Quota exceeded” / `rateLimitExceeded` jest traktowany jako limit zapytań: `getThreadMessages` ponawia po 1, 2 i 4 s, a między wątkami jest 150 ms przerwy. Jeśli limit nadal blokuje — komunikat „Gmail chwilowo ogranicza liczbę zapytań” (HTTP 429). Komunikat „Brak uprawnienia do czytania poczty” tylko przy prawdziwym braku `gmail.readonly`. Obie przyczyny trafiają do `logs/error.log`.
- **Dlaczego:** Każdy 403 był brany za brak uprawnienia — przy kampanii na 62 adresy 10 wątków dostało 403 z limitu na minutę, a CRM kazał odnawiać token, choć token był dobry (token odnowiono 2026-10-14 niepotrzebnie).
- **Odrzucone opcje:** Zliczanie limitu jako zwykłego błędu wątku i sprawdzanie dalej (kolejne wątki też by trafiały w limit, wynik byłby niepełny bez ostrzeżenia).
- **Konsekwencje:** Sprawdzanie kampanii trwa dłużej (ok. +0,15 s na wątek). Testy w `backend/src/services/gmail.test.ts`.

## #008 – 2026-10-14 – Dokumentacja całej aplikacji według szablonu
- **Status:** obowiązuje
- **Decyzja:** Wiedza o aplikacji mieszka w repo: `CLAUDE.md` (instrukcja), `SPEC.md` (co robi aplikacja – cały CRM, nie tylko Kampanie), `DECISIONS.md` (ten plik), `HANDOVER.md` (stan). Deploy opisuje `secret/DEPLOY.md` (lokalnie, poza repo) i `deploy.bat`.
- **Dlaczego:** Dokumenty opisywały wyłącznie moduł Kampanie, a reszta aplikacji (klienci, kalendarz, Kanban, dostawcy…) nie miała opisu. Schemat z `C:\Claude\szablony` jest wspólny dla wszystkich aplikacji.
- **Odrzucone opcje:** Pełny `SPEC.md` z kryteriami „działa, gdy…” dla każdego modułu naraz (za dużo pracy przy działającej aplikacji – dopisujemy je przy najbliższej zmianie danego modułu); przepisanie archiwalnego dziennika Kampanii do nowego układu (ryzyko zgubienia szczegółów).
- **Konsekwencje:** Po każdej sesji aktualizujemy `HANDOVER.md`, decyzje trafiają tutaj, zmiany funkcji – najpierw do `SPEC.md`. Archiwum Kampanii poniżej zostaje tylko do odczytu.

## #007 – 2026-10-08 – Obowiązkowa wysyłka testowa przed wysyłką do wszystkich
- **Status:** obowiązuje
- **Decyzja:** Przycisk „Wyślij do N odbiorców” jest aktywny dopiero po teście aktualnej wersji (`POST /api/campaigns/:id/send-test`, adres info@pluszek.pl, temat z `[TEST]`). Zmiana tytułu, produktów, tematu, treści lub kolażu wymaga nowego testu; zmiana odbiorców – nie. Test niczego nie zapisuje w kampanii ani w historii klienta.
- **Dlaczego:** Wysyłka do kilkudziesięciu klientów jest nieodwracalna; test pokazuje mail dokładnie tak, jak zobaczy go odbiorca (kolaż, tabela, PDF).
- **Odrzucone opcje:** Test opcjonalny (łatwo go pominąć); test zapisujący się w historii (zaburzałby pomiar wyników i ostrzeżenie „kampania w ostatnich 7 dniach”).
- **Konsekwencje:** Adres testowy jest stałą w dwóch miejscach kodu (`backend/src/routes/campaigns.ts`, `frontend/src/services/api.ts`). Szczegóły: archiwum niżej, wpisy z 2026-10-08.

## #006 – 2026-09-27 – Kampanie zastępują Promocje; żaden mail nie wychodzi bez „Wyślij”
- **Status:** obowiązuje
- **Decyzja:** Zakładka „Promocje” zamieniona na „Kampanie” (id zakładki zostaje `promotions`); rekordy przeniesione skryptem `migrate-promotions-to-campaigns`, kolekcja `promotions` zostaje jako kopia. **Niezmiennik:** żaden mail nie wychodzi bez kliknięcia „Wyślij” po podglądzie; automaty (cron 6:45, „Sprawdź odpowiedzi”) tylko czytają i liczą; wysłana kampania jest niezmienna razem ze swoim kolażem. Wysyłka partiami po 10 sterowana z przeglądarki (Passenger może ubić proces w tle).
- **Dlaczego:** Kampanie mierzą wyniki (odpowiedzi, zamówienia, telefony), czego Promocje nie robiły; niezmiennik chroni klientów przed przypadkową wysyłką.
- **Odrzucone opcje:** Kolejka wysyłki na serwerze (Passenger); automatyczna wysyłka z crona.
- **Konsekwencje:** Pełne uzasadnienia, mapowanie pól i kolejne etapy – w archiwum niżej (wpisy z 2026-09-27 … 2026-10-08).

## #005 – 2026-09-12 – Testy przed deployem i obsługa błędów po audycie
- **Status:** obowiązuje
- **Decyzja:** `npm test` backendu i frontendu jest w `.github/workflows/deploy.yml` **przed** buildem – nieudany test wstrzymuje deploy. Czyste funkcje wydzielamy do `services/` / `utils/` i testujemy (trasy importują Firestore, więc testy bez bazy ich nie załadują). Daty „dzisiaj” liczy `todayISO()` (Europe/Warsaw), a `PUT` na usunięty rekord zwraca 404 (`isNotFound()`).
- **Dlaczego:** Audyt 2026-09-12 znalazł 43 błędy TypeScript na froncie, 4 testy w całym projekcie i 22 `catch` bez logu; lepiej zatrzymać deploy niż wysłać zepsutą wersję.
- **Odrzucone opcje:** `multer` 2.x (zmienia API uploadu – osobne zadanie), `exceljs` zamiast `xlsx` i `firebase` 11+ (zmiany łamiące – zostawione świadomie, opis w `secret/audyt-2026-09-12.md`).
- **Konsekwencje:** Nowy plik testów backendu trzeba dopisać do skryptu `test` w `backend/package.json`.

## #004 – data nie zapisana – Jedno konto OAuth Google dla Gmaila i Kalendarza
- **Status:** obowiązuje
- **Decyzja:** Wysyłka maili, czytanie odpowiedzi i Kalendarz Google używają tej samej konfiguracji OAuth2 (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` w `.env` na serwerze); token generuje `backend/scripts/get-gmail-token.js` ze scope’ami Gmail i `calendar.events`.
- **Dlaczego:** Jedna autoryzacja zamiast kilku; poczta idzie z biuro@antyramy.eu. Powodu wyboru nie zapisano.
- **Odrzucone opcje:** nie zapisano
- **Konsekwencje:** Wygaśnięcie tokenu (`invalid_grant`) wyłącza naraz pocztę, kampanie i Kalendarz. 2026-10-08 token wygasł po 9 dniach – prawdopodobna przyczyna to status aplikacji OAuth „Testing” (tokeny na 7 dni); trwałe rozwiązanie czeka w `HANDOVER.md`.

## #003 – data nie zapisana – Pliki na dysku serwera, sprzątane razem z rekordem
- **Status:** obowiązuje
- **Decyzja:** Uploady (zdjęcia produktów, dokumenty klientów i dostawców, kolaże) leżą w `public_nodejs/public/uploads/` i są serwowane jako `/uploads`. Usunięcie rekordu z plikiem sprzątamy plik (`deleteUpload`; kolaże: `releaseCollageFile` sprawdza współdzielenie). Pola, których formularz nie wysyła, mają w schematach zod samo `.optional()` – nie `.default()`, który nadpisywałby dane przy `PUT`.
- **Dlaczego:** Najprostsze na hostingu mydevil bez osobnego magazynu plików. Powodu wyboru nie zapisano; zasada `.optional()` wynika z błędu naprawionego 2026-09-27 (zapis formularza „Edytuj dane” czyścił pliki i faktury klienta).
- **Odrzucone opcje:** nie zapisano
- **Konsekwencje:** Pliki wgrane lokalnie nie istnieją na produkcji – kolaże i uploady testujemy na crm.antyramy.eu. Pliki nie są w repo; kopię zapewnia Archiwum (ZIP) i `backup.js --include-uploads`.

## #002 – data nie zapisana – Dostęp tylko dla kont z listy, sprawdzany w backendzie
- **Status:** obowiązuje
- **Decyzja:** Logowanie kontem Google (Firebase Auth); każde żądanie `/api/*` przechodzi `authenticate`, który weryfikuje token i sprawdza e-mail na liście `ALLOWED_EMAILS` (`.env`, domyślnie biuro@antyramy.eu i jedno konto prywatne). Kopia listy we froncie (`useAuth.ts`) tylko blokuje logowanie od razu.
- **Dlaczego:** CRM zawiera dane osobowe klientów – dostęp ma być zamknięty, a dodanie użytkownika nie powinno wymagać zmiany kodu.
- **Odrzucone opcje:** nie zapisano
- **Konsekwencje:** Źródłem prawdy jest backend; brak ról – każde dopuszczone konto widzi wszystko. Nowe konto = zmiana `ALLOWED_EMAILS` na serwerze i restart.

## #001 – data nie zapisana – Wybór stacku
- **Status:** obowiązuje
- **Decyzja:** Frontend: React 18 + TypeScript + Vite + Tailwind, PWA. Backend: Node.js + Express (TypeScript). Baza i logowanie: Firebase (Firestore + Auth Google). Hosting: s61.mydevil.net (FreeBSD, Passenger), deploy przez GitHub Actions lub lokalny `deploy.bat`.
- **Dlaczego:** Spójne z pozostałymi aplikacjami Antyramy / EBRA na mydevil; PWA zastępuje aplikację mobilną. Szczegółowego uzasadnienia nie zapisano.
- **Odrzucone opcje:** nie zapisano
- **Konsekwencje:** Passenger może ubić proces w tle, więc zadania długie dzielimy na krótkie żądania (wysyłka partiami); biblioteki z natywnymi binarkami odpadają na FreeBSD (kolaż rysowany w przeglądarce).

---

# Archiwum – dziennik prac nad modułem Kampanie (przed numeracją, bez zmian)

Rejestr decyzji projektowych modułu Kampanie. Najnowsze na dole sekcji.

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

---

# Etap 2 — pomiar wyników

## 2026-09-29 — założenia (zaakceptowane przez Krzyśka)

- **Sprawdzanie odpowiedzi i przeliczanie zamówień:** przycisk w raporcie + automat raz dziennie (cron na mydevil). Automat **tylko czyta i liczy** — nic nie wysyła. **Bez automatycznej synchronizacji Fakturowni** — faktury dochodzą do zamówień po ręcznej „hurtowej aktualizacji z Fakturowni”.
- **Zamówienie w oknie kilku kampanii → ostatnia kampania przed zamówieniem.** Każde zamówienie liczone raz, suma w rankingu zgadza się ze sprzedażą.
- **Telefon kontrolny:** „oddzwonić” i „nie odebrał” tworzą kolejne zadanie za 2 dni robocze; „zamówił” i „nie teraz” zamykają temat.
- **Uprawnienie `gmail.readonly`** dopisane do skryptu tokenu. Skrypt zapisuje nowy token prosto do `backend/.env` (kopia → `.env.bak`, ignorowana przez git) zamiast wypisywać go na ekran — token nie trafia do logów ani czatu.

## 2026-09-29 — commit 1: reguły pomiaru (`services/campaignResults.ts`)

- **Odpowiedź** = pierwsza wiadomość w wątku kampanii **od adresu odbiorcy**, późniejsza niż wysyłka. Pomijane: nasze własne wiadomości i komunikaty systemowe (mailer-daemon, postmaster, no-reply). Odpowiedź z innego adresu tej samej firmy nie zostanie wykryta — do oznaczenia ręcznie.
- **Tekst odpowiedzi** bez cytatu: ucinany od nagłówka cytatu (Gmail PL „W dniu … napisał(a):”, EN „On … wrote:”, „-----Original Message-----”, „Od:/From:”, separator Outlooka, „Wysłane z iPhone’a”) i od separatora podpisu `-- `; linie `>` pomijane. HTML: `<blockquote>` usuwany.
- **„NIE” = prośba o wypis:** sam „NIE/nie” z interpunkcją albo tekst zaczynający się od słowa „NIE” krótszy niż 30 znaków (np. „Nie, dziękujemy”). „Nieźle”, „Niestety…” — nie (granica słowa z obsługą polskich liter). Prośba o wypis nie liczy się jako odpowiedź na ofertę.
- **Przypisanie zamówień:** źródło = `client.orders` (w tym `fv-*` z Fakturowni — bez podwójnego liczenia faktur). Okno `[dzień wysyłki, dzień wysyłki + N]` włącznie; tylko odbiorcy ze statusem `sent`; zamówienia bez kwoty pomijane. Statusy: `auto` (liczone, „do potwierdzenia”), `confirmed`, `rejected` (nie liczone). Przeliczenie zachowuje ręczne decyzje, dopóki zamówienie istnieje.
- **Wyniki:** zamówienie odbiorcy z rozmową „zamówił” liczy się jako „po telefonie”, pozostałe jako „z maila”; `byPhone` = liczba rozmów „zamówił” (także gdy zamówienia jeszcze nie ma w CRM).
- **Dni robocze** bez sobót i niedzieli; **święta nieuwzględnione** (zadanie może wypaść w święto — do przesunięcia ręcznie).

## 2026-09-29 — commit 2: sprawdzanie odpowiedzi, zamówienia, raport

- `POST /api/campaigns/:id/check-replies` sprawdza wątki odbiorców `sent` bez wykrytej odpowiedzi, potem przelicza zamówienia. Przy **pierwszym** wykryciu wpis w historii kontaktów klienta („Odpowiedź na kampanię: …” / „Prośba o wypis (odpowiedź NIE) — kampania: …”, autor „kampanie (automatycznie)”). Już wykrytych nie sprawdza ponownie.
- **Kampanie przeniesione z Promocji nie mają `gmailThreadId`** — odpowiedzi dla nich się nie sprawdzi (raport pokazuje liczbę „bez wątku Gmail”); przypisanie zamówień działa.
- `POST /recompute-orders` liczy wszystkie wysłane kampanie naraz (reguła „ostatnia kampania”); zapis per kampania w transakcji — nie nadpisuje statusów wysyłki trwającej równolegle.
- `PATCH /:id/orders` — ręczna decyzja ✓/✕; `results` przeliczane przy każdej zmianie.
- **Okno przypisania** w `settings/campaigns.attributionDays` (domyślnie 14, zakres 1–90), edytowalne w Administracji; zmiana działa od następnego przeliczenia.
- Raport w szczegółach kampanii: kafelki wysyłki i wyników (odpowiedzi A/B z %, prośby o wypis, zamówienia, wartość, z maila / po telefonie), przyciski „Sprawdź odpowiedzi” i „Przelicz zamówienia” z datą ostatniego wykonania, filtr odbiorców (odpowiedzieli / wypis / z zamówieniem / błędy), przy prośbie o wypis przycisk „Oznacz jako wypisany” (po potwierdzeniu, bez automatu).
- Pierwsze przeliczenie na produkcji (2026-09-29): kampania „Oferta ramki sosna 1.5 cm” — 2 zamówienia w oknie (1 664,55 zł netto), „do potwierdzenia”.

## 2026-09-29 — commit 3: telefony kontrolne

- Tworzenie follow-upu wydzielone do `services/followupService.ts` (tworzenie + Google Calendar, zmiana statusu + usunięcie wydarzenia). Trasy `/api/followups` zachowują się jak dotąd.
- `POST /api/campaigns/:id/followups`: zadanie „Telefon: {kampania}” na **+2 dni robocze od dnia kliknięcia** dla odbiorców `sent` bez odpowiedzi, bez prośby o wypis, bez wypisu na karcie i bez zadania z tej kampanii (`recipients[].followupId`). Ponowne kliknięcie nie dubluje zadań.
- `POST /api/followups/:id/outcome` (zamówił / oddzwonić / nie teraz / nie odebrał + notatka): zamyka zadanie (usuwa wydarzenie z Google Calendar), wpis w historii kontaktów kanałem `telefon`, zapis `callOutcome` u odbiorcy i przeliczenie `results`. „Oddzwonić” i „nie odebrał” tworzą kolejne zadanie +2 dni robocze z tym samym tytułem.
- W Kalendarzu i na liście „Do wykonania na dziś” zadania z kampanii mają przycisk „📞 Wynik” (okno szybkiego wyniku) zamiast „zrobione”; zwykłe zadania bez zmian.
- Raport: przycisk „📞 Utwórz follow-upy (N)” z potwierdzeniem, znaczki „telefon zaplanowany” / wynik rozmowy przy odbiorcy.

## 2026-09-29 — commit 4: ranking

- Przełącznik „Lista | Ranking” w zakładce Kampanie. Ranking liczony na froncie z listy kampanii (`GET /api/campaigns` zwraca `results`, `sentA/sentB`, nazwy produktów) — bez osobnego endpointu.
- **Tabela sortowalna:** data, kampania + produkty, temat A/B, % odpowiedzi, zamówienia, wartość netto; klik w wiersz otwiera raport. **% odpowiedzi = (odpowiedzi A + B) / wysłane**; dla kampanii przeniesionych z Promocji „—” (brak wątków Gmail — nie mierzymy, zamiast pokazywać fałszywe 0%).
- **Wykres słupkowy** wartości zamówień per kampania (chronologicznie): SVG bez nowej biblioteki, jedna seria — bez legendy, podpis wartości tylko przy najwyższym słupku, reszta w podpowiedzi i w tabeli. Kolor `#2a78d6` (jasny motyw) / `#3987e5` (ciemny) — sprawdzony walidatorem palety (kontrast ≥ 3:1 na tłach aplikacji `#ffffff` i `#17171b`). Tekst w kolorach tekstu, nie serii.
- **„Który temat wygrał”:** % odpowiedzi i liczba w każdym wariancie; zwycięzca = wyższy %; **poniżej 10 wysłanych w którymkolwiek wariancie — „za mało danych”**, równe wyniki — „remis”. Bez testów istotności statystycznej (przy tej skali i tak rozstrzygałyby rzadko) — próg 10 to świadome uproszczenie.

## 2026-09-29 — commit 5: automat dzienny

- `scripts/campaign-daily.ts`: kampanie `sent` z ostatnich **30 dni** → `checkReplies`, potem `recomputeOrders` (wszystkie). Filtr daty w kodzie (zapytanie status + sentAt wymagałoby indeksu złożonego — zbędny przy tej skali).
- Brak uprawnienia do czytania poczty przerywa sprawdzanie odpowiedzi (kod wyjścia 2), ale przeliczenie zamówień i tak się wykonuje.
- Cron na s61 o **6:45** (przed istniejącymi zadaniami Ramiarza o 7:00–7:20), log w `domains/crm.antyramy.eu/logs/campaign-daily.log`. Ustawiany ręcznie w crontabie konta Pluszek (nie przez deploy).

---

# Kolaż z 3 zdjęć do kampanii

## 2026-10-07 — założenia (zaakceptowane przez Krzyśka)

- **Kampanie, nie Promocje.** Moduł Promocje nie istnieje od 2026-09-28 — kolaż dochodzi do edytora Kampanii (krok 3 „Treść”).
- **Kolaż 1200×800 px, JPG, maks. ok. 250 KB.** W mailu wyświetlany w szerokości 600 px (retina). Układ: duże zdjęcie po lewej (60% szerokości po odjęciu odstępu), dwa mniejsze jedno nad drugim po prawej, białe odstępy 6 px, przycięcie „cover” wyśrodkowane.
- **Plakietka „OFERTA TYGODNIA”** w lewym górnym rogu dużego zdjęcia: tło `#1a56db` (kolor nagłówka maila kampanii), biały tekst, Inter Bold. Brak Intera (np. offline) → zwykły font bezszeryfowy, bez błędu.
- **Kolaż w mailu jako zwykły `<img src=URL>`** (bez inline CID). Plik leży w `public/uploads` i jest publiczny jak zdjęcia produktów. Świadomie przyjęte: Outlook domyślnie blokuje obrazy zewnętrzne do kliknięcia „Pokaż obrazy”. CID — ewentualnie później, osobne zadanie.
- **Kolaż nie trafia do PDF** — PDF bez zmian.
- **Kolaż robiony w przeglądarce (Canvas), bez nowych bibliotek.** Powody: mydevil to FreeBSD, `sharp` nie ma tam gotowych binarek (ryzyko nieudanego `npm install` przy deployu); na serwer idzie tylko gotowy plik ~250 KB, więc limit uploadu 5 MB nie przeszkadza przy zdjęciach z telefonu. Orientacja z EXIF: `createImageBitmap(..., { imageOrientation: 'from-image' })`.
- **Wejście tylko JPG/PNG.** HEIC/HEIF i inne → komunikat z instrukcją dla iPhone'a (Ustawienia > Aparat > Formaty > Najbardziej zgodne).

## 2026-10-07 — commit 1: logika kolażu (`frontend/src/utils/collage.ts`)

- Układ i przycięcie to **czyste funkcje** (`computeCollageLayout`, `computeCoverCrop`, `fitJpegQuality`) — testowane w vitest bez przeglądarki; rysowanie i eksport w `createCollage`.
- **Zaokrąglenia:** szerokość dużego = `round((W − gap) × 0,6)`, prawa kolumna dostaje resztę; górne małe = `round((H − gap) / 2)`, dolne resztę — suma z odstępem zawsze równa 1200×800, bez szczelin i nakładania.
- **Odstęp między literami plakietki rysowany ręcznie** (znak po znaku, szerokość z `measureText`) zamiast `ctx.letterSpacing` — ta właściwość nie działa w starszym Safari, a plakietka ma wyglądać tak samo na telefonie i komputerze. Wysokość plakietki z rzeczywistego obrysu wielkich liter (`actualBoundingBoxAscent/Descent`), żeby tekst był optycznie na środku.
- **Font:** `document.fonts.load('700 34px Inter')` z limitem 3 s (wolna sieć nie blokuje kolażu), potem `document.fonts.ready`; font canvasu to `700 34px Inter, sans-serif`.
- **Jakość JPG:** od 0,90 co 0,05 w dół do 0,50, pierwszy wynik ≤ 250 KB. Gdy nawet 0,50 jest większe — zwracany najmniejszy wynik z `overLimit: true` (UI pokaże rozmiar), bez błędu.
- Gdy `createImageBitmap` z opcjami nie działa (starsze przeglądarki), zdjęcie dekodowane przez `<img>` — przeglądarki też obracają je wg EXIF.

## 2026-10-07 — commit 2: okno „Utwórz kolaż” (`CollageDialog.tsx`)

- **Podgląd = zapisywany plik.** Okno trzyma jeden wynik `createCollage()`; ten sam `Blob` jest wyświetlany i wysyłany przy „Zapisz”. Brak osobnej atrapy.
- **Podgląd 350 ms po ostatniej zmianie** (zdjęcia, kolejność). `createCollage` przyjmuje `AbortSignal` — poprzednie generowanie jest przerywane między etapami (dekodowanie, kolejne jakości JPG), a nie tylko ignorowane. Stary podgląd zostaje widoczny (przygaszony) do czasu nowego — bez migotania; „Zapisz” nieaktywne w trakcie.
- **Kolejność:** pole 1 = duże zdjęcie; „Ustaw jako duże” zamienia wskazane pole z polem 1. „Wybierz zdjęcia” (wiele naraz, galeria w telefonie) wypełnia najpierw puste pola.
- **`overLimit`** → żółte ostrzeżenie z rozmiarem, zapis dozwolony (limit uploadu 5 MB).
- **Upload `POST /api/upload?kind=kolaz`** → plik `kolaz-<czas>-<los>.jpg`. Prefiks wybierany ze stałej listy (`kolaz` albo domyślnie `produkt`) — wartość z zapytania nie trafia do nazwy pliku. Pozostałe uploady bez zmian.
- **Frontend nie kasuje plików kolażu.** Po „Zmień” / „Usuń” edytor tylko zapisuje szkic z nowym `heroImageUrl`; stary plik sprząta backend przy zapisie szkicu, po sprawdzeniu, czy nikt inny go nie używa (commit 3).
- **Ostrzeżenie „kolaż z lokalnego serwera”**, gdy `heroImageUrl` zaczyna się od `http://localhost` / `127.0.0.1` / `[::1]` — taki obrazek nie wyświetli się odbiorcy. Bez zmiany sposobu budowania URL w `upload.ts` (propozycja `PUBLIC_BASE_URL` — otwarta).
- **Telefon:** okno jako arkusz od dołu, jedna kolumna, pola 16:9 (od `sm` 4:3), przyciski w stopce obok siebie. Podgląd bez zaokrąglonych rogów — plik ma ostre rogi, a plakietka leży w samym rogu.

## 2026-10-07 — commit 3: backend `heroImageUrl` (`services/collageFiles.ts`, `routes/campaigns.ts`)

- **Walidacja adresu (bezpieczeństwo):** akceptowany wyłącznie `https://crm.antyramy.eu/uploads/kolaz-[A-Za-z0-9_-]+.jpg` — bez portu, loginu, zapytania i kotwicy. Odrzucane: obce hosty, inne prefiksy (`produkt-…`), podkatalogi, `..`, `\` i ich zakodowane postacie (`%2e`, `%2f`, `%5c`) — jeszcze przed parsowaniem URL. Nikt nie wstawi do maila cudzego obrazka (śledzenie, spam) ani nie wskaże pliku do skasowania spoza kolaży. Zły adres → 400.
- **`http://crm.antyramy.eu/…` zapisywany jako `https://…`.** `upload.ts` buduje adres z protokołu żądania; nie dało się sprawdzić, czy Passenger przekazuje `https` (odczyt bazy produkcyjnej zablokowany). Własny host przez http to ten sam plik, a `.htaccess` i tak przekierowuje na https — kanonizacja zamiast odrzucania, żeby kolaż nie „zniknął” na produkcji.
- **Localhost tylko w developmencie:** `NODE_ENV ≠ production` **oraz** żądanie przyszło na lokalny host (nagłówek `Host`). Drugi warunek to zabezpieczenie na wypadek, gdyby na serwerze NODE_ENV nie był ustawiony — tam host to zawsze `crm.antyramy.eu`, więc adres z localhost i tak jest odrzucany.
- **Pole w zapisie szkicu:** brak klucza = bez zmian (zapis z innego kroku, starsza wersja PWA w pamięci telefonu), `null` / `''` = usunięcie, tekst = walidacja. Ta sama zasada co `files` u klienta (2026-09-27).
- **Kasowanie pliku** (`releaseCollageFile`) po zapisie szkicu ze zmienionym/usuniętym kolażem i po usunięciu szkicu:
  - nazwa pliku tylko z bezpiecznego parsera (`kolaz-*.jpg`, `basename` = nazwa), katalog stały (`public/uploads`);
  - **plik zostaje, jeśli używa go inna kampania (dowolny status) albo produkt** — porównanie po **nazwie pliku**, nie po pełnym adresie (żeby `http://`/localhost nie ominęły ochrony);
  - kampania inna niż szkic nigdy nie kasuje pliku;
  - błąd (brak pliku, Firestore niedostępny) → ostrzeżenie w logu, zapis kampanii przechodzi; gdy nie da się sprawdzić użycia — plik zostaje.
  - Skan użycia czyta `heroImageUrl` wszystkich kampanii i `imageUrl` produktów (`select`) — przy tej skali (dziesiątki dokumentów) prościej i pewniej niż osobne pole/indeks.
- **Duplikat kopiuje `heroImageUrl`** — oba szkice wskazują ten sam plik; dzięki regule wyżej usunięcie kolażu w jednej kampanii go nie skasuje.
- **Mail:** blok `<img width="600">` w komórce **bez bocznego paddingu** (kolaż na całą szerokość karty 600 px) — Outlook bierze szerokość z atrybutu `width`, w komórce z paddingiem 36 px obrazek wystawałby poza kartę. Alt: „Oferta tygodnia - {tytuł oferty}”, a gdy tytuł pusty — temat po placeholderach. Bez kolażu HTML **identyczny** jak przed zmianą — test porównuje z wzorcem zapisanym z kodu sprzed zmiany (`services/__fixtures__/`).
- Podgląd maila w edytorze (`POST /preview`) dostaje `heroImageUrl` — ta sama walidacja co zapis.
- **Ograniczenie:** plik wgrany, a potem nieprzypisany (np. nieudany zapis szkicu po uploadzie, zamknięta karta w trakcie) zostaje w `public/uploads` jako sierota — bez automatycznego sprzątania.

---

# Edytor: kolaż w kroku 1 i wysyłka testowa

## 2026-10-08 — założenia (zaakceptowane przez Krzyśka)

- **Błąd wyjściowy:** kampania z samym kolażem nie dawała się wysłać — edytor i `POST /:id/start` wymagały produktu albo haczyka „Bez tabeli i PDF” w kroku 1, a kolaż robiło się dopiero w kroku 3.
- **Produkty i kolaż niezależne** (jedno, drugie, oba albo nic). Haczyk „Bez tabeli i PDF” usunięty: **brak zaznaczonych produktów = mail bez tabeli i PDF**. Pole `noProducts` zostaje w bazie (stare kampanie, raporty) — edytor wylicza je z liczby produktów. Mail bez produktów i bez kolażu jest dozwolony, krok 4 pokazuje ostrzeżenie „pójdzie sam tekst”.
- **Zdjęcia do kolażu jak dotąd** — z dysku / telefonu; okno kolażu bez zmian (kolaż ze zdjęć z katalogu — nie teraz).
- **Kolejność kroków: Produkty i kolaż → Treść → Odbiorcy → Wysyłka.** Podgląd na żywo zostaje obok treści i pojawia się drugi raz w kroku 4 — tam, gdzie klika się wysyłkę (niezmiennik „wysyłka po podglądzie”).
- **Wysyłka testowa na info@pluszek.pl jest obowiązkowa** przed wysyłką do wszystkich.

## 2026-10-08 — commit 1: `POST /api/campaigns/:id/send-test`

- **Adres testowy na sztywno w backendzie** (`CAMPAIGN_TEST_EMAIL`), nigdy z żądania — trasa nie może posłużyć do wysłania maila na dowolny adres. Zmiana adresu = zmiana stałej (i napisu w `frontend/src/services/api.ts`).
- Test idzie **tylko ze szkicu** i używa tego samego renderu co wysyłka (`renderForClient`, PDF, kolaż); temat `[TEST] …`, przy A/B dwa maile `[TEST A]` / `[TEST B]`. Placeholdery dla odbiorcy wybranego w podglądzie (bez odbiorcy — teksty zastępcze).
- **Niczego nie zapisuje:** status, odbiorcy, liczniki, historia kontaktów klienta i `lastCampaignAt` bez zmian — test nie zaburza pomiaru ani ostrzeżenia „kampania w ostatnich 7 dniach”.
- Walidacja tematu i treści wspólna dla `start` i `send-test` (`campaignContentError` w `services/campaignRender.ts`). W `start` zostaje zabezpieczenie na produkty usunięte z katalogu po zapisie szkicu (nowy komunikat).

## 2026-10-08 — commit 2: edytor

- **„Test aktualnej wersji” = odcisk treści** (`contentFingerprint` w `frontend/src/utils/campaignSend.ts`): tytuł, produkty, temat i treść A/B, kolaż. Nazwa kampanii i lista odbiorców nie wchodzą do odcisku — ich zmiana nie wymaga nowego testu.
- **Blokada tylko w edytorze, w pamięci karty** — po odświeżeniu strony albo ponownym otwarciu szkicu test trzeba wysłać jeszcze raz. Świadome uproszczenie: backend nie pamięta testu i `start` go nie wymaga (jedyna droga do `start` to przycisk w edytorze).
- Reguły „co musi być uzupełnione” wydzielone do czystych funkcji (`contentError`, `recipientsError`) z testami.

## 2026-10-08 — commit 3: błąd wygasłego tokenu Gmail (lokalnie, niewdrożone)

- **Powód:** pierwszy test na produkcji nie doszedł — Google odrzucił wysyłkę (`invalid_grant`, token z 2026-09-29 wygasł albo został cofnięty). Edytor pokazał samo „invalid_grant” u góry strony, poza ekranem przy przyciskach w kroku 4, więc wyglądało to jak „mail nie doszedł”.
- **`sendEmail` zamienia `invalid_grant` na instrukcję** (`GMAIL_TOKEN_ERROR` w `services/gmail.ts`): token wygasł → wygeneruj nowy i przenieś na serwer. Rozpoznanie w `isInvalidGrant` (odpowiedź Google albo treść komunikatu), z testem. Pozostałe błędy Gmaila przechodzą bez zmian.
- **Błędy testu i wysyłki pokazywane przy przyciskach** (osobny stan `sendError` w `CampaignEditor.tsx`), z dopiskiem „Test NIE został wysłany”. Błędy zapisu szkicu zostają u góry strony jak dotąd.
- **Token Gmail odnowiony ręcznie** (skrypt `get-gmail-token.js`, linia `GMAIL_REFRESH_TOKEN` w `.env` na serwerze, restart). Przyczyna wygaśnięcia niepotwierdzona — podejrzenie: aplikacja OAuth w trybie „Testing” (tokeny na 7 dni). Do sprawdzenia w Google Cloud Console; bez zmiany w kodzie.
