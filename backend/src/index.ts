import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

import clientsRouter from './routes/clients';
import productsRouter from './routes/products';
import followupsRouter from './routes/followups';

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://crm.antyramy.eu';

// Bezpieczeństwo
app.use(helmet());

// CORS
app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:5174', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minut
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
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

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Nie znaleziono zasobu' });
});

app.listen(PORT, () => {
  console.log(`✅ CRM Antyramy backend działa na porcie ${PORT}`);
});

export default app;
