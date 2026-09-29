import React, { useState } from 'react';
import { CallOutcome, FollowUp, recordFollowUpOutcome } from '../services/api';

interface FollowUpOutcomeProps {
  followup: FollowUp;
  onClose: () => void;
  onDone: (info: string) => void;
}

const OUTCOMES: { id: CallOutcome; label: string; icon: string; hint: string }[] = [
  { id: 'ordered',   label: 'Zamówił',     icon: '✅', hint: 'liczy się w wynikach kampanii (po telefonie)' },
  { id: 'callback',  label: 'Oddzwonić',   icon: '🔁', hint: 'nowy telefon za 2 dni robocze' },
  { id: 'not_now',   label: 'Nie teraz',   icon: '⏸', hint: 'zamyka temat' },
  { id: 'no_answer', label: 'Nie odebrał', icon: '📵', hint: 'nowy telefon za 2 dni robocze' },
];

// Szybki wynik telefonu kontrolnego po kampanii. Zapis: zamknięcie zadania,
// wpis w historii kontaktów, wynik w kampanii, ewentualnie kolejny telefon.
const FollowUpOutcome: React.FC<FollowUpOutcomeProps> = ({ followup, onClose, onDone }) => {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState<CallOutcome | null>(null);
  const [error, setError] = useState('');

  const save = async (outcome: CallOutcome) => {
    setSaving(outcome);
    setError('');
    try {
      const res = await recordFollowUpOutcome(followup.id, outcome, note);
      const label = OUTCOMES.find(o => o.id === outcome)!.label.toLowerCase();
      onDone(res.nextDueDate
        ? `${followup.clientName}: ${label} — kolejny telefon ${res.nextDueDate}.`
        : `${followup.clientName}: ${label} — zapisano.`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-canvas rounded-lg shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-ink truncate">📞 {followup.clientName}</h3>
            <p className="text-xs text-ink font-light">{followup.reminderText}</p>
          </div>
          <button type="button" onClick={onClose} className="text-ink font-light hover:text-ink text-2xl leading-none">✕</button>
        </div>

        <textarea
          rows={3}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Notatka z rozmowy (opcjonalnie)"
          className="w-full border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ink bg-canvas resize-none"
        />

        <div className="grid grid-cols-2 gap-2">
          {OUTCOMES.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => save(o.id)}
              disabled={saving !== null}
              title={o.hint}
              className={`text-left px-3 py-2.5 rounded-lg border transition-colors disabled:opacity-50 ${
                o.id === 'ordered' ? 'border-transparent bg-primary text-on-primary' : 'border-hairline text-ink hover:bg-surface-soft'
              }`}
            >
              <span className="block text-sm font-semibold">{o.icon} {saving === o.id ? 'Zapisuję…' : o.label}</span>
              <span className={`block text-[11px] ${o.id === 'ordered' ? 'opacity-80' : 'font-light'}`}>{o.hint}</span>
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</div>
        )}
      </div>
    </div>
  );
};

export default FollowUpOutcome;
