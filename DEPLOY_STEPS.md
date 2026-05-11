# Instrukcja Deploy CRM Antyramy — Krok po Kroku

## ✅ Co jest już gotowe:
- ✅ Firebase Console skonfigurowany (Auth Google + Firestore)
- ✅ Service Account Key pobrany
- ✅ Klucze Firebase dla frontendu
- ✅ .env pliki z konfiguracją
- ✅ API uploadu zdjęć (max 3MB) — dodane do backendu
- ✅ Struktura projektu kompletna

---

## 📝 KROK 1: Wgranie na GitHub

```bash
cd D:\DEV\APLIKACJE\app-crm-antyramy
git add .
git commit -m "Setup: Firebase auth, Firestore, product upload API (3MB max)"
git push origin main
```

---

## 📦 KROK 2: Instalacja zależności (lokalnie)

### Frontend:
```bash
cd frontend
npm install
npm run dev
```
Otwórz: http://localhost:5174

### Backend:
```bash
cd backend
npm install
npm run dev
```
Backend będzie na: http://localhost:4000

---

## 🧪 KROK 3: Testowanie lokalnie

### Test logowania:
1. Otwórz frontend na http://localhost:5174
2. Kliknij "Zaloguj się przez Google"
3. Zaloguj się jako: `biuro@antyramy.eu` lub `krzysiekgodek@gmail.com`
4. Backend powinien znaleźć użytkownika w whitelist

### Test produktów:
1. Przejdź do **Produkty** w dashboardzie
2. Dodaj nowy produkt: nazwa, kod, cena
3. Upload zdjęcia (max 3MB, JPG/PNG/WebP)
4. Zdjęcie powinno być dostępne pod: `http://localhost:4000/uploads/product-xxx.jpg`

### Test API bezpośrednio:
```bash
# GET produktów
curl http://localhost:4000/api/products \
  -H "Authorization: Bearer <FIREBASE_TOKEN>"

# POST — upload zdjęcia
curl -X POST http://localhost:4000/api/products/upload \
  -H "Authorization: Bearer <FIREBASE_TOKEN>" \
  -F "image=@/path/to/image.jpg"
```

---

## 🚀 KROK 4: Build (przed deployem)

### Frontend:
```bash
cd frontend
npm run build
```
Wynik: `frontend/dist/` — te pliki wgrywasz na mydevil.net

### Backend:
```bash
cd backend
npm run build
```
Wynik: `backend/dist/` — te pliki wgrywasz na mydevil.net

---

## 📡 KROK 5: Deploy na mydevil.net

### Backend (Node.js):

1. Zaloguj się SSH do mydevil.net
2. Stwórz folder dla backend (jeśli nie istnieje):
   ```bash
   mkdir -p ~/public_nodejs
   cd ~/public_nodejs
   ```

3. Wgraj pliki:
   - `dist/` folder
   - `package.json`
   - `.env` (wypełniony)
   - `serviceAccountKey.json`

4. Zainstaluj zależności:
   ```bash
   npm install --production
   ```

5. Zrestartuj Node.js:
   ```bash
   touch tmp/restart.txt
   ```

6. Backend powinien być dostępny na: `https://api.crm.antyramy.eu`

---

### Frontend (Statyczne pliki):

1. SSH do mydevil.net
2. Wczyść stary folder:
   ```bash
   rm -rf ~/public_html/*
   ```

3. Wgraj zawartość `frontend/dist/` do `~/public_html/`

4. Frontend powinien być dostępny na: `https://crm.antyramy.eu`

---

## ✅ Walidacja deploymentu

Otwórz:
- Frontend: https://crm.antyramy.eu
- Health check: https://api.crm.antyramy.eu/health

Powinniśmy zobaczyć:
```json
{
  "status": "ok",
  "app": "CRM Antyramy",
  "timestamp": "2026-05-11T18:45:00.000Z"
}
```

---

## 🔐 Bezpieczeństwo

- ✅ `.env` i `serviceAccountKey.json` są w `.gitignore` (nigdy nie trafiają do Git)
- ✅ Backend weryfikuje Firebase JWT na każde żądanie
- ✅ Whitelist emaili na dwóch poziomach (frontend + backend)
- ✅ CORS tylko dla `crm.antyramy.eu`
- ✅ Rate limiting: 300 requestów / 15 minut
- ✅ Helmet security headers

---

## 📞 Jeśli coś się nie uda:

1. **Błąd logowania** → Sprawdź czy email jest w whitelist w `useAuth.ts` (frontend) i `middleware/auth.ts` (backend)
2. **Błąd uploadu** → Sprawdź czy folder `backend/uploads/` istnieje na serwerze
3. **Firestore error** → Sprawdź czy `serviceAccountKey.json` ma prawidłowe dane
4. **CORS error** → Sprawdź czy `FRONTEND_URL` w `backend/.env` jest prawidłowy

---

**Gotowy do startu?** 🚀
