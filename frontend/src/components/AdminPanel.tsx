import { useEffect, useState } from 'react';
import {
  getColorLabels, saveColorLabels, ColorLabels,
  getClients, getFollowUpSummary, getKanbanTasks,
  Client, FollowUp, KanbanTask,
} from '../services/api';

const CLIENT_COLORS: { id: keyof ColorLabels['clients']; bg: string; name: string }[] = [
  { id: 'default', bg: 'bg-canvas border border-hairline', name: 'Biały' },
  { id: 'lilac',   bg: 'bg-block-lilac',                  name: 'Fioletowy' },
  { id: 'cream',   bg: 'bg-block-cream',                  name: 'Kremowy' },
  { id: 'pink',    bg: 'bg-block-pink',                   name: 'Różowy' },
  { id: 'mint',    bg: 'bg-block-mint',                   name: 'Miętowy' },
];

const NOTE_COLORS: { id: keyof ColorLabels['notes']; bg: string; name: string }[] = [
  { id: 'default', bg: 'bg-canvas border border-hairline', name: 'Biały' },
  { id: 'blue',    bg: 'bg-block-lilac',                   name: 'Niebieski' },
  { id: 'yellow',  bg: 'bg-block-cream',                   name: 'Żółty' },
  { id: 'red',     bg: 'bg-block-pink',                    name: 'Czerwony' },
  { id: 'green',   bg: 'bg-block-mint',                    name: 'Zielony' },
];

const emptyLabels = (): ColorLabels => ({
  clients: { default: '', lilac: '', cream: '', pink: '', mint: '' },
  notes:   { default: '', blue: '', yellow: '', red: '', green: '' },
});

export default function AdminPanel() {
  const [labels, setLabels] = useState<ColorLabels>(emptyLabels());
  const [labelsLoading, setLabelsLoading] = useState(true);
  const [labelsSaving, setLabelsSaving] = useState(false);
  const [labelsSaved, setLabelsSaved] = useState(false);

  const [clients, setClients] = useState<Client[]>([]);
  const [tasks, setTasks] = useState<FollowUp[]>([]);
  const [kanban, setKanban] = useState<KanbanTask[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    getColorLabels()
      .then(setLabels)
      .catch(() => {})
      .finally(() => setLabelsLoading(false));

    Promise.all([getClients(), getFollowUpSummary(), getKanbanTasks()])
      .then(([c, f, k]) => { setClients(c); setTasks(f); setKanban(k); })
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, []);

  const handleSave = async () => {
    try {
      setLabelsSaving(true);
      await saveColorLabels(labels);
      setLabelsSaved(true);
      setTimeout(() => setLabelsSaved(false), 2500);
    } catch {
      alert('Błąd zapisu etykiet.');
    } finally {
      setLabelsSaving(false);
    }
  };

  // Analityka
  const colorCount = clients.reduce<Record<string, number>>((acc, c) => {
    const k = c.relationshipColor || 'default';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const routeCount = clients.reduce<Record<string, number>>((acc, c) => {
    const k = c.route?.trim() || '(brak trasy)';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const topRoutes = Object.entries(routeCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const kanbanCols = { todo: 0, doing: 0, done: 0 };
  kanban.forEach(t => { kanbanCols[t.column] = (kanbanCols[t.column] || 0) + 1; });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="page-title">Administracja</h1>
        <p className="text-body-sm font-light mt-2">Etykiety kolorów i analityka systemu</p>
      </div>

      {/* ── ETYKIETY KOLORÓW ── */}
      <section className="card-padded space-y-6">
        <h2 className="section-title">Etykiety kolorów</h2>
        <p className="text-sm text-ink opacity-60">
          Nadaj znaczenie każdemu kolorowi — etykieta pojawi się jako podpowiedź przy wyborze koloru.
        </p>

        {labelsLoading ? (
          <p className="text-sm text-ink opacity-50">Ładowanie...</p>
        ) : (
          <>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink opacity-60 mb-3">Klienci</h3>
              <div className="space-y-2">
                {CLIENT_COLORS.map(c => (
                  <div key={c.id} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full shrink-0 ${c.bg}`} />
                    <span className="text-sm text-ink opacity-60 w-20 shrink-0">{c.name}</span>
                    <input
                      type="text"
                      maxLength={40}
                      placeholder={`Etykieta dla ${c.name.toLowerCase()}...`}
                      value={labels.clients[c.id]}
                      onChange={e => setLabels(l => ({
                        ...l,
                        clients: { ...l.clients, [c.id]: e.target.value },
                      }))}
                      className="flex-1 border border-hairline rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ink bg-canvas"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink opacity-60 mb-3">Notatki</h3>
              <div className="space-y-2">
                {NOTE_COLORS.map(c => (
                  <div key={c.id} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full shrink-0 ${c.bg}`} />
                    <span className="text-sm text-ink opacity-60 w-20 shrink-0">{c.name}</span>
                    <input
                      type="text"
                      maxLength={40}
                      placeholder={`Etykieta dla ${c.name.toLowerCase()}...`}
                      value={labels.notes[c.id]}
                      onChange={e => setLabels(l => ({
                        ...l,
                        notes: { ...l.notes, [c.id]: e.target.value },
                      }))}
                      className="flex-1 border border-hairline rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ink bg-canvas"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={labelsSaving}
                className="btn-primary px-8 disabled:opacity-50"
              >
                {labelsSaving ? 'Zapisywanie...' : 'Zapisz etykiety'}
              </button>
              {labelsSaved && (
                <span className="text-sm text-success font-medium">✓ Zapisano</span>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── ANALITYKA ── */}
      <section className="card-padded space-y-6">
        <h2 className="section-title">Analityka</h2>

        {statsLoading ? (
          <p className="text-sm text-ink opacity-50">Ładowanie danych...</p>
        ) : (
          <>
            {/* Karty statystyk */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="color-block-lime flex flex-col items-center py-4 rounded-xl">
                <span className="text-3xl font-bold text-ink">{clients.length}</span>
                <span className="text-xs text-ink opacity-60 mt-1">Klientów</span>
              </div>
              <div className="color-block-coral flex flex-col items-center py-4 rounded-xl">
                <span className="text-3xl font-bold text-ink">{tasks.length}</span>
                <span className="text-xs text-ink opacity-60 mt-1">Follow-upy dziś</span>
              </div>
              <div className="color-block-lilac flex flex-col items-center py-4 rounded-xl">
                <span className="text-3xl font-bold text-ink">{kanbanCols.todo + kanbanCols.doing}</span>
                <span className="text-xs text-ink opacity-60 mt-1">Kanban aktywne</span>
              </div>
              <div className="color-block-mint flex flex-col items-center py-4 rounded-xl">
                <span className="text-3xl font-bold text-ink">{kanbanCols.done}</span>
                <span className="text-xs text-ink opacity-60 mt-1">Kanban zrobione</span>
              </div>
            </div>

            {/* Kanban rozkład */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink opacity-60 mb-3">Kanban — rozkład</h3>
              <div className="flex gap-2">
                {[
                  { label: 'Do zrobienia', count: kanbanCols.todo, bg: 'bg-block-pink' },
                  { label: 'W toku',       count: kanbanCols.doing, bg: 'bg-block-cream' },
                  { label: 'Zrobione',     count: kanbanCols.done,  bg: 'bg-block-mint' },
                ].map(col => (
                  <div key={col.label} className={`flex-1 ${col.bg} rounded-xl p-3 text-center`}>
                    <div className="text-2xl font-bold text-ink">{col.count}</div>
                    <div className="text-[11px] text-ink opacity-60 mt-0.5">{col.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rozkład kolorów klientów */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink opacity-60 mb-3">
                Klienci wg koloru etykiety
              </h3>
              <div className="space-y-2">
                {CLIENT_COLORS.map(c => {
                  const count = colorCount[c.id] || 0;
                  const pct = clients.length > 0 ? Math.round((count / clients.length) * 100) : 0;
                  const label = labels.clients[c.id];
                  return (
                    <div key={c.id} className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full shrink-0 ${c.bg}`} />
                      <span className="text-sm text-ink w-28 truncate">
                        {label || c.name}
                      </span>
                      <div className="flex-1 bg-surface-soft rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 bg-ink rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-ink w-8 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top 5 tras */}
            {topRoutes.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink opacity-60 mb-3">
                  Top 5 tras (liczba klientów)
                </h3>
                <div className="space-y-2">
                  {topRoutes.map(([route, count]) => (
                    <div key={route} className="flex items-center justify-between gap-2 p-2 bg-surface-soft rounded-lg">
                      <span className="text-sm text-ink truncate">{route}</span>
                      <span className="badge badge-cream shrink-0">{count} klientów</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
