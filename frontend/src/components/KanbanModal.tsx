import { useState } from 'react';
import {
  createKanbanTask, updateKanbanTask,
  KanbanTask, KanbanColumn, KanbanColor, Client,
} from '../services/api';

interface KanbanModalProps {
  task: KanbanTask | null;      // null = nowa karta
  defaultColumn: KanbanColumn;  // kolumna dla nowej karty
  clients: Client[];            // do opcjonalnego powiązania z klientem
  onClose: () => void;
  onSaved: () => void;
}

const COLORS: KanbanColor[] = ['default', 'blue', 'yellow', 'red', 'green'];

const colorSwatch: Record<KanbanColor, string> = {
  default: 'bg-canvas border-hairline',
  blue: 'bg-block-lilac border-hairline',
  yellow: 'bg-yellow-300 border-yellow-400',
  red: 'bg-red-300 border-red-400',
  green: 'bg-green-300 border-green-400',
};

export default function KanbanModal({ task, defaultColumn, clients, onClose, onSaved }: KanbanModalProps) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [color, setColor] = useState<KanbanColor>(task?.color || 'default');
  const [dueDate, setDueDate] = useState(task?.dueDate || '');
  const [clientId, setClientId] = useState(task?.clientId || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return alert('Tytuł zadania jest wymagany');
    const client = clients.find(c => c.id === clientId);
    const formData = {
      title: title.trim(),
      description,
      color,
      dueDate: dueDate || undefined,
      clientId: clientId || undefined,
      clientName: client?.companyName || undefined,
      column: task?.column || defaultColumn,
      order: task?.order,
    };
    try {
      setSaving(true);
      if (task) {
        await updateKanbanTask(task.id, formData);
      } else {
        await createKanbanTask(formData);
      }
      onSaved();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Błąd zapisu zadania');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="bg-canvas w-full max-w-lg rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-hairline-soft flex justify-between items-center bg-surface-soft rounded-t-xl">
          <h2 className="text-lg font-semibold text-ink">
            {task ? '✏️ Edytuj zadanie' : '✨ Nowe zadanie'}
          </h2>
          <button onClick={onClose} className="text-ink font-bold text-xl">✕</button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink font-light mb-1">Tytuł</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Co trzeba zrobić?"
              autoFocus
              className="w-full border border-hairline rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ink"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink font-light mb-1">Opis</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Szczegóły (opcjonalnie)"
              rows={3}
              className="w-full border border-hairline rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ink resize-y"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink font-light mb-1">Termin</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full border border-hairline rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ink"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink font-light mb-1">Klient (opcjonalnie)</label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full border border-hairline rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ink bg-canvas"
              >
                <option value="">— brak —</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.companyName}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink font-light mb-1">Kolor karty</label>
            <div className="flex gap-2 mt-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition ${colorSwatch[c]} ${color === c ? 'scale-110 ring-2 ring-ink' : 'opacity-70'}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-hairline-soft bg-surface-soft flex justify-end gap-2 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-ink hover:bg-surface-soft rounded-lg">
            Anuluj
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-primary hover:opacity-90 rounded-lg shadow disabled:opacity-50"
          >
            {saving ? 'Zapisywanie...' : 'Zapisz'}
          </button>
        </div>
      </div>
    </div>
  );
}
