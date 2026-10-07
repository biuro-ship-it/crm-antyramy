// Kolaż kampanii (heroImageUrl): walidacja adresu i bezpieczne kasowanie pliku.
// Bez Firestore — listę adresów w użyciu dostarcza wywołujący (testy: collageFiles.test.ts).
// Decyzje: DECISIONS.md, „Kolaż z 3 zdjęć do kampanii”, commit 3.
import { promises as fsp } from 'fs';
import * as path from 'path';

// Ten sam katalog co w upload.ts (dist/services/ → ../../public/uploads)
export const UPLOAD_DIR = path.join(__dirname, '../../public/uploads');

export const PUBLIC_HOST = 'crm.antyramy.eu';
const COLLAGE_FILE_RE = /^kolaz-[A-Za-z0-9_-]+\.jpg$/;
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
// Kropki, ukośniki wsteczne i ich zakodowane postacie — odrzucane jeszcze przed parsowaniem URL
const SUSPICIOUS_RE = /\.\.|\\|%2e|%2f|%5c/i;

export const HERO_URL_ERROR = 'Nieprawidłowy adres kolażu — dozwolone tylko pliki kolaz-….jpg wgrane do CRM';

export interface HeroUrlPolicy { allowLocalhost: boolean }

/**
 * Adres z localhost tylko w developmencie: NODE_ENV ≠ production ORAZ żądanie przyszło
 * na lokalny host. Na serwerze żądania mają host crm.antyramy.eu, więc localhost
 * jest odrzucany niezależnie od tego, jak ustawiony jest NODE_ENV.
 */
export const heroUrlPolicy = (requestHostname: string | undefined, nodeEnv = process.env.NODE_ENV): HeroUrlPolicy => ({
  allowLocalhost: nodeEnv !== 'production' && LOCAL_HOSTNAMES.has((requestHostname ?? '').toLowerCase()),
});

/** Nazwa pliku kolażu albo null — tylko `kolaz-[A-Za-z0-9_-]+.jpg`, bez ścieżek. */
export const collageFilename = (name: string): string | null =>
  path.basename(name) === name && path.posix.basename(name) === name && COLLAGE_FILE_RE.test(name) ? name : null;

/** Ostatni człon ścieżki `/uploads/<plik>` dowolnego adresu (porównywanie użycia pliku). */
export const uploadFilenameOf = (url: string | null | undefined): string | null => {
  if (typeof url !== 'string' || !url.trim()) return null;
  try {
    const m = /^\/uploads\/([^/]+)$/.exec(new URL(url.trim(), `https://${PUBLIC_HOST}`).pathname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
};

/** Nazwa pliku kolażu z adresu (do kasowania) albo null. */
export const collageFilenameFromUrl = (url: string | null | undefined): string | null => {
  if (typeof url !== 'string' || SUSPICIOUS_RE.test(url)) return null;
  const name = uploadFilenameOf(url);
  return name ? collageFilename(name) : null;
};

/**
 * Kanoniczny adres kolażu albo null (odrzucony). Dozwolone:
 * - https://crm.antyramy.eu/uploads/kolaz-….jpg (http:// z tego hosta zamieniany na https —
 *   .htaccess i tak przekierowuje na https, a obrazek w mailu ma iść po https),
 * - http://localhost|127.0.0.1|[::1][:port]/uploads/kolaz-….jpg — tylko gdy policy.allowLocalhost.
 * Bez loginu/hasła w URL, zapytania i kotwicy.
 */
export const normalizeHeroImageUrl = (raw: string, policy: HeroUrlPolicy): string | null => {
  const s = raw.trim();
  if (!s || s.length > 500 || SUSPICIOUS_RE.test(s)) return null;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.username || u.password || u.search || u.hash) return null;
  const m = /^\/uploads\/([^/]+)$/.exec(u.pathname);
  const file = m ? collageFilename(m[1]) : null;
  if (!file) return null;

  const host = u.hostname.toLowerCase();
  if (host === PUBLIC_HOST && !u.port && (u.protocol === 'https:' || u.protocol === 'http:')) {
    return `https://${PUBLIC_HOST}/uploads/${file}`;
  }
  if (policy.allowLocalhost && u.protocol === 'http:' && LOCAL_HOSTNAMES.has(host)) {
    return `http://${u.host}/uploads/${file}`;
  }
  return null;
};

export type HeroInput = string | null | undefined;
export type ResolvedHero = { ok: true; value: string | null | undefined } | { ok: false; error: string };

/** Pole z żądania: brak (undefined) = bez zmian, null / '' = usunięcie, tekst = adres po walidacji. */
export const resolveHeroImageInput = (input: HeroInput, policy: HeroUrlPolicy): ResolvedHero => {
  if (input === undefined) return { ok: true, value: undefined };
  if (input === null || input.trim() === '') return { ok: true, value: null };
  const url = normalizeHeroImageUrl(input, policy);
  return url ? { ok: true, value: url } : { ok: false, error: HERO_URL_ERROR };
};

export interface HeroChange {
  set: boolean;              // czy zapisać pole heroImageUrl
  next: string | null;       // wartość po zapisie
  release: string | null;    // poprzedni adres do zwolnienia (plik inny niż nowy)
}

/**
 * Zapis szkicu: `incoming` undefined (stary frontend, zapis z innego kroku) nie rusza kolażu.
 * Zwolnienie starego pliku tylko, gdy nowy wskazuje inny plik (albo kolaż usunięto).
 */
export const planHeroImageChange = (current: string | null | undefined, incoming: string | null | undefined): HeroChange => {
  const cur = current ?? null;
  if (incoming === undefined) return { set: false, next: cur, release: null };
  const changedFile = !!cur && collageFilenameFromUrl(cur) !== collageFilenameFromUrl(incoming);
  return { set: true, next: incoming, release: changedFile ? cur : null };
};

export type ReleaseOutcome = 'deleted' | 'in-use' | 'not-draft' | 'invalid' | 'missing' | 'error';

/**
 * Kasuje plik kolażu, jeśli nikt go już nie używa. Nigdy nie rzuca — błąd kasowania
 * nie może przerwać zapisu kampanii (ostrzeżenie w logu).
 * - ownerStatus ≠ 'draft' → plik zostaje (wysłana / w wysyłce kampania zachowuje kolaż),
 * - `otherUrls()` — heroImageUrl pozostałych kampanii (każdy status) i imageUrl produktów;
 *   porównanie po NAZWIE pliku, nie po pełnym adresie (http/https, localhost).
 */
export const releaseCollageFile = async (opts: {
  url: string | null | undefined;
  ownerStatus: string;
  otherUrls: () => Promise<Array<string | null | undefined>>;
  uploadDir?: string;
}): Promise<ReleaseOutcome> => {
  const { url, ownerStatus, otherUrls, uploadDir = UPLOAD_DIR } = opts;
  if (ownerStatus !== 'draft') return 'not-draft';
  const file = collageFilenameFromUrl(url);
  if (!file) return 'invalid';
  try {
    const others = await otherUrls();
    if (others.some(u => uploadFilenameOf(u) === file)) return 'in-use';
    await fsp.unlink(path.join(uploadDir, file));
    return 'deleted';
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(`[kolaz] plik ${file} już nie istnieje — pomijam`);
      return 'missing';
    }
    console.warn(`[kolaz] nie udało się usunąć ${file}:`, (err as Error).message);
    return 'error';
  }
};
