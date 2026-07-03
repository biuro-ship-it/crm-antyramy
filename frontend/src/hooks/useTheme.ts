import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'crm-theme';
const THEME_COLOR = { light: '#ffffff', dark: '#17171b' };

/** Odczyt zapisanego motywu (tryb wyłącznie ręczny — domyślnie jasny). */
function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Nakłada motyw na <html>: klasa .dark, color-scheme oraz meta theme-color. */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
}

/**
 * Zarządza motywem jasny/ciemny z zapisem w localStorage.
 * Klasa .dark jest wstępnie ustawiana skryptem inline w index.html (anti-flash).
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  const setTheme = useCallback((next: Theme) => {
    // Krótka animacja przejścia tylko przy świadomej zmianie przez użytkownika.
    const root = document.documentElement;
    root.classList.add('theme-anim');
    window.setTimeout(() => root.classList.remove('theme-anim'), 250);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* brak dostępu do localStorage — pomijamy zapis */
    }
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(getStoredTheme() === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  // Synchronizacja stanu ze stanem DOM ustawionym przez skrypt inline.
  useEffect(() => {
    applyTheme(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { theme, toggle, setTheme };
}
