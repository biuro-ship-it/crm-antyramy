import React, { useState } from 'react';
import { downloadArchiveZip } from '../services/api';

// Wymusza pobranie pliku z Bloba.
const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const ITEMS = [
  { icon: '🏢', label: 'Klienci + historia kontaktów (w tym wysłane promocje)' },
  { icon: '🚚', label: 'Dostawcy + historia kontaktów' },
  { icon: '📦', label: 'Produkty' },
  { icon: '✉️', label: 'Szablony maili' },
  { icon: '📝', label: 'Notatki' },
  { icon: '⏰', label: 'Przypomnienia (follow-upy)' },
  { icon: '🖼️', label: 'Zdjęcia produktów (pliki)' },
];

const ArchivePanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const handleDownload = async () => {
    setError(null);
    setLoading(true);
    try {
      const blob = await downloadArchiveZip();
      triggerDownload(blob, `crm-antyramy-backup-${today}.zip`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się pobrać archiwum');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-300">
      <div className="mb-6">
        <h2 className="text-2xl font-extrabold text-slate-900">Archiwum danych</h2>
        <p className="text-slate-500 text-sm mt-1">
          Pobierz kompletną kopię bazy wraz ze zdjęciami na swój komputer — jako zabezpieczenie.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-4">⚠️ {error}</div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 max-w-2xl">
        <p className="text-sm font-bold text-slate-700 mb-3">Kopia (plik ZIP) obejmuje:</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
          {ITEMS.map(it => (
            <li key={it.label} className="flex items-center gap-2 text-sm text-slate-600">
              <span className="text-base">{it.icon}</span> {it.label}
            </li>
          ))}
        </ul>

        <button
          onClick={handleDownload}
          disabled={loading}
          className="w-full bg-slate-900 hover:bg-blue-600 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors"
        >
          {loading ? '⏳ Przygotowuję archiwum...' : '⬇️ Pobierz pełną kopię (ZIP: dane + zdjęcia)'}
        </button>

        <p className="text-xs text-slate-400 mt-4 leading-relaxed">
          ZIP zawiera <code>dane.json</code> (pełny, odtwarzalny zrzut bazy) oraz folder{' '}
          <code>zdjecia/</code> ze wszystkimi plikami zdjęć. Plik zapisuje się jako{' '}
          <code>crm-antyramy-backup-{today}.zip</code>. Przy dużej liczbie zdjęć pobieranie może chwilę potrwać.
        </p>
      </div>
    </div>
  );
};

export default ArchivePanel;
