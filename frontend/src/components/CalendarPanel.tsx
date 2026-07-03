import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  getFollowUpsRange, createFollowUp, updateFollowUpStatus, getClients,
  FollowUp, Client,
} from '../services/api';

type ViewMode = 'day' | 'week' | 'month';

const WEEKDAYS_SHORT = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nie'];
const WEEKDAYS_LONG = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
const MONTHS = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
];

const toISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const mondayOnOrBefore = (d: Date) => {
  const out = new Date(d);
  const dow = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - dow);
  return out;
};

type StatusInfo = { label: string; chip: string; dot: string };

const getStatusInfo = (f: FollowUp, todayISO: string): StatusInfo => {
  if (f.status === 'zrealizowane') {
    return { label: 'Zrobione', chip: 'bg-block-mint text-ink', dot: 'bg-emerald-500' };
  }
  if (f.status === 'przesunięte') {
    return { label: 'Przesunięte', chip: 'bg-block-cream text-ink', dot: 'bg-amber-400' };
  }
  if (f.dueDate < todayISO) {
    return { label: 'Zaległe', chip: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/50', dot: 'bg-red-500' };
  }
  return { label: 'Do zrobienia', chip: 'bg-block-lilac text-ink', dot: 'bg-violet-500' };
};

const headerLabel = (viewMode: ViewMode, cursor: Date): string => {
  if (viewMode === 'month') {
    return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  }
  if (viewMode === 'week') {
    const mon = mondayOnOrBefore(cursor);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    if (mon.getMonth() === sun.getMonth()) {
      return `${mon.getDate()}–${sun.getDate()} ${MONTHS[mon.getMonth()]} ${mon.getFullYear()}`;
    }
    return `${mon.getDate()} ${MONTHS[mon.getMonth()]} – ${sun.getDate()} ${MONTHS[sun.getMonth()]} ${sun.getFullYear()}`;
  }
  const dow = (cursor.getDay() + 6) % 7;
  return `${WEEKDAYS_LONG[dow]}, ${cursor.getDate()} ${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
};

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7:00–20:00

function DayView({
  cursorISO, todayISO, items, onAdd, onComplete, getStatusInfo,
}: {
  cursorISO: string;
  todayISO: string;
  items: FollowUp[];
  onAdd: () => void;
  onComplete: (id: string) => void;
  getStatusInfo: (f: FollowUp, todayISO: string) => { label: string; chip: string; dot: string };
}) {
  const isToday = cursorISO === todayISO;
  const nowHour = new Date().getHours() + new Date().getMinutes() / 60;
  const pending = items.filter(f => f.status !== 'zrealizowane');
  const done    = items.filter(f => f.status === 'zrealizowane');

  return (
    <div className="max-w-2xl mx-auto rounded-2xl border border-hairline overflow-hidden shadow-sm bg-canvas">

      {/* Nagłówek dnia */}
      <div className={`px-6 py-4 flex items-center justify-between border-b border-hairline ${isToday ? 'bg-violet-50 dark:bg-violet-950/30' : 'bg-surface-soft'}`}>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-ink opacity-40 mb-0.5">
            {isToday ? 'Dziś' : 'Wybrany dzień'}
          </div>
          <div className="text-xl font-bold text-ink">{cursorISO}</div>
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-ink text-canvas text-sm font-semibold rounded-xl hover:opacity-80 transition"
        >
          + Dodaj
        </button>
      </div>

      {/* Sekcja całodniowych przypomnień */}
      {items.length > 0 && (
        <div className="px-4 py-3 border-b border-hairline bg-canvas">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink opacity-40 w-12 shrink-0">Cały dzień</span>
            <div className="flex-1 h-px bg-hairline" />
          </div>
          <div className="pl-14 space-y-2">
            {pending.map(f => {
              const s = getStatusInfo(f, todayISO);
              return (
                <div key={f.id} className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl ${s.chip}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{f.clientName}</p>
                      {f.reminderText && (
                        <p className="text-xs opacity-60 truncate">{f.reminderText}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-medium opacity-60">{s.label}</span>
                    {f.status === 'zaplanowane' && (
                      <button
                        onClick={() => onComplete(f.id)}
                        className="text-xs font-semibold px-2.5 py-1 bg-ink text-canvas rounded-lg opacity-70 hover:opacity-100 transition"
                      >
                        ✓ Zrobione
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {done.map(f => (
              <div key={f.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-soft opacity-50">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <p className="text-sm text-ink line-through truncate">{f.clientName}</p>
                <span className="text-xs ml-auto">✓ Zrobione</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Siatka godzin */}
      <div className="overflow-y-auto max-h-[520px]">
        {HOURS.map(h => {
          const label = `${String(h).padStart(2, '0')}:00`;
          const isNowHour = isToday && Math.floor(nowHour) === h;
          const nowPct = isToday && nowHour >= h && nowHour < h + 1
            ? ((nowHour - h) * 100).toFixed(1)
            : null;

          return (
            <div
              key={h}
              onClick={onAdd}
              className="relative flex items-start group cursor-pointer hover:bg-violet-50/40 dark:hover:bg-violet-950/20 transition-colors"
              style={{ minHeight: '52px' }}
            >
              {/* Etykieta godziny */}
              <div className="w-14 shrink-0 pt-2 pb-2 text-right pr-3">
                <span className={`text-xs font-medium ${isNowHour ? 'text-violet-600 dark:text-violet-400 font-bold' : 'text-ink opacity-30'}`}>
                  {label}
                </span>
              </div>

              {/* Linia + obszar */}
              <div className="flex-1 border-t border-hairline relative pt-2 pb-2 pr-4 min-h-[52px]">
                {/* Wskaźnik aktualnej godziny */}
                {nowPct !== null && (
                  <div
                    className="absolute left-0 right-4 flex items-center pointer-events-none"
                    style={{ top: `${nowPct}%` }}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-violet-500 -ml-1.5 shrink-0" />
                    <div className="flex-1 h-0.5 bg-violet-500" />
                  </div>
                )}
                {/* Hint "+" przy hover */}
                <span className="absolute right-3 top-2 text-xs text-ink opacity-0 group-hover:opacity-30 transition">
                  +
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {items.length === 0 && (
        <div className="text-center py-8 text-ink opacity-30 text-sm border-t border-hairline">
          Brak przypomnień — kliknij godzinę lub „+ Dodaj"
        </div>
      )}
    </div>
  );
}

export default function CalendarPanel() {
  const today = new Date();
  const todayISO = toISO(today);

  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [cursor, setCursor] = useState(new Date());
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const [addDate, setAddDate] = useState<string | null>(null);
  const [addClientId, setAddClientId] = useState('');
  const [addText, setAddText] = useState('');
  const [saving, setSaving] = useState(false);

  const gridDays = useMemo(() => {
    if (viewMode === 'month') {
      const start = mondayOnOrBefore(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
      return Array.from({ length: 42 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
      });
    }
    if (viewMode === 'week') {
      const mon = mondayOnOrBefore(cursor);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(mon);
        d.setDate(mon.getDate() + i);
        return d;
      });
    }
    return [new Date(cursor)];
  }, [viewMode, cursor]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const from = toISO(gridDays[0]);
      const to = toISO(gridDays[gridDays.length - 1]);
      const [f, c] = await Promise.all([getFollowUpsRange(from, to), getClients()]);
      setFollowups(f);
      setClients(c);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Błąd pobierania kalendarza');
    } finally {
      setLoading(false);
    }
  }, [gridDays]);

  useEffect(() => { load(); }, [load]);

  const byDay = useMemo(() => {
    const map: Record<string, FollowUp[]> = {};
    for (const f of followups) (map[f.dueDate] ||= []).push(f);
    return map;
  }, [followups]);

  const navigate = (delta: number) => {
    setCursor(prev => {
      const d = new Date(prev);
      if (viewMode === 'month') d.setMonth(d.getMonth() + delta);
      else if (viewMode === 'week') d.setDate(d.getDate() + delta * 7);
      else d.setDate(d.getDate() + delta);
      return d;
    });
  };

  const openAdd = (iso: string) => { setAddDate(iso); setAddClientId(''); setAddText(''); };

  const handleQuickAdd = async () => {
    if (!addDate) return;
    if (!addClientId) return alert('Wybierz klienta');
    const client = clients.find(c => c.id === addClientId);
    try {
      setSaving(true);
      await createFollowUp(addClientId, {
        clientName: client?.companyName || '',
        dueDate: addDate,
        reminderText: addText.trim() || 'Zaplanowany kontakt',
      });
      setAddDate(null);
      setAddClientId('');
      setAddText('');
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Błąd dodawania przypomnienia');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await updateFollowUpStatus(id, 'zrealizowane');
      load();
    } catch {
      alert('Nie udało się oznaczyć jako zrobione');
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">

      {/* ── NAGŁÓWEK ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="page-title">Kalendarz</h1>
          <p className="text-body-sm font-light mt-1 text-ink opacity-60">
            Przypomnienia o kontaktach z klientami
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Przełącznik widoku */}
          <div className="flex rounded-xl border border-hairline overflow-hidden bg-surface-soft">
            {(['month', 'week', 'day'] as ViewMode[]).map(m => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-4 py-2 text-sm font-medium transition-all ${
                  viewMode === m
                    ? 'bg-ink text-canvas shadow-sm'
                    : 'text-ink opacity-60 hover:opacity-100'
                }`}
              >
                {m === 'day' ? 'Dzień' : m === 'week' ? 'Tydzień' : 'Miesiąc'}
              </button>
            ))}
          </div>

          {/* Nawigacja */}
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="btn-tertiary w-9 h-9 flex items-center justify-center text-base">‹</button>
            <button onClick={() => setCursor(new Date())} className="btn-tertiary px-3 py-2 text-xs font-semibold">Dziś</button>
            <button onClick={() => navigate(1)} className="btn-tertiary w-9 h-9 flex items-center justify-center text-base">›</button>
          </div>

          <span className="text-sm font-semibold text-ink min-w-[180px] text-center">
            {headerLabel(viewMode, cursor)}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-ink opacity-40 text-sm font-light">Ładowanie kalendarza…</div>
        </div>

      ) : viewMode === 'month' ? (
        /* ── WIDOK MIESIĘCZNY ── */
        <div className="rounded-2xl border border-hairline overflow-hidden shadow-sm">
          {/* Nagłówki dni */}
          <div className="grid grid-cols-7 bg-surface-soft border-b border-hairline">
            {WEEKDAYS_SHORT.map(w => (
              <div key={w} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-ink opacity-50">
                {w}
              </div>
            ))}
          </div>

          {/* Siatka dni */}
          <div className="grid grid-cols-7 divide-x divide-y divide-hairline bg-canvas">
            {gridDays.map(d => {
              const iso = toISO(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const isToday = iso === todayISO;
              const items = byDay[iso] || [];
              const pending = items.filter(f => f.status !== 'zrealizowane');
              const done = items.filter(f => f.status === 'zrealizowane');

              return (
                <div
                  key={iso}
                  onClick={() => openAdd(iso)}
                  className={`min-h-[110px] p-2 cursor-pointer transition-colors hover:bg-surface-soft ${
                    inMonth ? '' : 'bg-surface-soft opacity-40'
                  } ${isToday ? 'bg-violet-50 dark:bg-violet-950/30' : ''}`}
                >
                  {/* Numer dnia */}
                  <div className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-semibold mb-1.5 ${
                    isToday ? 'bg-ink text-canvas' : 'text-ink'
                  }`}>
                    {d.getDate()}
                  </div>

                  {/* Follow-upy do zrobienia */}
                  <div className="space-y-1">
                    {pending.slice(0, 3).map(f => {
                      const s = getStatusInfo(f, todayISO);
                      return (
                        <div
                          key={f.id}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium truncate ${s.chip}`}
                          title={`${f.clientName} — ${f.reminderText}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                          <span className="truncate">{f.clientName}</span>
                        </div>
                      );
                    })}
                    {pending.length > 3 && (
                      <div className="text-[10px] text-ink opacity-50 pl-1">+{pending.length - 3} więcej</div>
                    )}
                    {/* Zrealizowane — tylko liczba */}
                    {done.length > 0 && (
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 opacity-70 pl-1">✓ {done.length} zrobione</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      ) : viewMode === 'week' ? (
        /* ── WIDOK TYGODNIOWY ── */
        <div className="grid grid-cols-7 gap-2">
          {gridDays.map(d => {
            const iso = toISO(d);
            const isToday = iso === todayISO;
            const dow = (d.getDay() + 6) % 7;
            const items = byDay[iso] || [];

            return (
              <div
                key={iso}
                className={`rounded-2xl border flex flex-col min-h-[340px] ${
                  isToday ? 'border-ink shadow-md' : 'border-hairline'
                } bg-canvas overflow-hidden`}
              >
                {/* Nagłówek dnia */}
                <div
                  className={`py-3 text-center border-b cursor-pointer hover:bg-surface-soft transition ${
                    isToday ? 'bg-ink border-ink' : 'border-hairline bg-surface-soft'
                  }`}
                  onClick={() => openAdd(iso)}
                >
                  <div className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${isToday ? 'text-canvas opacity-70' : 'text-ink opacity-50'}`}>
                    {WEEKDAYS_SHORT[dow]}
                  </div>
                  <div className={`text-2xl font-bold ${isToday ? 'text-canvas' : 'text-ink'}`}>
                    {d.getDate()}
                  </div>
                </div>

                {/* Zdarzenia */}
                <div className="flex flex-col gap-1.5 p-2 flex-1">
                  {items.map(f => {
                    const s = getStatusInfo(f, todayISO);
                    return (
                      <div key={f.id} className={`rounded-xl p-2 text-[11px] ${s.chip}`}>
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                          <span className="font-semibold truncate">{f.clientName}</span>
                        </div>
                        {f.reminderText && (
                          <div className="opacity-70 truncate pl-2.5">{f.reminderText}</div>
                        )}
                        {f.status === 'zaplanowane' && (
                          <button
                            onClick={e => { e.stopPropagation(); handleComplete(f.id); }}
                            className="mt-1 text-[10px] opacity-60 hover:opacity-100 underline text-left pl-2.5"
                          >
                            ✓ Oznacz jako zrobione
                          </button>
                        )}
                      </div>
                    );
                  })}

                  <button
                    onClick={() => openAdd(iso)}
                    className="mt-auto text-[11px] text-ink opacity-25 hover:opacity-60 text-center py-2 border border-dashed border-hairline rounded-xl transition"
                  >
                    + Dodaj
                  </button>
                </div>
              </div>
            );
          })}
        </div>

      ) : (
        /* ── WIDOK DZIENNY ── */
        <DayView
          cursorISO={toISO(cursor)}
          todayISO={todayISO}
          items={byDay[toISO(cursor)] || []}
          onAdd={() => openAdd(toISO(cursor))}
          onComplete={handleComplete}
          getStatusInfo={getStatusInfo}
        />
      )}

      {/* ── MODAL QUICK-ADD / PODGLĄD DNIA ── */}
      {addDate && (
        <div
          className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm flex justify-center items-end sm:items-center p-0 sm:p-4"
          onClick={() => setAddDate(null)}
        >
          <div
            className="bg-canvas w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header modalu */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-hairline">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-ink opacity-40 mb-0.5">Kalendarz</div>
                <h2 className="text-base font-bold text-ink">{addDate}</h2>
              </div>
              <button
                onClick={() => setAddDate(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-soft text-ink opacity-60 hover:opacity-100 text-lg"
              >
                ×
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {/* Istniejące follow-upy tego dnia */}
              {(byDay[addDate] || []).length > 0 && (
                <div className="px-6 pt-4 pb-2 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-ink opacity-40">
                    Tego dnia
                  </div>
                  {(byDay[addDate] || []).map(f => {
                    const s = getStatusInfo(f, todayISO);
                    return (
                      <div key={f.id} className={`flex items-center justify-between gap-3 p-3 rounded-xl ${s.chip}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                            <p className={`text-sm font-semibold truncate ${f.status === 'zrealizowane' ? 'line-through opacity-60' : ''}`}>
                              {f.clientName}
                            </p>
                          </div>
                          {f.reminderText && (
                            <p className="text-xs opacity-60 mt-0.5 pl-3 truncate">{f.reminderText}</p>
                          )}
                        </div>
                        {f.status === 'zaplanowane' ? (
                          <button
                            onClick={() => handleComplete(f.id)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-ink text-canvas opacity-70 hover:opacity-100 shrink-0"
                          >
                            ✓ Zrobione
                          </button>
                        ) : (
                          <span className="text-xs font-semibold opacity-60 shrink-0">{s.label}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Formularz nowego follow-upa */}
              <div className="px-6 py-4 space-y-4 border-t border-hairline mt-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-ink opacity-40">
                  Nowe przypomnienie
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">Klient</label>
                  <select
                    value={addClientId}
                    onChange={e => setAddClientId(e.target.value)}
                    className="w-full border border-hairline rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ink bg-canvas"
                  >
                    <option value="">— wybierz klienta —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">Notatka <span className="opacity-40 font-normal">(opcjonalna)</span></label>
                  <input
                    type="text"
                    value={addText}
                    onChange={e => setAddText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
                    placeholder="O co zapytać, co omówić?"
                    className="w-full border border-hairline rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ink"
                  />
                </div>
              </div>
            </div>

            {/* Przyciski */}
            <div className="flex gap-3 px-6 py-4 border-t border-hairline bg-surface-soft rounded-b-2xl sm:rounded-b-2xl">
              <button
                onClick={() => setAddDate(null)}
                className="flex-1 py-2.5 text-sm font-medium text-ink bg-canvas border border-hairline rounded-xl hover:bg-surface-soft transition"
              >
                Anuluj
              </button>
              <button
                onClick={handleQuickAdd}
                disabled={saving || !addClientId}
                className="flex-1 py-2.5 text-sm font-semibold text-canvas bg-ink rounded-xl hover:opacity-80 transition disabled:opacity-30"
              >
                {saving ? 'Zapisywanie…' : 'Dodaj przypomnienie'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
