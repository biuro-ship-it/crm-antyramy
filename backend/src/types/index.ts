import { Request } from 'express';

// Backend trzyma tylko te typy, których realnie używa. Kształt danych klienta,
// dostawcy, notatki, follow-upa i zadania Kanban opisują schematy zod w
// `src/routes/*.ts` (to one walidują wejście) oraz interfejsy w
// `frontend/src/services/api.ts` (to one opisują odpowiedzi API).
// Wcześniej leżały tu ich kopie, nieużywane i rozjeżdżające się z oryginałami.

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email: string;
  };
}

export interface Product {
  id?: string;
  name: string;
  code: string;
  priceNetto: number;
  imageUrl: string;
  createdAt: string;
  updatedAt?: string;
}

export interface EmailTemplateVersion {
  body: string;
  subject: string;
  savedAt: string;
}

export interface EmailTemplate {
  id?: string;
  name: string;
  category: string;
  subject: string;
  body: string;
  currentVersion: number;
  versions: Record<string, EmailTemplateVersion>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
