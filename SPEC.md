# CRM Antyramy – specyfikacja

> Na razie opisany tylko moduł **Kampanie** (z kolażem). Pozostałe moduły (klienci, produkty, kalendarz,
> notatki, dostawcy, Kanban, archiwum) — do uzupełnienia; szczegóły kampanii: `HANDOVER.md`, `DECISIONS.md`.

## Cel
Wewnętrzny CRM firmy Antyramy: baza klientów (zakłady, sklepy, agencje), katalog produktów i oferty mailowe
do klientów z mierzeniem, co przyniosły.

## Użytkownicy
- **Krzysiek i biuro** — konta Google z listy `ALLOWED_EMAILS`; pracują na komputerze i telefonie (PWA).

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
- „Sprawdź odpowiedzi” (+ automat codziennie 6:45): odpowiedzi w wątku Gmail, „NIE” = prośba o wypis (oznaczana ręcznie).
- Zamówienia przypisywane do ostatniej kampanii w oknie N dni (domyślnie 14), do potwierdzenia ✓/✕.
- Telefony kontrolne („Utwórz follow-upy”, wynik rozmowy), raport kampanii, ranking z wykresem i wynikiem A/B.

### Poza zakresem (świadomie)
- Obrazek osadzony w mailu (inline CID) — kolaż idzie jako link do pliku na crm.antyramy.eu; możliwe później.
- Automatyczna wysyłka bez kliknięcia „Wyślij”.

## Wygląd
- Interfejs: czerń/biel, akcent magenta `#FF3D8B`, zaokrąglone karty i przyciski, font Inter; tryb ciemny.
- Maile i PDF: nagłówek niebieski `#1a56db`, Arial; PDF — LiberationSans.

## Wymagania niefunkcjonalne
- Telefon i komputer (PWA); okno kolażu w jednej kolumnie na wąskim ekranie.
- Hosting mydevil (FreeBSD) — bez bibliotek z natywnymi binarkami (kolaż rysowany w przeglądarce).
