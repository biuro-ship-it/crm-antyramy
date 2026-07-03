import React, { useState, useEffect } from 'react';
import {
  EmailTemplate, EmailTemplateFormData,
  getEmailTemplates, createEmailTemplate, updateEmailTemplate, deleteEmailTemplate,
} from '../services/api';

const CATEGORIES = ['oferta', 'follow-up', 'podziękowanie', 'inne'] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_BADGE: Record<Category, string> = {
  'oferta': 'badge-lilac',
  'follow-up': 'badge-cream',
  'podziękowanie': 'badge-mint',
  'inne': 'badge-lime',
};

const emptyForm = (): EmailTemplateFormData => ({
  name: '',
  category: 'oferta',
  subject: '',
  body: '',
});

// ─── Formularz dodawania / edycji ────────────────────────────────────────────
interface TemplateFormProps {
  initial: EmailTemplateFormData;
  onSave: (data: EmailTemplateFormData) => Promise<void>;
  onCancel: () => void;
  saveLabel: string;
}

const TemplateForm: React.FC<TemplateFormProps> = ({ initial, onSave, onCancel, saveLabel }) => {
  const [form, setForm] = useState<EmailTemplateFormData>(initial);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-surface-soft rounded-lg border border-hairline p-6 mb-6 animate-in fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

        <div className="md:col-span-2">
          <label className="text-xs font-bold text-ink font-light uppercase mb-1 block">Nazwa szablonu *</label>
          <input
            required
            type="text"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="np. Pierwsze powitanie klienta"
            className="w-full border border-hairline rounded-xl p-3 outline-none focus:ring-2 focus:ring-ink bg-canvas"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-ink font-light uppercase mb-1 block">Kategoria *</label>
          <select
            value={form.category}
            onChange={e => setForm({ ...form, category: e.target.value })}
            className="w-full border border-hairline rounded-xl p-3 outline-none focus:ring-2 focus:ring-ink bg-canvas"
          >
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-ink font-light uppercase mb-1 block">Temat maila *</label>
          <input
            required
            type="text"
            value={form.subject}
            onChange={e => setForm({ ...form, subject: e.target.value })}
            placeholder="np. Oferta współpracy — Antyramy"
            className="w-full border border-hairline rounded-xl p-3 outline-none focus:ring-2 focus:ring-ink bg-canvas"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-xs font-bold text-ink font-light uppercase mb-1 block">Treść *</label>
          <textarea
            required
            rows={10}
            value={form.body}
            onChange={e => setForm({ ...form, body: e.target.value })}
            placeholder="Treść wiadomości e-mail..."
            className="w-full border border-hairline rounded-xl p-3 outline-none focus:ring-2 focus:ring-ink bg-canvas resize-y font-mono text-sm leading-relaxed"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel}
          className="px-5 py-2.5 rounded-xl border border-hairline text-ink font-light font-semibold hover:bg-surface-soft transition-colors">
          Anuluj
        </button>
        <button type="submit" disabled={saving}
          className="px-6 py-2.5 bg-primary hover:bg-primary text-on-primary font-bold rounded-xl transition-colors disabled:opacity-60">
          {saving ? 'Zapisuję...' : saveLabel}
        </button>
      </div>
    </form>
  );
};

// ─── Główny panel ─────────────────────────────────────────────────────────────
const EmailTemplatesPanel: React.FC = () => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await getEmailTemplates();
      setTemplates(data);
    } catch {
      setError('Nie udało się pobrać szablonów maili.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (data: EmailTemplateFormData) => {
    const created = await createEmailTemplate(data);
    setTemplates(prev => [created, ...prev]);
    setShowAddForm(false);
  };

  const handleUpdate = async (id: string, data: EmailTemplateFormData) => {
    const updated = await updateEmailTemplate(id, data);
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...updated } : t));
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteEmailTemplate(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
    setDeleteConfirm(null);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div>
      {/* Nagłówek */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-extrabold text-ink">Szablony Maili</h2>
          <p className="text-ink font-light text-sm mt-1">
            Gotowe szablony wiadomości sprzedażowych — {templates.length} {templates.length === 1 ? 'szablon' : 'szablonów'}
          </p>
        </div>
        <button
          onClick={() => { setShowAddForm(v => !v); setEditingId(null); }}
          className="btn-primary"
        >
          {showAddForm ? '✕ Anuluj' : '＋ Nowy szablon'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 p-4 rounded-xl mb-4">⚠️ {error}</div>
      )}

      {/* Formularz dodawania */}
      {showAddForm && (
        <TemplateForm
          initial={emptyForm()}
          onSave={handleAdd}
          onCancel={() => setShowAddForm(false)}
          saveLabel="Dodaj szablon"
        />
      )}

      {/* Treść */}
      {loading ? (
        <div className="text-center text-ink font-light py-12 animate-pulse">Ładowanie szablonów...</div>
      ) : templates.length === 0 ? (
        <div className="bg-canvas rounded-lg border border-dashed border-hairline p-12 text-center">
          <span className="text-4xl block mb-3">✉️</span>
          <p className="text-ink font-light">Brak szablonów. Dodaj pierwszy szablon powyżej.</p>
        </div>
      ) : (
        <div className="bg-canvas rounded-lg border border-hairline shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-soft border-b border-hairline-soft">
                <th className="text-left px-5 py-3 text-xs font-bold text-ink font-light uppercase tracking-wide">Nazwa</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-ink font-light uppercase tracking-wide">Kategoria</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-ink font-light uppercase tracking-wide hidden md:table-cell">Temat</th>
                <th className="text-center px-5 py-3 text-xs font-bold text-ink font-light uppercase tracking-wide hidden lg:table-cell">Wersja</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-ink font-light uppercase tracking-wide hidden lg:table-cell">Data</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {templates.map(template => (
                <React.Fragment key={template.id}>
                  <tr className="border-b border-hairline-soft hover:bg-surface-soft transition-colors">
                    <td className="px-5 py-4 font-semibold text-ink">{template.name}</td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-bold px-2 py-1 rounded-md uppercase tracking-wide ${CATEGORY_BADGE[template.category as Category] ?? 'bg-surface-soft text-ink font-light'}`}>
                        {template.category}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-ink font-light hidden md:table-cell max-w-xs truncate">{template.subject}</td>
                    <td className="px-5 py-4 text-center hidden lg:table-cell">
                      <span className="text-xs font-mono bg-surface-soft text-ink font-light px-2 py-0.5 rounded">
                        v{template.currentVersion}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-ink font-light text-xs hidden lg:table-cell">{formatDate(template.updatedAt)}</td>
                    <td className="px-5 py-4">
                      {deleteConfirm === template.id ? (
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => handleDelete(template.id)}
                            className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">
                            Usuń
                          </button>
                          <button onClick={() => setDeleteConfirm(null)}
                            className="border border-hairline text-ink font-light text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-surface-soft transition-colors">
                            Anuluj
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => { setEditingId(template.id); setShowAddForm(false); }}
                            className="border border-hairline text-ink text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-surface-soft transition-colors"
                          >
                            ✎ Edytuj
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(template.id)}
                            className="border border-red-100 dark:border-red-900/50 text-red-400 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                          >
                            🗑
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Formularz edycji inline pod wierszem */}
                  {editingId === template.id && (
                    <tr>
                      <td colSpan={6} className="px-5 py-4 bg-surface-soft/50">
                        <TemplateForm
                          initial={{ name: template.name, category: template.category, subject: template.subject, body: template.body }}
                          onSave={(data) => handleUpdate(template.id, data)}
                          onCancel={() => setEditingId(null)}
                          saveLabel="Zapisz nową wersję"
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default EmailTemplatesPanel;
