import { Response, NextFunction } from 'express';
import { auth } from '../services/firebase';
import { AuthenticatedRequest } from '../types';

// Lista dozwolonych kont — z .env (ALLOWED_EMAILS, po przecinku), żeby dodanie
// użytkownika nie wymagało zmiany kodu. Bez zmiennej działa dotychczasowa dwójka.
// Kopia po stronie frontu (`frontend/src/hooks/useAuth.ts`) blokuje logowanie od razu,
// ale źródłem prawdy jest ta lista — bez niej żadne API nie odpowie.
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || 'biuro@antyramy.eu,krzysiekgodek@gmail.com')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Brak tokenu autoryzacji' });
    return;
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decoded = await auth.verifyIdToken(token);

    if (!decoded.email || !ALLOWED_EMAILS.includes(decoded.email.toLowerCase())) {
      res.status(403).json({ error: 'Brak dostępu — konto nie jest autoryzowane' });
      return;
    }

    req.user = { uid: decoded.uid, email: decoded.email };
    next();
  } catch {
    res.status(401).json({ error: 'Nieprawidłowy lub wygasły token' });
  }
};
