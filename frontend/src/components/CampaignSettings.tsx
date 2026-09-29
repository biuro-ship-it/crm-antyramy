import { useEffect, useState } from 'react';
import { getCampaignSettings, saveCampaignSettings } from '../services/api';

// Sekcja Administracji: okno przypisania zamówień do kampanii (dni po wysyłce).
export default function CampaignSettings() {
  const [days, setDays] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getCampaignSettings()
      .then(s => setDays(String(s.attributionDays)))
      .catch(e => setError((e as Error).message));
  }, []);

  const handleSave = async () => {
    const n = parseInt(days, 10);
    if (!Number.isFinite(n) || n < 1 || n > 90) { setError('Podaj liczbę dni od 1 do 90.'); return; }
    setSaving(true);
    setError('');
    try {
      const s = await saveCampaignSettings(n);
      setDays(String(s.attributionDays));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card-padded space-y-4">
      <h2 className="section-title">Kampanie</h2>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="attribution-days" className="text-sm text-ink">Okno przypisania zamówień do kampanii</label>
        <input
          id="attribution-days"
          type="number"
          min={1}
          max={90}
          value={days}
          onChange={e => setDays(e.target.value)}
          className="w-20 border border-hairline rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ink bg-canvas"
        />
        <span className="text-sm text-ink">dni po wysyłce</span>
        <button onClick={handleSave} disabled={saving || !days} className="btn-primary px-6 disabled:opacity-50">
          {saving ? 'Zapisywanie...' : 'Zapisz'}
        </button>
        {saved && <span className="text-sm text-success font-medium">✓ Zapisano</span>}
      </div>
      <p className="text-sm text-ink opacity-60">
        Zamówienie klienta w tym oknie po kampanii liczy się jako „prawdopodobnie z kampanii” (do potwierdzenia w raporcie).
        Zmiana działa od następnego przeliczenia zamówień.
      </p>
      {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    </section>
  );
}
