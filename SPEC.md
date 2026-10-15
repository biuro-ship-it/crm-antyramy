# CRM Antyramy – specyfikacja

Wersja lekka, spisana 2026-10-14 z działającej aplikacji (kod, `CLAUDE.md`, `HANDOVER.md`, `DECISIONS.md`).
Opisuje stan faktyczny; rozbudowujemy ją przy każdej nowej funkcji – **najpierw tu, potem kod**.
Moduł **Kampanie** ma pełny opis (sekcja niżej). Pozostałe moduły mają opis podstawowy – kryteria
„działa, gdy…” dopisujemy przy ich najbliższej zmianie.

## Cel
Wewnętrzny CRM firmy Antyramy (producent ram z Tarnowa): jedno miejsce na klientów (zakłady ramiarskie,
sklepy, agencje), katalog produktów, kontakty z dostawcami, telefony kontrolne i zadania — oraz oferty mailowe
do klientów z mierzeniem, co przyniosły. Zamiast notatek w arkuszach i skrzynce pocztowej.

## Użytkownicy
- **Krzysiek i biuro** — konta Google z listy `ALLOWED_EMAILS` (backend jest źródłem prawdy, front blokuje logowanie
  od razu); pracują na komputerze i telefonie (PWA). Brak ról — wszyscy dopuszczeni widzą wszystko.

## Funkcje
### Działa (wdrożone na crm.antyramy.eu)
- ☑ **Klienci** — lista z wyszukiwarką i filtrami; typ klienta: zakład / sklep / agencja / inne, kolor relacji, trasa, tagi;
  karta klienta z historią kontaktów (telefon / mail / spotkanie / inne), zamówieniami (sprzedaż rok / miesiąc / razem),
  plikami, danymi z Białej listy VAT po NIP, fakturami z Fakturowni (tylko odczyt), polami marketingowymi
  (zwrot w wołaczu, tagi, „nie wysyłać ofert”).
- ☑ **Kalendarz i follow-upy** — zadania „zadzwoń / przypomnij” z terminem, podsumowanie na dziś i zaległych na ekranie klientów,
  wynik rozmowy; korzysta z Kalendarza Google (to samo konto OAuth co Gmail).
- ☑ **Kanban** — karty w kolumnach „do zrobienia / w toku / zrobione”, kolory, termin, powiązanie z klientem, przeciąganie.
- ☑ **Produkty** — katalog (nazwa, kod, cena netto, zdjęcie); źródło tabeli i PDF w ofertach.
- ☑ **Kampanie** — tygodniowe oferty mailowe z kolażem, testem A/B, obowiązkową wysyłką testową i pomiarem wyników (opis niżej).
- ☑ **Szablony maili** — edytor z wersjonowaniem treści, kategorie, wysyłka z szablonu do klienta.
- ☑ **Notatki** — notatki z kolorami (etykiety kolorów ustawiane w Administracji).
- ☑ **Dostawcy** — karta dostawcy (kontakty, ustalenia: rabat / termin płatności / dostawy, materiały z cenami i zdjęciem, pliki, historia kontaktów)
  oraz kalkulator HDF (cena z m² i cięcia, zapis ceny do materiałów dostawcy). Zamówienie z karty: wysyłka z CRM (Gmail, PDF
  w załączniku) albo „Pobierz PDF” + „Oznacz jako wysłane”; obie drogi trafiają do **Historii zamówień** — opis niżej.
- ☑ **Archiwum** — pełna kopia danych (JSON odtwarzalny skryptem `backup restore`), paczka ZIP z plikami, eksport do Excela.
- ☑ **Administracja** — etykiety kolorów (klienci, notatki), analityka (rozkład Kanban, klienci, sprzedaż wg klientów),
  podpis w mailach, ustawienia kampanii.

### Później
- ☐ Opisy „działa, gdy…” dla modułów innych niż Kampanie (patrz uwaga na górze).
- ☐ Obrazek kolażu osadzony w mailu (inline CID) — Outlook blokuje obrazy do kliknięcia „Pokaż obrazy”.
- ☐ Adres wysyłki testowej jako ustawienie w Administracji (dziś stała w kodzie).
- ☐ Kolaż ze zdjęć produktów z katalogu.

### Poza zakresem (świadomie NIE robimy)
- Automatyczna wysyłka maili bez kliknięcia „Wyślij” po podglądzie (niezmiennik — patrz `CLAUDE.md`).
- Moduł „Promocje” — usunięty 2026-09-28, zastąpiony przez Kampanie.
- Role i uprawnienia per użytkownik (na razie dwa konta, pełny dostęp).

## Ekrany
Zakładki w górnym pasku (na telefonie — menu dolne):

| Ekran (zakładka) | Co zawiera | Akcje użytkownika |
|---|---|---|
| Logowanie | przycisk „Zaloguj przez Google” | logowanie kontem z listy dozwolonych |
| Klienci (start) | zadania na dziś i zaległe, lista klientów, wyszukiwarka, filtry | dodaj / edytuj klienta, otwórz kartę, dodaj kontakt, zamówienie, plik, wyślij mail |
| Kalendarz | follow-upy i zdarzenia w układzie kalendarza | dodaj / zakończ zadanie, zapisz wynik rozmowy |
| Kanban | trzy kolumny z kartami | dodaj kartę, przeciągnij, zmień kolor / termin |
| Produkty | katalog produktów ze zdjęciami | dodaj / edytuj / usuń produkt |
| Kampanie (id `promotions`) | lista kampanii, ranking, ustawienia | edytor w 4 krokach, wysyłka, raport, duplikat |
| Szablony maili | lista szablonów, edytor, historia wersji | utwórz, edytuj, wyślij |
| Notatki | lista notatek | dodaj / edytuj / usuń |
| Dostawcy | lista i karta dostawcy, kalkulator HDF, historia zamówień | dodaj dostawcę, kontakt, materiał (ze zdjęciem: plik lub link), plik; wyślij zamówienie / pobierz PDF i oznacz jako wysłane, pobierz PDF z historii, usuń wpis (admin) |
| Archiwum | eksporty danych | pobierz JSON / ZIP / Excel |
| Administracja | etykiety kolorów, analityka, podpis, ustawienia kampanii | edytuj ustawienia |

## Kampanie
Tygodniowa oferta mailowa do wybranych klientów, wysyłana z Gmaila biuro@antyramy.eu.

### Edytor (4 kroki)
1. **Produkty i kolaż** — tytuł oferty; **kolaż** (opcjonalnie); produkty z katalogu (opcjonalnie — tabela w mailu + PDF w załączniku). Można wybrać jedno, drugie, oba albo nic: bez produktów mail idzie bez tabeli i PDF, bez obu — sam tekst.
2. **Treść** — temat, treść z placeholderami `{zwrot|Dzień dobry}`, `{firma}`, `{miasto}`; test A/B; podgląd maila na żywo obok.
3. **Odbiorcy** — filtry (typ, kolor, trasa, województwo, tagi, „od X dni” bez zamówienia / kontaktu / kampanii); wypisani i bez e-maila nie do zaznaczenia; ostrzeżenie o kampanii w ostatnich 7 dniach.
4. **Wysyłka** — podsumowanie i podgląd końcowy dla wybranego odbiorcy; **najpierw „Wyślij test”** (na info@pluszek.pl), potem „Wyślij do N odbiorców”: potwierdzenie, wysyłka partiami po 10 z paskiem postępu; przerwaną można wznowić.

**Wysyłka testowa (obowiązkowa):** mail wygląda dokładnie jak u odbiorcy wybranego w podglądzie (kolaż, tabela, PDF), temat z dopiskiem `[TEST]`; przy teście A/B przychodzą dwa maile (`[TEST A]`, `[TEST B]`). Niczego nie zapisuje w kampanii ani w historii klienta. Przycisk wysyłki do wszystkich jest aktywny dopiero po teście aktualnej wersji — zmiana tytułu, produktów, tematu, treści lub kolażu wymaga nowego testu (zmiana odbiorców nie).

Dodatkowo: szkice, „Duplikuj kampanię”, „Wklej z JSON” (wypełnia formularz, nic nie wysyła), podpis z Administracji, stopka wypisu („odpisz NIE”).

### Kolaż „Oferta tygodnia”
- Przycisk **„Utwórz kolaż”** w kroku 1 → okno z 3 zdjęciami (JPG/PNG, z telefonu lub komputera).
- Układ 1200×800 px: duże zdjęcie po lewej (~60%), dwa mniejsze po prawej, białe odstępy 6 px, zdjęcia przycięte do pól; plakietka **„OFERTA TYGODNIA”** (`#1a56db`, biały Inter Bold) w lewym górnym rogu.
- „Ustaw jako duże” zmienia kolejność; podgląd na żywo pokazuje dokładnie plik, który zostanie zapisany, z rozmiarem w KB i jakością JPG. Cel: ≤ 250 KB; większy plik — żółte ostrzeżenie, zapis nadal możliwy.
- Działa, gdy: kolaż jest w mailu nad treścią (600 px szerokości), a kampania bez kolażu wygląda jak wcześniej. Kolaż nie trafia do PDF.
- „Zmień” / „Usuń” w szkicu; wysłana kampania zachowuje swój kolaż; duplikat dostaje ten sam kolaż.

### Wyniki
- „Sprawdź odpowiedzi” (+ automat codziennie 6:45): odpowiedzi w wątku Gmail oraz odpowiedzi ze zmienionym tematem (nowy wątek, ale `In-Reply-To`/`References` wskazują na nasz mail kampanii), „NIE” = prośba o wypis (oznaczana ręcznie).
- Zamówienia przypisywane do ostatniej kampanii w oknie N dni (domyślnie 14), do potwierdzenia ✓/✕.
- Telefony kontrolne („Utwórz follow-upy”, wynik rozmowy), raport kampanii, ranking z wykresem i wynikiem A/B.

### Poza zakresem (świadomie)
- Obrazek osadzony w mailu (inline CID) — kolaż idzie jako link do pliku na crm.antyramy.eu; możliwe później.
- Automatyczna wysyłka bez kliknięcia „Wyślij”.

## Zamówienia do dostawców
Karta dostawcy → „📦 Surowce i zamówienia”: ilości przy surowcach (nazwa, ilość, jednostka) i uwagi. Dalej **dwie drogi**:
A) **„✉️ Wyślij zamówienie mailem”** — podgląd → „Wyślij” → mail wychodzi z CRM (Gmail) z PDF w załączniku;
B) **„⬇️ Pobierz PDF”** → wysyłasz PDF sam, swoim programem pocztowym → **„✅ Oznacz jako wysłane”**.
Obie drogi zapisują zamówienie w tej samej **Historii zamówień** (z oznaczeniem drogi).

### PDF zamówienia
- Backend (`pdf-lib`, font LiberationSans): pasek i nagłówki `#1a56db`, dane zamawiającego (Pluszek sp. z o.o. / Antyramy,
  ul. Monopolowa 11, 33-100 Tarnów, NIP 993-068-10-97, biuro@antyramy.eu, tel. 500 601 601), dane dostawcy (firma, adres, e-mail),
  data, tabela pozycji (lp., nazwa, ilość, jednostka — bez cen), uwagi.
- „⬇️ Pobierz PDF” można klikać wielokrotnie — nic się nie zapisuje.

### A) Wysyłka z CRM (Gmail)
- Mail z biuro@antyramy.eu na adres z karty dostawcy (backend bierze go z bazy), treść z podglądu (bez cen) + PDF w załączniku;
  mail jest też w „Wysłanych” w Gmailu. Nic nie wychodzi bez kliknięcia „Wyślij” w podglądzie.
- Działa, gdy: po udanej wysyłce powstaje wpis w historii (kopia PDF w `uploads/`, identyfikator Gmail); gdy wysyłka się nie uda — nie powstaje nic.

### B) Wysyłka poza CRM — „Oznacz jako wysłane”
- CRM **nie wysyła** żadnego maila. „✅ Oznacz jako wysłane” jest aktywne dopiero po pobraniu PDF **aktualnego** zamówienia
  (zmiana ilości lub uwag wymaga ponownego pobrania) — dzięki temu zapisana kopia to dokładnie to, co poszło do dostawcy.
- Okno potwierdzenia: data wysyłki (domyślnie dziś, do zmiany; nie z przyszłości), opcjonalna notatka → „Zapisz jako wysłane”.
  Zapis tylko po tym kliknięciu; żadnych automatów.
- Działa, gdy: powstaje wpis w historii z kopią PDF (taką samą jak pobrana), ilości i uwagi się czyszczą.

### Historia zamówień (sekcja w karcie dostawcy)
- Wpis: data wysyłki, data zapisu, kto zapisał, droga (Gmail z CRM / poza CRM), pozycje (nazwa, ilość, jednostka), uwagi, notatka,
  kopia PDF; przy drodze A także adresat, temat, treść maila i identyfikator Gmail. Wartość wg cennika CRM tylko informacyjnie.
- Lista od najnowszych (data wysyłki), klik rozwija szczegóły, **„Pobierz PDF”**. Pusty stan: „Brak wysłanych zamówień”.
- Wpis jest **niezmienny** (bez edycji). Błędny wpis może usunąć tylko **administrator** (konta z `ADMIN_EMAILS` w `.env`
  backendu, domyślnie biuro@antyramy.eu), po potwierdzeniu — razem z kopią PDF i krótkim wpisem w historii kontaktów.
- Każdy wpis dodaje krótki wpis w historii kontaktów dostawcy („📦 Zamówienie …”, aktualizuje „ostatni kontakt”).
- Usunięcie dostawcy kasuje jego historię zamówień i **wszystkie jego pliki** (PDF-y zamówień, cenniki i inne załączniki z karty).
- Mobile-first, czerń/biel + akcent magenta, tryb ciemny.

## Zdjęcia towarów dostawcy
Karta dostawcy → „📦 Surowce i zamówienia”: każdy towar (surowiec) może mieć **jedno** zdjęcie (opcjonalne).
- **Lista towarów:** miniaturka 44 px (zaokrąglona, kadr wypełniony) obok nazwy, ładowana leniwie. Brak zdjęcia albo
  niedziałający link = neutralna ikona. Kliknięcie miniaturki → okno z powiększeniem; zamykanie: ✕, kliknięcie w tło, Esc.
  Na telefonie zdjęcie mieści się w ekranie, tło się nie przewija; po zamknięciu fokus wraca na miniaturkę.
- **Edycja towaru (✎ Edytuj) → sekcja „Zdjęcie”:** „Wgraj zdjęcie” (na telefonie także „📷 Zrób zdjęcie” aparatem),
  pole „Link do zdjęcia” + „Zapisz link”, podgląd bieżącego zdjęcia z „Zmień” i „Usuń” (z potwierdzeniem),
  stan ładowania i czytelny komunikat błędu. Zdjęcie dodaje się do towaru już zapisanego w katalogu.
- **Wgranie pliku:** JPG, PNG, WebP (telefon może dać też HEIC — przeglądarka przerabia na JPG). Przeglądarka zmniejsza
  zdjęcie (dłuższy bok do 1600 px) i robi miniaturę (krótszy bok 160 px), oba jako JPG — jak kolaż, bez bibliotek na serwerze.
  Serwer przyjmuje do 8 MB na plik, sprawdza typ po zawartości (nie po rozszerzeniu) i wymiary, nadaje losową nazwę.
- **Link:** tylko `https://`, poprawny adres bez loginu/hasła. Linku nie pobieramy na serwer — przeglądarka wyświetla go wprost.
- Nowe zdjęcie (plik albo link) **zastępuje** poprzednie; jeśli poprzednie było wgranym plikiem — oba jego pliki znikają z serwera.
  Usunięcie zdjęcia, towaru albo dostawcy też kasuje pliki. Zdjęcia nie trafiają do PDF ani maila zamówienia.
- Działa, gdy: po wgraniu na liście widać miniaturkę, a w `uploads/suppliers/` leżą 2 pliki (zdjęcie + miniatura);
  po zastąpieniu linkiem, usunięciu zdjęcia, towaru lub dostawcy tych plików już nie ma; zapis nazwy lub ceny towaru
  nie zmienia zdjęcia.

## Dane
Firestore (Firebase): `clients` (+ podkolekcja `interactions`), `products`, `followups`, `notes`, `suppliers` (+ `interactions`, `orders`),
`emailTemplates`, `kanbanTasks`, `campaigns`, `settings`; `promotions` zostaje jako kopia sprzed migracji.
Pliki (zdjęcia produktów, dokumenty klientów i dostawców, kolaże) leżą na serwerze w `public_nodejs/public/uploads/`;
zdjęcia towarów dostawców w podkatalogu `uploads/suppliers/`. Katalog uploadów jest poza repo (deploy go pomija).
**Dane osobowe:** osoby kontaktowe, e-maile i telefony klientów oraz treść korespondencji — dostęp tylko dla kont z listy
`ALLOWED_EMAILS`. Klucze (`serviceAccountKey.json`, `.env`, token Gmail) tylko na serwerze i lokalnie, nigdy w repo.
Region bazy Firestore: nie zapisano — do potwierdzenia w konsoli Firebase.

## Wygląd
- Interfejs: czerń/biel, akcent magenta `#FF3D8B`, zaokrąglone karty i przyciski, font Inter; tryb ciemny.
- Maile i PDF: nagłówek niebieski `#1a56db`, Arial; PDF — LiberationSans.

## Wymagania niefunkcjonalne
- Dostęp tylko dla kont z `ALLOWED_EMAILS`; dane osobowe klientów — nie wychodzą poza Firebase, serwer mydevil i Gmail.
- Offline: niewymagany (PWA instaluje się na telefonie, ale dane pobiera z serwera).
- Telefon i komputer (PWA); okno kolażu w jednej kolumnie na wąskim ekranie.
- Hosting mydevil (FreeBSD) — bez bibliotek z natywnymi binarkami (kolaż rysowany w przeglądarce).
