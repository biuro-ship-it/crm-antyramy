import React, { useEffect, useMemo, useState } from 'react';
import { Client, updateClientMarketing } from '../services/api';

interface ClientMarketingProps {
  client: Client;
  allClients: Client[];
  onClientUpdated?: (c: Client) => void;
}

// Sekcja karty klienta: zwrot do maili ({zwrot}), tagi i wypis z ofert.
// Zapis przez PATCH /marketing — nie rusza reszty danych klienta.
const ClientMarketing: React.FC<ClientMarketingProps> = ({ client, allClients, onClientUpdated }) => {
  const [salutation, setSalutation] = useState(client.salutation ?? '');
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setSalutation(client.salutation ?? ''); }, [client.id, client.salutation]);

  const tags = client.tags ?? [];

  // Podpowiedzi: tagi używane u innych klientów, których ten jeszcze nie ma
  const suggestions = useMemo(() => {
    const all = new Set<string>();
    allClients.forEach(c => (c.tags ?? []).forEach(t => all.add(t)));
    const q = tagInput.trim().toLowerCase();
    return [...all]
      .filter(t => !tags.includes(t) && (!q || t.includes(q)))
      .sort((a, b) => a.localeCompare(b, 'pl'))
      .slice(0, 12);
  }, [allClients, tags, tagInput]);

  const save = async (data: Parameters<typeof updateClientMarketing>[1]) => {
    setSaving(true);
    setError('');
    try {
      const updated = await updateClientMarketing(client.id, data);
      onClientUpdated?.(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase();
    setTagInput('');
    if (!t || tags.includes(t)) return;
    save({ tags: [...tags, t] });
  };

  const removeTag = (t: string) => save({ tags: tags.filter(x => x !== t) });

  const saveSalutation = () => {
    const v = salutation.trim();
    if (v === (client.salutation ?? '')) return;
    save({ salutation: v });
  };

  return (
    <div className="mt-8">
      <h3 className="text-xl font-bold text-ink mb-4">📣 Kampanie</h3>
      <div className="card-padded space-y-5">

        {/* Zwrot */}
        <div>
          <label className="eyebrow block mb-2">Zwrot w mailach</label>
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              value={salutation}
              onChange={e => setSalutation(e.target.value)}
              onBlur={saveSalutation}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              placeholder="np. Panie Marku, Pani Anno"
              maxLength={60}
              className="flex-1 min-w-[200px] border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ink bg-canvas"
            />
          </div>
          <p className="text-xs text-ink font-light mt-1">
            W mailu: <span className="font-semibold">{salutation.trim() || 'Dzień dobry'}</span>
            {!salutation.trim() && ' (brak zwrotu — użyty tekst zastępczy)'}
          </p>
        </div>

        {/* Tagi */}
        <div>
          <label className="eyebrow block mb-2">Tagi</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.length === 0 && <span className="text-xs text-ink font-light">Brak tagów</span>}
            {tags.map(t => (
              <span key={t} className="badge-lilac inline-flex items-center gap-1.5">
                {t}
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  disabled={saving}
                  className="leading-none opacity-60 hover:opacity-100"
                  aria-label={`Usuń tag ${t}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <input
            type="text"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); }
            }}
            placeholder="Dodaj tag i naciśnij Enter (np. ślubne, klasyka, premium)"
            maxLength={40}
            disabled={saving}
            className="w-full border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ink bg-canvas"
          />
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {suggestions.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => addTag(t)}
                  disabled={saving}
                  className="text-xs px-2 py-0.5 rounded-full border border-hairline text-ink font-light hover:bg-surface-soft"
                >
                  + {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Wypis */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={!!client.noMarketing}
            onChange={e => save({ noMarketing: e.target.checked })}
            disabled={saving}
            className="mt-0.5 rounded border-hairline"
          />
          <span className="text-sm text-ink">
            <span className="font-semibold">Nie wysyłaj ofert (wypis)</span>
            <span className="block text-xs font-light">Kampanie pominą tego klienta.</span>
          </span>
        </label>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientMarketing;
