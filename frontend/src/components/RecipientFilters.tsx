import React, { useMemo, useState } from 'react';
import { Client } from '../services/api';
import { RecipientFilter, EMPTY_FILTER } from '../utils/campaignFilters';

interface RecipientFiltersProps {
  filter: RecipientFilter;
  onChange: (f: RecipientFilter) => void;
  clients: Client[];
  colorLabels: Record<string, string>;
}

const TYPES = ['zakład', 'sklep', 'agencja', 'inne'];

const COLORS: { id: string; bg: string; name: string }[] = [
  { id: 'default', bg: 'bg-canvas border border-hairline', name: 'Brak' },
  { id: 'lilac', bg: 'bg-block-lilac', name: 'Fiolet' },
  { id: 'cream', bg: 'bg-block-cream', name: 'Krem' },
  { id: 'pink', bg: 'bg-block-gray', name: 'Szary' },
  { id: 'mint', bg: 'bg-block-mint', name: 'Mięta' },
];

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-xs px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1.5 ${
      active ? 'bg-primary text-on-primary border-transparent' : 'border-hairline text-ink hover:bg-surface-soft'
    }`}
  >
    {children}
  </button>
);

const DaysInput: React.FC<{ label: string; value: number | null; onChange: (v: number | null) => void }> = ({ label, value, onChange }) => (
  <label className="flex items-center gap-2 text-xs text-ink">
    <span className="font-light">{label}</span>
    <input
      type="number"
      min={1}
      value={value ?? ''}
      onChange={e => {
        const n = parseInt(e.target.value, 10);
        onChange(Number.isFinite(n) && n > 0 ? n : null);
      }}
      placeholder="—"
      className="w-16 border border-hairline rounded-md px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ink bg-canvas"
    />
    <span className="font-light">dni</span>
  </label>
);

// Filtry kroku „Odbiorcy”. Listy działają jako „dowolny z”; puste = bez ograniczenia.
const RecipientFilters: React.FC<RecipientFiltersProps> = ({ filter, onChange, clients, colorLabels }) => {
  const [expanded, setExpanded] = useState(false);

  const { routes, provinces, tags } = useMemo(() => {
    const r = new Set<string>(), p = new Set<string>(), t = new Set<string>();
    clients.forEach(c => {
      if (c.route) r.add(c.route);
      if (c.address?.province) p.add(c.address.province);
      (c.tags ?? []).forEach(x => t.add(x));
    });
    const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, 'pl'));
    return { routes: sort(r), provinces: sort(p), tags: sort(t) };
  }, [clients]);

  const set = <K extends keyof RecipientFilter>(k: K, v: RecipientFilter[K]) => onChange({ ...filter, [k]: v });

  const advancedCount =
    filter.colors.length + filter.routes.length + filter.provinces.length + filter.tags.length +
    (filter.noOrderDays !== null ? 1 : 0) + (filter.noContactDays !== null ? 1 : 0) + (filter.noCampaignDays !== null ? 1 : 0);
  const anyActive = advancedCount > 0 || filter.types.length > 0 || filter.search.trim() !== '';

  return (
    <div className="bg-surface-soft border border-hairline rounded-xl p-4 mb-4 space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Szukaj po nazwie, mieście, e-mailu..."
          value={filter.search}
          onChange={e => set('search', e.target.value)}
          className="flex-1 min-w-[200px] border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ink bg-canvas"
        />
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map(t => (
            <Chip key={t} active={filter.types.includes(t)} onClick={() => set('types', toggle(filter.types, t))}>{t}</Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <button type="button" onClick={() => setExpanded(e => !e)} className="text-xs font-semibold text-ink hover:underline">
          {expanded ? '▾ Mniej filtrów' : `▸ Więcej filtrów${advancedCount ? ` (${advancedCount})` : ''}`}
        </button>
        {anyActive && (
          <button type="button" onClick={() => onChange(EMPTY_FILTER)} className="text-xs text-ink font-light hover:underline">
            Wyczyść filtry
          </button>
        )}
      </div>

      {expanded && (
        <div className="space-y-3 pt-1">
          <div>
            <p className="eyebrow mb-1.5">Kolor relacji</p>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map(c => (
                <Chip key={c.id} active={filter.colors.includes(c.id)} onClick={() => set('colors', toggle(filter.colors, c.id))}>
                  <span className={`w-3 h-3 rounded-full ${c.bg}`} />
                  {colorLabels[c.id] || c.name}
                </Chip>
              ))}
            </div>
          </div>

          {routes.length > 0 && (
            <div>
              <p className="eyebrow mb-1.5">Trasa</p>
              <div className="flex flex-wrap gap-1.5">
                {routes.map(r => (
                  <Chip key={r} active={filter.routes.includes(r)} onClick={() => set('routes', toggle(filter.routes, r))}>🚚 {r}</Chip>
                ))}
              </div>
            </div>
          )}

          {provinces.length > 0 && (
            <div>
              <p className="eyebrow mb-1.5">Województwo</p>
              <div className="flex flex-wrap gap-1.5">
                {provinces.map(p => (
                  <Chip key={p} active={filter.provinces.includes(p)} onClick={() => set('provinces', toggle(filter.provinces, p))}>{p}</Chip>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="eyebrow mb-1.5">Tagi</p>
            {tags.length === 0 ? (
              <p className="text-xs text-ink font-light">Brak tagów — dodaje się je na karcie klienta.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tags.map(t => (
                  <Chip key={t} active={filter.tags.includes(t)} onClick={() => set('tags', toggle(filter.tags, t))}>{t}</Chip>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <DaysInput label="Brak zamówienia od" value={filter.noOrderDays} onChange={v => set('noOrderDays', v)} />
            <DaysInput label="Brak kontaktu od" value={filter.noContactDays} onChange={v => set('noContactDays', v)} />
            <DaysInput label="Nie dostał kampanii od" value={filter.noCampaignDays} onChange={v => set('noCampaignDays', v)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default RecipientFilters;
