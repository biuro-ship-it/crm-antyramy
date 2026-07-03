import React from 'react';
import type { Theme } from '../hooks/useTheme';

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
  /** 'icon' — kompaktowy przycisk w pasku; 'full' — szeroki wiersz w menu mobilnym. */
  variant?: 'icon' | 'full';
}

const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onToggle, variant = 'icon' }) => {
  const isDark = theme === 'dark';
  const label = isDark ? 'Włącz tryb jasny' : 'Włącz tryb ciemny';

  if (variant === 'full') {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={isDark}
        className="flex items-center justify-between w-full px-4 py-3 rounded-xl text-sm font-medium text-ink hover:bg-surface-soft transition"
      >
        <span>{isDark ? 'Tryb jasny' : 'Tryb ciemny'}</span>
        <span className="text-ink">{isDark ? <SunIcon /> : <MoonIcon />}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      aria-pressed={isDark}
      className="grid place-items-center h-9 w-9 rounded-lg text-ink hover:bg-surface-soft transition"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
};

export default ThemeToggle;
