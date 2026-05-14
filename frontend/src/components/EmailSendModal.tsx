import React, { useState, useEffect } from 'react';
import {
  Client, EmailTemplate,
  getEmailTemplates, sendEmailFromTemplate,
} from '../services/api';

interface EmailSendModalProps {
  client: Client;
  onClose: () => void;
}

const CATEGORY_BADGE: Record<string, string> = {
  'oferta': 'bg-blue-100 text-blue-700',
  'follow-up': 'bg-amber-100 text-amber-700',
  'podziękowanie': 'bg-emerald-100 text-emerald-700',
  'inne': 'bg-slate-100 text-slate-600',
};

const EmailSendModal: React.FC<EmailSendModalProps> = ({ client, onClose }) => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<EmailTemplate | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getEmailTemplates()
      .then(setTemplates)
      .catch(() => setError('Nie udało się pobrać szablonów.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = (template: EmailTemplate) => {
    setSelected(template);
    setSubject(template.subject);
    setBody(template.body);
    setError('');
  };

  const handleSend = async () => {
    if (!selected || !client.email) return;
    setSending(true);
    setError('');
    try {
      await sendEmailFromTemplate(selected.id, { to: client.email, subject, body });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd wysyłki');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Nagłówek */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Wyślij mail z szablonu</h3>
            <p className="text-xs text-slate-400 mt-0.5">Do: <span className="font-semibold text-slate-600">{client.email}</span></p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {sent ? (
            <div className="text-center py-10">
              <div className="text-5xl mb-4">✅</div>
              <p className="text-lg font-bold text-slate-800">Mail wysłany</p>
              <p className="text-sm text-slate-500 mt-1">Wiadomość do <span className="font-semibold">{client.email}</span> została wysłana.</p>
              <button onClick={onClose}
                className="mt-6 bg-slate-900 hover:bg-blue-600 text-white font-bold px-6 py-2.5 rounded-xl transition-colors">
                Zamknij
              </button>
            </div>
          ) : (
            <>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl mb-4">⚠️ {error}</div>
              )}

              {/* Wybór szablonu */}
              {!selected && (
                <>
                  <p className="text-xs font-bold text-slate-500 uppercase mb-3">Wybierz szablon</p>
                  {loading ? (
                    <p className="text-slate-400 text-center py-6 animate-pulse">Ładowanie szablonów...</p>
                  ) : templates.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <p>Brak szablonów.</p>
                      <p className="text-xs mt-1">Dodaj szablony w zakładce "Szablony maili".</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {templates.map(t => (
                        <button
                          key={t.id}
                          onClick={() => handleSelect(t)}
                          className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold text-slate-800 text-sm">{t.name}</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-md uppercase shrink-0 ${CATEGORY_BADGE[t.category] ?? 'bg-slate-100 text-slate-600'}`}>
                              {t.category}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5 truncate">{t.subject}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Edycja przed wysyłką */}
              {selected && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-bold text-slate-500 uppercase">Edytuj przed wysyłką</p>
                    <button onClick={() => setSelected(null)}
                      className="text-xs text-blue-600 hover:underline font-semibold">
                      ← Zmień szablon
                    </button>
                  </div>

                  <div className="mb-4">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Temat</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Treść</label>
                    <textarea
                      rows={10}
                      value={body}
                      onChange={e => setBody(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-blue-500 resize-none font-mono leading-relaxed"
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Stopka */}
        {!sent && selected && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center">
            <span className="text-xs text-slate-400">Wysyłka przez Gmail API</span>
            <button
              onClick={handleSend}
              disabled={sending || !subject || !body}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {sending ? 'Wysyłam...' : '✉️ Wyślij'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailSendModal;
