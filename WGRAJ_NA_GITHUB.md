# 📤 Co wgrać na GitHub

## Pliki które WGRYWASZ:
```
app-crm-antyramy/
├── .gitignore (zaktualizowany)
├── README.md
├── crm.md
├── DEPLOY_STEPS.md
├── frontend/
│   ├── .env ✅ (NEW — wygenerowany z kluczami Firebase)
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── src/
│       ├── main.tsx
│       ├── index.css
│       ├── vite-env.d.ts
│       ├── services/
│       │   ├── firebase.ts
│       │   └── api.ts
│       ├── hooks/
│       │   ├── useAuth.ts
│       │   └── useClients.ts
│       ├── components/
│       │   ├── LoginPage.tsx
│       │   ├── ClientForm.tsx
│       │   ├── ClientList.tsx
│       │   ├── ClientCard.tsx
│       │   └── ProductsPanel.tsx
│       └── pages/
│           └── Dashboard.tsx
├── backend/
│   ├── .env ✅ (NEW — z ścieżką do serviceAccountKey.json)
│   ├── package.json ✅ (UPDATED — dodany multer)
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts ✅ (UPDATED — serwowanie /uploads)
│       ├── types/
│       │   └── index.ts
│       ├── services/
│       │   ├── firebase.ts
│       │   ├── products.ts
│       │   └── upload.ts ✅ (NEW — obsługa usuwania plików)
│       ├── middleware/
│       │   └── auth.ts
│       └── routes/
│           ├── clients.ts
│           ├── products.ts ✅ (UPDATED — upload zdjęć)
│           └── followups.ts
```

## Pliki które IGNORUJESZ (w .gitignore):
```
❌ backend/.env (lokalna kopia)
❌ backend/serviceAccountKey.json (wrażliwe dane!)
❌ backend/uploads/ (folder z wgranymi zdjęciami)
❌ node_modules/
❌ frontend/dist/
❌ backend/dist/
```

## Kroki do wgrania:

```bash
# 1. Skopiuj wszystkie pliki z /home/claude do twojego D:\DEV\APLIKACJE\app-crm-antyramy

# 2. Sprawdź status
cd D:\DEV\APLIKACJE\app-crm-antyramy
git status

# 3. Dodaj wszystko
git add .

# 4. Commit z sensownym komunikatem
git commit -m "Setup: Firebase auth + Firestore + Product upload API (3MB max, JPG/PNG/WebP)"

# 5. Push na GitHub
git push origin main
```

## Ważne: Service Account Key

⚠️ UWAGA: Plik `backend/serviceAccountKey.json` NIGDY nie trafia do GitHub!

Twoja kopia jest tutaj:
📁 `D:\DEV\APLIKACJE\app-crm-antyramy\backend\serviceAccountKey.json`

Gdy będziesz deployować na mydevil.net, musisz go wgrać oddzielnie (przez SFTP lub scp).

