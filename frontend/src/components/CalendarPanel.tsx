import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  getFollowUpsRange, createFollowUp, updateFollowUpStatus, getClients,
  FollowUp, Client,
} from '../services/api';

const WEEKDAYS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nie'];
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

// Poniedziałek na/przed danym dniem (PL — tydzień zaczyna się od poniedziałku)
const mondayOnOrBefore = (d: Date) => {
  const out = new Date(d);
  const dow = (out.getDay() + 6) % 7; // 0 = poniedziałek
  out.setDate(out.getDate() - dow);
  return out;
};

const statusBadge = (f: FollowUp, todayISO: string): string => {
  if (f.status === 'zrealizowane') return 'badge-mint';
  if (f.status === 'zaplanowane' && f.dueDate < todayISO) return 'badge-coral';
  return 'badge-cream';
};

export default function CalendarPanel() {
  const today = new Date();
  const todayISO = toISO(today);
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Quick-add
  const [addDate, setAddDate] = useState<string | null>(null);
  const [addClientId, setAddClientId] = useState('');
  const [addText, setAddText] = useState('');
  const [saving, setSaving] = useState(false);

  // Siatka 6 tygodni obejmująca cały miesiąc
  const gridStart = useMemo(() => mondayOnOrBefore(new Date(view.year, view.month, 1)), [view]);
  const gridDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      days.push(d);
    }
    return days;
  }, [gridStart]);

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

  const changeMonth = (delta: number) => {
    setView(v => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="page-title">Kalendarz</h1>
          <p className="text-body-sm font-light mt-2">
            Przypomnienia o kontaktach. Nowe wpisy trafiają też do Google Calendar konta firmowego.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => changeMonth(-1)} className="btn-tertiary">←</button>
          <span className="font-semibold text-ink min-w-[160px] text-center">
            {MONTHS[view.month]} {view.year}
          </span>
          <button type="button" onClick={() => changeMonth(1)} className="btn-tertiary">→</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-ink font-light">Ładowanie kalendarza...</div>
      ) : (
        <div className="grid grid-cols-7 gap-1 md:gap-2">
          {WEEKDAYS.map(w => (
            <div key={w} className="text-center text-xs font-semibold uppercase text-ink opacity-60 pb-1">
              {w}
            </div>
          ))}
          {gridDays.map(d => {
            const iso = toISO(d);
            const inMonth = d.getMonth() === view.month;
            const isToday = iso === todayISO;
            const items = byDay[iso] || [];
            return (
              <div
                key={iso}
                onClick={() => { setAddDate(iso); setAddClientId(''); setAddText(''); }}
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
      )}

      {/* Quick-add / podgląd dnia */}
      {addDate && (
        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex justify-center items-center p-4"
             onClick={() => setAddDate(null)}>
          <div className="bg-canvas w-full max-w-lg rounded-xl shadow-xl flex flex-col max-h-[90vh]"
               onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-hairline-soft flex justify-between items-center bg-surface-soft rounded-t-xl">
              <h2 className="text-lg font-semibold text-ink">📅 {addDate}</h2>
              <button onClick={() => setAddDate(null)} className="text-ink font-bold text-xl">✕</button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {/* Istniejące przypomnienia tego dnia */}
              {(byDay[addDate] || []).length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink opacity-60">Tego dnia</h3>
                  {(byDay[addDate] || []).map(f => (
                    <div key={f.id} className="flex justify-between items-center gap-2 p-2 bg-surface-soft border border-hairline rounded-lg">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink truncate">{f.clientName}</p>
                        <p className="text-xs text-ink opacity-70 truncate">{f.reminderText}</p>
                      </div>
                      {f.status === 'zaplanowane' ? (
                        <button onClick={() => handleComplete(f.id)} className="btn-tertiary text-caption py-1 shrink-0">
                          ✓ Zrobione
                        </button>
                      ) : (
                        <span className={`badge ${statusBadge(f, todayISO)} shrink-0`}>{f.status}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Nowe przypomnienie */}
              <div className="space-y-3 pt-2 border-t border-hairline">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink opacity-60">Nowe przypomnienie</h3>
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
              <button onClick={() => setAddDate(null)} className="px-4 py-2 text-sm font-medium text-ink hover:bg-surface-soft rounded-lg">
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
