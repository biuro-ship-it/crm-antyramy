import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

import clientsRouter from './routes/clients';
import productsRouter from './routes/products';
import followupsRouter from './routes/followups';
import uploadRouter from './routes/upload';

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://crm.antyramy.eu';

// Zaufaj proxy (Phusion Passenger na mydevil.net)
app.set('trust proxy', 1);

// Bezpieczeństwo (COOP ustawione na unsafe-none — wymagane dla Google Sign-In popup)
app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'unsafe-none' },
}));

// CORS
app.use(cors({
  origin: [
    FRONTEND_URL,
    'https://crm.antyramy.eu',
    'http://crm.antyramy.eu',
    'http://localhost:5174',
    'http://localhost:5173',
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minut
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // Passenger ustawia ten nagłówek — wyłączamy walidację
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '5mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'CRM Antyramy', timestamp: new Date().toISOString() });
});

// Routy
app.use('/api/clients', clientsRouter);
app.use('/api/products', productsRouter);
app.use('/api/followups', followupsRouter);
app.use('/api/upload', uploadRouter);

// Obsługa SPA — wszystkie nieznane ścieżki zwracają index.html
// (działa tylko lokalnie; na serwerze Passenger obsługuje to statycznie)
import path from 'path';
import fs from 'fs';
const frontendIndex = path.join(__dirname, '../public/index.html');
app.use((req, res) => {
  if (!req.path.startsWith('/api') && fs.existsSync(frontendIndex)) {
    res.sendFile(frontendIndex);
  } else {
    res.status(404).json({ error: 'Nie znaleziono zasobu' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ CRM Antyramy backend działa na porcie ${PORT}`);
});

export default app;
