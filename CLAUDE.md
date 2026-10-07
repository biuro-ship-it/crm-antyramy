# CRM Antyramy – instrukcja dla Claude

## Co to jest
Wewnętrzny CRM firmy Antyramy (crm.antyramy.eu): klienci, produkty, kampanie mailowe z pomiarem wyników, kalendarz telefonów, notatki, dostawcy, Kanban. Szczegóły: `SPEC.md`.

## ⚠️ Niezmiennik (nigdy nie wolno tego zepsuć)
**Żaden mail nie wychodzi bez kliknięcia „Wyślij” po podglądzie.** Automaty (cron, „Sprawdź odpowiedzi”) tylko czytają i liczą. Wysłana kampania jest niezmienna — razem ze swoim kolażem.

## Przed rozpoczęciem pracy
1. Przeczytaj `HANDOVER.md` – aktualny stan, testy ręczne do zrobienia.
2. Przy większych zmianach sprawdź `DECISIONS.md` (najnowsze wpisy na dole sekcji).
3. Po sesji zaktualizuj `HANDOVER.md`; nową decyzję dopisz do `DECISIONS.md`.

## Stack
- Frontend: React 18 + TypeScript + Vite + Tailwind, PWA (`vite-plugin-pwa`)
- Backend: Node.js + Express (TypeScript), Firebase Admin (Firestore + weryfikacja logowania Google)
- Poczta: Gmail API (wysyłka + odczyt odpowiedzi); PDF: `pdf-lib` + font LiberationSans (polskie znaki)
- Hosting: s61.mydevil.net (FreeBSD, Passenger, `public_nodejs/`); pliki uploadów w `public_nodejs/public/uploads/`

## Struktura folderów
```
frontend/src/components/  – ekrany i okna (Campaign*, CollageDialog, ClientCard, …)
frontend/src/utils/       – czysta logika + testy vitest (filtry kampanii, collage, daty)
frontend/src/services/    – api.ts (wszystkie wywołania backendu), firebase.ts
backend/src/routes/       – trasy /api/* (campaigns, clients, upload, …)
backend/src/services/     – logika bez Express (campaignRender, collageFiles, gmail, pdf, …) + testy node:test
backend/src/scripts/      – skrypty jednorazowe i cron (campaign-daily)
.github/workflows/        – deploy po pushu na main
secret/, dane/            – lokalnie, NIGDY do repo
```

## Komendy
```bash
cd backend  && npm run dev     # API na :4000 (wymaga backend/.env + serviceAccountKey.json)
cd frontend && npm run dev     # :5174
cd backend  && npm test        # node:test (lista plików w package.json → "test")
cd frontend && npm test        # vitest
cd frontend && npm run build   # tsc --noEmit + vite build
```

## Zasady pracy
- Język interfejsu, komentarzy i commitów: polski. Nazwy pól i zmiennych: angielskie.
- **Nie rób `git push` ani deployu** — push na `main` = automatyczny deploy (GitHub Actions); robi go Krzysiek. Commity lokalne są OK.
- **Kampanie, nie Promocje** — moduł Promocje usunięty 2026-09-28 (zakładka ma id `promotions`, ale nazywa się „Kampanie”).
- **Kolaże i uploady testuj na produkcji** — upload zwraca adres hosta, na który poszło żądanie; plik wgrany lokalnie leży na lokalnym dysku i nie wyświetli się w mailu.
- Nowy plik testów backendu dopisz do skryptu `test` w `backend/package.json`.
- Czyste funkcje wydzielaj do `services/` / `utils/` i testuj; trasy importują Firestore (testy bez bazy ich nie załadują).
- Usunięcie rekordu z plikiem → sprzątanie pliku (`deleteUpload`; kolaże: `releaseCollageFile` sprawdza współdzielenie).
- Sekrety tylko w `.env` / `secret/`. Kolory interfejsu: czerń + akcent magenta (`accent-magenta`); maile/PDF: niebieski `#1a56db`.

## Deploy
Push na `main` → GitHub Actions (testy, build, rsync na s61, restart). Alternatywa: lokalny `deploy.bat`. Weryfikacja: `https://crm.antyramy.eu/health`.
