import { useEffect, useState } from 'react';
import { EmailSignature, getEmailSignature, saveEmailSignature } from '../services/api';

const FIELDS: { key: keyof EmailSignature; label: string; placeholder: string }[] = [
  { key: 'greeting', label: 'Pozdrowienie', placeholder: 'Pozdrawiam' },
  { key: 'name',     label: 'Imię i nazwisko', placeholder: 'Krzysztof Godek' },
  { key: 'website',  label: 'Strona', placeholder: 'https://b2b.antyramy.eu/' },
  { key: 'phone',    label: 'Telefon', placeholder: '500 601 601' },
  { key: 'email',    label: 'E-mail', placeholder: 'biuro@antyramy.eu' },
];

// Sekcja Administracji: podpis w stopce maili. Podgląd odwzorowuje stopkę
// składaną na backendzie (services/emailSignature.ts → buildSignatureHtml).
export default function SignatureSettings() {
  const [sig, setSig] = useState<EmailSignature | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getEmailSignature()
      .then(setSig)
      .catch(e => setError((e as Error).message));
  }, []);

  const handleSave = async () => {
    if (!sig) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      setSig(await saveEmailSignature(sig));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const contacts = sig ? [sig.website, sig.phone, sig.email].filter(Boolean).join(', ') : '';

  return (
    <section className="card-padded space-y-6">
      <h2 className="section-title">Podpis w mailach</h2>
      <p className="text-sm text-ink opacity-60">
        Stopka dodawana automatycznie do kampanii i maili z szablonów. Puste pole nie pojawi się w stopce.
      </p>

      {!sig ? (
        <p className="text-sm text-ink opacity-50">{error || 'Ładowanie...'}</p>
      ) : (
        <>
          <div className="space-y-2">
            {FIELDS.map(f => (
              <div key={f.key} className="flex items-center gap-3">
                <span className="text-sm text-ink opacity-60 w-32 shrink-0">{f.label}</span>
                <input
                  type="text"
                  value={sig[f.key]}
                  placeholder={f.placeholder}
                  onChange={e => setSig({ ...sig, [f.key]: e.target.value })}
                  className="flex-1 min-w-0 border border-hairline rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ink bg-canvas"
                />
              </div>
            ))}
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink opacity-60 mb-2">Podgląd</h3>
            {/* Kolory jak w mailu (jasne tło stopki), niezależnie od motywu aplikacji */}
            <div className="rounded-lg border border-hairline px-5 py-4 text-xs leading-5" style={{ background: '#f8f9fa', color: '#888' }}>
              {sig.greeting && <div>{sig.greeting},</div>}
              {sig.name && <div style={{ color: '#333', fontWeight: 700 }}>{sig.name}</div>}
              {contacts && <div>{contacts}</div>}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button onClick={handleSave} disabled={saving} className="btn-primary px-8 disabled:opacity-50">
              {saving ? 'Zapisywanie...' : 'Zapisz podpis'}
            </button>
            {saved && <span className="text-sm text-success font-medium">✓ Zapisano</span>}
          </div>
        </>
      )}
    </section>
  );
}
