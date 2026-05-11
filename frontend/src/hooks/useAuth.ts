import { useState, useEffect } from 'react';
import {
  User,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth, googleProvider } from '../services/firebase';

// Dozwolone adresy e-mail — tylko te konta mają dostęp
const ALLOWED_EMAILS = [
  'biuro@antyramy.eu',
  'krzysiekgodek@gmail.com',
];

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u && u.email && !ALLOWED_EMAILS.includes(u.email.toLowerCase())) {
        await firebaseSignOut(auth);
        setUser(null);
        setError('To konto nie ma dostępu do aplikacji.');
      } else {
        setUser(u);
        setError(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async () => {
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email?.toLowerCase();
      if (!email || !ALLOWED_EMAILS.includes(email)) {
        await firebaseSignOut(auth);
        setError('To konto nie ma dostępu do aplikacji. Dozwolone są tylko autoryzowane adresy e-mail.');
        return;
      }
    } catch (err) {
      setError('Błąd logowania. Spróbuj ponownie.');
      console.error(err);
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return { user, loading, error, signIn, signOut };
}
