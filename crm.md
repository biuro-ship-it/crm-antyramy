# CRM Antyramy — Dokumentacja projektu

## Cel aplikacji

CRM do zarządzania relacjami z klientami firmy **Antyramy** (ramy i antyramy / picture frames). Umożliwia prowadzenie bazy firm, historii kontaktów, planowania zadań i katalogu produktów.

---

## Dostęp i autoryzacja

- Logowanie wyłącznie przez **Google Sign-In** (Firebase Auth)
- Dozwolone konta:
  - `biuro@antyramy.eu` (konto główne)
  - `krzysiekgodek@gmail.com` (konto zapasowe)
- Whitelist egzekwowana zarówno na frontendzie (`useAuth.ts`) jak i backendzie (`middleware/auth.ts`)

---

## Adresy

| Środowisko | URL |
|-----------|-----|
| Frontend (produkcja) | https://crm.antyramy.eu |
| Frontend (dev) | http://localhost:5174 |
| Backend (produkcja) | https://api.crm.antyramy.eu (mydevil.net) |
| Backend (dev) | http://localhost:4000 |

---

## Stack technologiczny

### Frontend

| Technologia | Wersja | Rola |
|------------|--------|------|
| React | 18 | UI framework |
| TypeScript | 5 | Typowanie |
| Vite | 5 | Bundler + dev server |
| Tailwind CSS | 3 | Stylowanie |
| Firebase SDK | 10 | Auth + Firestore + Storage |
| vite-plugin-pwa | — | PWA (instalacja na telefonie) |

### Backend

| Technologia | Wersja | Rola |
|------------|--------|------|
| Node.js | 20+ | Runtime |
| Express | 4 | HTTP server |
| TypeScript | 5 | Typowanie |
| Firebase Admin SDK | 12 | Firestore + Auth weryfikacja JWT |
| Zod | 3 | Walidacja danych wejściowych |
| Helmet | 7 | Nagłówki bezpieczeństwa |
| express-rate-limit | 7 | Limit zapytań (300/15min) |
| CORS | 2 | Cross-origin (tylko crm.antyramy.eu) |

### Hosting

| Warstwa | Platforma |
|--------|-----------|
| Frontend (statyczne pliki) | mydevil.net → `public_html/` |
| Backend (Node.js) | mydevil.net → `public_nodejs/` |
| Baza danych | Firebase Firestore |
| Pliki (zdjęcia produktów) | Firebase Storage |
| Autoryzacja | Firebase Authentication |

---

## Struktura plików projektu

```
app-crm-antyramy/
│
├── frontend/
│   ├── index.html
│   ├── vite.config.ts              # port 5174, PWA config
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── .env.example                # klucze Firebase (bez wartości)
│   └── src/
│       ├── main.tsx                # punkt wejścia, Root component
│       ├── index.css               # @tailwind base/components/utilities
│       ├── vite-env.d.ts
│       │
│       ├── services/
│       │   ├── firebase.ts         # inicjalizacja Firebase (czyta z .env)
│       │   └── api.ts              # wszystkie wywołania REST API + typy TS
│       │
│       ├── hooks/
│       │   ├── useAuth.ts          # logowanie Google + whitelist emaili
│       │   └── useClients.ts       # CRUD klientów (state + fetch)
│       │
│       ├── components/
│       │   ├── LoginPage.tsx       # ekran logowania Google
│       │   ├── ClientForm.tsx      # formularz dodawania/edycji klienta
│       │   ├── ClientList.tsx      # tabela klientów z filtrowaniem
│       │   ├── ClientCard.tsx      # karta klienta (historia, follow-upy, mail)
│       │   └── ProductsPanel.tsx   # zarządzanie katalogiem produktów
│       │
│       └── pages/
│           └── Dashboard.tsx       # główny widok (nawigacja, statystyki, treść)
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── src/
│       ├── index.ts                # Express app, CORS, rate limit, routy
│       │
│       ├── types/
│       │   └── index.ts            # interfejsy TS (Client, Interaction, Product, FollowUp)
│       │
│       ├── services/
│       │   ├── firebase.ts         # Admin SDK init z serviceAccountKey.json
│       │   └── products.ts         # logika CRUD produktów (Firestore)
│       │
│       ├── middleware/
│       │   └── auth.ts             # weryfikacja Firebase JWT + whitelist emaili
│       │
│       └── routes/
│           ├── clients.ts          # /api/clients (CRUD + interakcje)
│           ├── products.ts         # /api/products (CRUD)
│           └── followups.ts        # /api/followups (zadania/remindery)
│
├── .gitignore                      # ignoruje .env, serviceAccountKey.json, node_modules, dist
├── README.md                       # instrukcja uruchomienia
└── crm.md                          # ten plik — dokumentacja projektu
```

---

## Funkcjonalności

### Klienci
- Lista wszystkich firm z wyszukiwarką i filtrowaniem
- Dodawanie nowego klienta (nazwa, typ: hurt/sklep, osoba kontaktowa, email, telefon, adres z miastem, województwem, kodem pocztowym)
- Edycja danych klienta
- Usuwanie klienta
- Statystyki na dashboardzie: liczba firm, zadania, aktywni w ostatnich 30 dniach

### Karta klienta
- Pełna historia kontaktów (rozmowy telefoniczne, maile, spotkania, inne)
- Dodawanie nowego wpisu z notatką, notatką handlową i wyborem produktów
- **Edycja istniejących notatek** z historii
- Każdy wpis może mieć powiązanie z produktami z katalogu

### Follow-upy / Zadania
- Planowanie kolejnego kontaktu z datą i opisem (przy dodawaniu lub edycji notatki)
- Dashboard pokazuje zadania na dziś + zaległe
- Oznaczanie zadania jako zrealizowane jednym kliknięciem

### Produkty
- Katalog produktów: nazwa, kod produktu, cena netto, zdjęcie
- Zdjęcia uploadowane bezpośrednio do Firebase Storage
- Dodawanie, edycja, usuwanie produktów

### Wysyłka oferty mailem
- Z karty klienta: wybór produktów z katalogu (z podglądem zdjęcia i ceną)
- Podgląd i edycja treści emaila przed wysyłką
- Wysyłka przez domyślny klient pocztowy (`mailto:`)
- Email zawiera: nazwy produktów, kody, ceny netto

---

## REST API — endpointy

Wszystkie endpointy wymagają nagłówka `Authorization: Bearer <firebase_id_token>`.

### Klienci

| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/api/clients` | Pobierz wszystkich klientów |
| POST | `/api/clients` | Dodaj klienta |
| PUT | `/api/clients/:id` | Edytuj klienta |
| DELETE | `/api/clients/:id` | Usuń klienta |
| GET | `/api/clients/:id/interactions` | Historia kontaktów |
| POST | `/api/clients/:id/interactions` | Dodaj kontakt |
| PUT | `/api/clients/:id/interactions/:iid` | Edytuj kontakt |

### Produkty

| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/api/products` | Lista produktów |
| POST | `/api/products` | Dodaj produkt |
| PUT | `/api/products/:id` | Edytuj produkt |
| DELETE | `/api/products/:id` | Usuń produkt |

### Follow-upy

| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/api/followups/summary` | Zadania na dziś i zaległe |
| POST | `/api/followups/client/:clientId` | Utwórz reminder |
| PATCH | `/api/followups/:id/status` | Zmień status (zrealizowane/przesunięte) |

---

## Modele danych (Firestore)

### Kolekcja `clients`
```
companyName: string
type: 'hurt' | 'sklep'
contactPerson: string
email: string
phone: string
address: {
  province: string
  zipCode: string
  city: string
  street: string
  number: string
}
lastContactAt: string | null   // ISO date, aktualizuje się przy nowym kontakcie
createdAt: string
updatedAt: string
```

### Subkolekcja `clients/{id}/interactions`
```
contactDate: string            // ISO date
channel: 'telefon' | 'mail' | 'spotkanie' | 'inne'
notes: string                  // notatka z rozmowy
tradeNotes?: string            // notatka handlowa
products?: string[]            // lista id produktów
createdBy: string              // email użytkownika
createdAt: string
updatedAt?: string             // jeśli edytowane
updatedBy?: string
```

### Kolekcja `products`
```
name: string
code: string                   // kod produktu
priceNetto: number
imageUrl: string               // URL z Firebase Storage
createdAt: string
updatedAt: string
```

### Kolekcja `followups`
```
clientId: string
clientName: string
dueDate: string                // ISO date (YYYY-MM-DD)
reminderText: string
status: 'zaplanowane' | 'zrealizowane' | 'przesunięte'
createdAt: string
completedAt?: string
```

---

## Zmienne środowiskowe

### Frontend (`frontend/.env`)
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_API_URL=https://api.crm.antyramy.eu
```

### Backend (`backend/.env`)
```
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
PORT=4000
FRONTEND_URL=https://crm.antyramy.eu
```

---

## Instrukcja deploy na mydevil.net

### Backend
```bash
cd backend
npm install
npm run build          # kompiluje TypeScript → dist/
```
Na serwerze w `public_nodejs/` wgrać:
- folder `dist/`
- `package.json`
- `.env` (uzupełniony)
- `serviceAccountKey.json`
- uruchomić: `npm install --production`
- zrestartować: `touch public_nodejs/tmp/restart.txt`

### Frontend
```bash
cd frontend
npm install
npm run build          # generuje dist/
```
Zawartość `dist/` wgrać do `public_html/` na mydevil.net.

---

## Bezpieczeństwo

- Brak żadnych kluczy API w repozytorium (tylko `.env.example` z placeholderami)
- `serviceAccountKey.json` objęty `.gitignore` — nigdy nie trafia do Git
- Backend weryfikuje każde żądanie przez Firebase JWT
- Whitelist emaili na dwóch poziomach (frontend + backend)
- Helmet + rate limiting na backendzie
- CORS tylko dla `crm.antyramy.eu` (+ localhost na dev)
