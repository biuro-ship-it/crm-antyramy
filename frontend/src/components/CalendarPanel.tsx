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

const statusBadge = (f: FollowUp, todayISO: string): string => {
  if (f.status === 'zrealizowane') return 'badge-mint';
  if (f.status === 'zaplanowane' && f.dueDate < todayISO) return 'badge-coral';
  return 'badge-cream';
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
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="page-title">Kalendarz</h1>
          <p className="text-body-sm font-light mt-2">
            Przypomnienia o kontaktach. Nowe wpisy trafiają też do Google Calendar konta firmowego.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Przełącznik widoku */}
          <div className="flex rounded-lg border border-hairline overflow-hidden self-center">
            {(['day', 'week', 'month'] as ViewMode[]).map(m => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 text-sm font-medium transition ${
                  viewMode === m ? 'bg-ink text-canvas' : 'text-ink hover:bg-surface-soft'
                }`}
              >
                {m === 'day' ? 'Dzień' : m === 'week' ? 'Tydzień' : 'Miesiąc'}
              </button>
            ))}
          </div>

          {/* Nawigacja */}
          <div className="flex items-center gap-2 self-center">
            <button type="button" onClick={() => navigate(-1)} className="btn-tertiary">←</button>
            <button
              type="button"
              onClick={() => setCursor(new Date())}
              className="btn-tertiary text-xs px-3"
            >
              Dziś
            </button>
            <button type="button" onClick={() => navigate(1)} className="btn-tertiary">→</button>
          </div>

          <span className="font-semibold text-ink text-sm text-center min-w-[220px]">
            {headerLabel(viewMode, cursor)}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-ink font-light">Ładowanie kalendarza...</div>
      ) : viewMode === 'month' ? (
        /* ── WIDOK MIESIĘCZNY ── */
        <div className="grid grid-cols-7 gap-1 md:gap-2">
          {WEEKDAYS_SHORT.map(w => (
            <div key={w} className="text-center text-xs font-semibold uppercase text-ink opacity-60 pb-1">
              {w}
            </div>
          ))}
          {gridDays.map(d => {
            const iso = toISO(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = iso === todayISO;
            const items = byDay[iso] || [];
            return (
              <div
                key={iso}
                onClick={() => openAdd(iso)}
                className={`min-h-[88px] rounded-lg border p-1.5 cursor-pointer transition hover:border-ink ${
                  inMonth ? 'bg-canvas border-hairline' : 'bg-surface-soft border-transparent opacity-50'
                } ${isToday ? 'ring-2 ring-ink' : ''}`}
              >
                <div className="text-xs font-semibold text-ink mb-1">{d.getDate()}</div>
                <div className="flex flex-col gap-1">
                  {items.slice(0, 3).map(f => (
                    <span
                      key={f.id}
                      className={`badge ${statusBadge(f, todayISO)} text-[10px] truncate block`}
                      title={`${f.clientName} — ${f.reminderText}`}
                    >
                      {f.clientName}
                    </span>
                  ))}
                  {items.length > 3 && (
                    <span className="text-[10px] text-ink opacity-60">+{items.length - 3} więcej</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : viewMode === 'week' ? (
        /* ── WIDOK TYGODNIOWY ── */
        <div className="grid grid-cols-7 gap-2 overflow-x-auto">
          {gridDays.map(d => {
            const iso = toISO(d);
            const isToday = iso === todayISO;
            const dow = (d.getDay() + 6) % 7;
            const items = byDay[iso] || [];
            return (
              <div
                key={iso}
                className={`rounded-xl border flex flex-col min-h-[320px] transition ${
                  isToday ? 'ring-2 ring-ink border-ink' : 'border-hairline'
                } bg-canvas`}
              >
                {/* Nagłówek dnia */}
                <div
                  className={`text-center py-3 border-b border-hairline cursor-pointer hover:bg-surface-soft rounded-t-xl transition ${
                    isToday ? 'bg-surface-soft' : ''
                  }`}
                  onClick={() => openAdd(iso)}
                >
                  <div className="text-[11px] font-semibold uppercase text-ink opacity-60">
                    {WEEKDAYS_SHORT[dow]}
                  </div>
                  <div className={`text-2xl font-bold ${isToday ? 'text-primary' : 'text-ink'}`}>
                    {d.getDate()}
                  </div>
                </div>

                {/* Zdarzenia */}
                <div className="flex flex-col gap-1.5 p-2 flex-1">
                  {items.map(f => (
                    <div
                      key={f.id}
                      className={`badge ${statusBadge(f, todayISO)} flex flex-col gap-0.5 py-1.5 px-2`}
                    >
                      <span className="font-semibold text-[11px] truncate">{f.clientName}</span>
                      <span className="text-[10px] opacity-70 truncate">{f.reminderText}</span>
                      {f.status === 'zaplanowane' && (
                        <button
                          onClick={e => { e.stopPropagation(); handleComplete(f.id); }}
                          className="text-[10px] underline opacity-60 hover:opacity-100 text-left mt-0.5"
                        >
                          ✓ Zrobione
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => openAdd(iso)}
                    className="mt-auto text-[11px] text-ink opacity-30 hover:opacity-70 text-center py-1.5 border border-dashed border-hairline rounded-lg transition"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── WIDOK DZIENNY ── */
        <div className="max-w-2xl mx-auto space-y-3">
          {(byDay[toISO(cursor)] || []).length === 0 ? (
            <div className="text-center py-12 text-ink opacity-40 font-light">
              Brak przypomnień na ten dzień
            </div>
          ) : (
            (byDay[toISO(cursor)] || []).map(f => (
              <div
                key={f.id}
                className={`flex justify-between items-start gap-4 p-4 rounded-xl border ${
                  f.status === 'zrealizowane'
                    ? 'border-hairline bg-surface-soft'
                    : f.dueDate < todayISO
                    ? 'border-coral/30 bg-coral/5'
                    : 'border-hairline bg-canvas'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`badge ${statusBadge(f, todayISO)}`}>{f.status}</span>
                  </div>
                  <p className="font-semibold text-ink">{f.clientName}</p>
                  <p className="text-sm text-ink opacity-70 mt-0.5">{f.reminderText}</p>
                </div>
                {f.status === 'zaplanowane' && (
                  <button
                    onClick={() => handleComplete(f.id)}
                    className="btn-tertiary text-caption py-1 shrink-0"
                  >
                    ✓ Zrobione
                  </button>
                )}
              </div>
            ))
          )}

          <button
            onClick={() => openAdd(toISO(cursor))}
            className="w-full py-4 border-2 border-dashed border-hairline rounded-xl text-sm text-ink opacity-50 hover:opacity-80 hover:border-ink transition"
          >
            + Dodaj przypomnienie na ten dzień
          </button>
        </div>
      )}

      {/* Modal quick-add / podgląd dnia */}
      {addDate && (
        <div
          className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex justify-center items-center p-4"
          onClick={() => setAddDate(null)}
        >
          <div
            className="bg-canvas w-full max-w-lg rounded-xl shadow-xl flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-hairline-soft flex justify-between items-center bg-surface-soft rounded-t-xl">
              <h2 className="text-lg font-semibold text-ink">📅 {addDate}</h2>
              <button onClick={() => setAddDate(null)} className="text-ink font-bold text-xl">✕</button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {(byDay[addDate] || []).length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink opacity-60">
                    Tego dnia
                  </h3>
                  {(byDay[addDate] || []).map(f => (
                    <div
                      key={f.id}
                      className="flex justify-between items-center gap-2 p-2 bg-surface-soft border border-hairline rounded-lg"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink truncate">{f.clientName}</p>
                        <p className="text-xs text-ink opacity-70 truncate">{f.reminderText}</p>
                      </div>
                      {f.status === 'zaplanowane' ? (
                        <button
                          onClick={() => handleComplete(f.id)}
                          className="btn-tertiary text-caption py-1 shrink-0"
                        >
                          ✓ Zrobione
                        </button>
                      ) : (
                        <span className={`badge ${statusBadge(f, todayISO)} shrink-0`}>{f.status}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3 pt-2 border-t border-hairline">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink opacity-60">
                  Nowe przypomnienie
                </h3>
                <div>
                  <label className="block text-xs font-semibold text-ink font-light mb-1">Klient</label>
                  <select
                    value={addClientId}
                    onChange={e => setAddClientId(e.target.value)}
                    className="w-full border border-hairline rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ink bg-canvas"
                  >
                    <option value="">— wybierz —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink font-light mb-1">Notatka</label>
                  <input
                    type="text"
                    value={addText}
                    onChange={e => setAddText(e.target.value)}
                    placeholder="O co zapytać przy kontakcie?"
                    className="w-full border border-hairline rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ink"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-hairline-soft bg-surface-soft flex justify-end gap-2 rounded-b-xl">
              <button
                onClick={() => setAddDate(null)}
                className="px-4 py-2 text-sm font-medium text-ink hover:bg-surface-soft rounded-lg"
              >
                Zamknij
              </button>
              <button
                onClick={handleQuickAdd}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-primary hover:opacity-90 rounded-lg shadow disabled:opacity-50"
              >
                {saving ? 'Zapisywanie...' : 'Dodaj przypomnienie'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
