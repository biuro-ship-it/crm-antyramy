import { Response, NextFunction } from 'express';
import { auth } from '../services/firebase';
import { AuthenticatedRequest } from '../types';

const ALLOWED_EMAILS = ['biuro@antyramy.eu', 'krzysiekgodek@gmail.com'];

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

    if (!decoded.email || !ALLOWED_EMAILS.includes(decoded.email)) {
      res.status(403).json({ error: 'Brak dostępu — konto nie jest autoryzowane' });
      return;
    }

    req.user = { uid: decoded.uid, email: decoded.email };
    next();
  } catch {
    res.status(401).json({ error: 'Nieprawidłowy lub wygasły token' });
  }
};
