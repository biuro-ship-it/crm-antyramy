import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Client, Interaction, InteractionFormData, Product,
  getClientInteractions, createClientInteraction, updateClientInteraction,
  getProductsList, createFollowUp
} from '../services/api';

// ─── Modal wysyłki produktów mailem ─────────────────────────────────────────
interface ProductEmailModalProps {
  client: Client;
  products: Product[];
  onClose: () => void;
}

const ProductEmailModal: React.FC<ProductEmailModalProps> = ({ client, products, onClose }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [emailBody, setEmailBody] = useState('');
  const [step, setStep] = useState<'select' | 'preview'>('select');

  const toggleProduct = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedProducts = products.filter(p => selected.has(p.id));

  const buildEmailBody = () => {
    const greeting = client.contactPerson
      ? `Dzień dobry Panie/Pani ${client.contactPerson},`
      : 'Dzień dobry,';

    const productLines = selectedProducts.map(p => {
      const priceStr = p.priceNetto > 0 ? `Cena netto: ${p.priceNetto.toFixed(2)} zł` : '';
      const codeStr = p.code ? `Kod: ${p.code}` : '';
      const details = [codeStr, priceStr].filter(Boolean).join(' | ');
      const imageStr = p.imageUrl ? `\nZdjęcie: ${p.imageUrl}` : '';
      return `• ${p.name}${details ? `\n  ${details}` : ''}${imageStr}`;
    }).join('\n\n');

    return `${greeting}

W nawiązaniu do naszej rozmowy, przesyłam informacje o produktach z naszej oferty:

${productLines}

W razie pytań dotyczących cen, dostępności lub zamówienia — pozostaję do dyspozycji.

Pozdrawiam serdecznie,`;
  };

  const handleGoToPreview = () => {
    setEmailBody(buildEmailBody());
    setStep('preview');
  };

  const handleSend = () => {
    const subject = encodeURIComponent(`Oferta produktów — Antyramy`);
    const body = encodeURIComponent(emailBody);
    window.location.href = `mailto:${client.email}?subject=${subject}&body=${body}`;
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Nagłówek modalu */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-800">
            {step === 'select' ? '📦 Wybierz produkty do wysyłki' : '✉️ Podgląd i edycja e-maila'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">✕</button>
        </div>

        {/* Krok 1: Wybór produktów */}
        {step === 'select' && (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              {products.length === 0 ? (
                <p className="text-slate-400 text-center py-8">Brak produktów w bazie. Dodaj je w zakładce Produkty.</p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {products.map(p => {
                    const isSelected = selected.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleProduct(p.id)}
                        className={`text-left rounded-2xl border-2 overflow-hidden transition-all ${isSelected ? 'border-blue-500 shadow-md shadow-blue-100' : 'border-slate-200 hover:border-slate-300'}`}
                      >
                        {p.imageUrl
                          ? <img src={p.imageUrl} alt={p.name} className="w-full h-28 object-cover" />
                          : <div className="w-full h-28 bg-slate-100 flex items-center justify-center text-3xl">📦</div>
                        }
                        <div className="p-3">
                          <div className="flex justify-between items-start gap-2">
                            <p className="font-bold text-slate-800 text-sm leading-tight">{p.name}</p>
                            {isSelected && <span className="text-blue-600 text-lg shrink-0">✓</span>}
                          </div>
                          {p.code && <p className="text-xs text-slate-400 font-mono mt-0.5">{p.code}</p>}
                          {p.priceNetto > 0 && (
                            <p className="text-sm font-black text-slate-900 mt-1">{p.priceNetto.toFixed(2)} zł</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center">
              <span className="text-sm text-slate-500">
                {selected.size > 0 ? `Wybrano: ${selected.size} ${selected.size === 1 ? 'produkt' : 'produktów'}` : 'Zaznacz produkty do wysyłki'}
              </span>
              <button
                onClick={handleGoToPreview}
                disabled={selected.size === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 rounded-xl transition-colors disabled:opacity-40"
              >
                Dalej — podgląd →
              </button>
            </div>
          </>
        )}

        {/* Krok 2: Podgląd i edycja e-maila */}
        {step === 'preview' && (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              <p className="text-xs text-slate-400 mb-2 font-bold uppercase">Do: {client.email}</p>
              <p className="text-xs text-slate-400 mb-4">Treść e-maila — możesz ją edytować przed wysłaniem:</p>
              <textarea
                value={emailBody}
                onChange={e => setEmailBody(e.target.value)}
                rows={16}
                className="w-full border border-slate-200 rounded-xl p-4 text-sm text-slate-700 outline-none focus:border-blue-500 resize-none font-mono leading-relaxed"
              />
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center">
              <button onClick={() => setStep('select')}
                className="text-slate-500 hover:text-slate-800 font-semibold text-sm flex items-center gap-1">
                ← Wróć do wyboru
              </button>
              <button
                onClick={handleSend}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-xl transition-colors flex items-center gap-2"
              >
                <span>✉️</span> Otwórz w kliencie poczty
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

interface ClientCardProps {
  client: Client;
  onClose: () => void;
}

const CHANNEL_ICON: Record<string, string> = {
  telefon: '📞',
  mail: '✉️',
  spotkanie: '🤝',
  inne: '📌'
};

const emptyForm = (): InteractionFormData => ({
  contactDate: new Date().toISOString().split('T')[0],
  channel: 'telefon',
  notes: '',
  tradeNotes: '',
  products: []
});

// ─── Współdzielony formularz (dodawanie i edycja) ──────────────────────────
interface InteractionFormProps {
  initialData: InteractionFormData;
  products: Product[];
  onSave: (data: InteractionFormData) => Promise<void>;
  onCancel: () => void;
  saveLabel: string;
  // opcjonalnie: sekcja follow-up (tylko przy dodawaniu)
  withFollowUp?: boolean;
  clientId?: string;
  clientName?: string;
}

// ─── Hook: dyktowanie głosem (Web Speech API) ──────────────────────────────
const useSpeechRecognition = (onResult: (text: string) => void) => {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [listening, setListening] = useState(false);
  const [supported] = useState(() =>
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  );

  const start = useCallback(() => {
    if (!supported) return;
    const SR = (window.SpeechRecognition || (window as unknown as { webkitSpeechRecognition: typeof SpeechRecognition }).webkitSpeechRecognition);
    const rec = new SR();
    rec.lang = 'pl-PL';
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join(' ');
      onResult(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [supported, onResult]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return { listening, supported, start, stop };
};

const InteractionForm: React.FC<InteractionFormProps> = ({
  initialData, products, onSave, onCancel, saveLabel,
  withFollowUp = false, clientId, clientName
}) => {
  const [data, setData] = useState<InteractionFormData>(initialData);
  const [planFollowUp, setPlanFollowUp] = useState(false);
  const [followUpData, setFollowUpData] = useState({ dueDate: '', reminderText: '' });
  const [saving, setSaving] = useState(false);

  const { listening, supported: speechSupported, start: startSpeech, stop: stopSpeech } =
    useSpeechRecognition((text) => {
      setData(prev => ({ ...prev, notes: prev.notes ? `${prev.notes} ${text}` : text }));
    });

  const handleProductToggle = (name: string) => {
    setData(prev => ({
      ...prev,
      products: prev.products.includes(name)
        ? prev.products.filter(p => p !== name)
        : [...prev.products, name]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(data);
      // Zapisz follow-up jeśli zaplanowany (tylko przy dodawaniu nowej notatki)
      if (withFollowUp && planFollowUp && followUpData.dueDate && clientId) {
        await createFollowUp(clientId, {
          clientName: clientName || '',
          dueDate: followUpData.dueDate,
          reminderText: followUpData.reminderText || 'Zaplanowany kontakt'
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100 mb-6 animate-in slide-in-from-top-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase ml-1">Data kontaktu</label>
          <input type="date" required
            className="w-full bg-white border border-slate-200 rounded-xl p-3 outline-none focus:border-blue-500"
            value={data.contactDate}
            onChange={e => setData({ ...data, contactDate: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase ml-1">Forma kontaktu</label>
          <select
            className="w-full bg-white border border-slate-200 rounded-xl p-3 outline-none focus:border-blue-500"
            value={data.channel}
            onChange={e => setData({ ...data, channel: e.target.value as InteractionFormData['channel'] })}>
            <option value="telefon">📞 Telefon</option>
            <option value="mail">✉️ E-mail</option>
            <option value="spotkanie">🤝 Spotkanie</option>
            <option value="inne">📌 Inne</option>
          </select>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-bold text-slate-500 uppercase ml-1">Przebieg rozmowy (Notatki)</label>
          {speechSupported && (
            <button
              type="button"
              onClick={listening ? stopSpeech : startSpeech}
              title={listening ? 'Zatrzymaj nagrywanie' : 'Dyktuj głosem'}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                listening
                  ? 'bg-red-100 text-red-600 animate-pulse'
                  : 'bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-blue-600'
              }`}
            >
              <span>{listening ? '⏹' : '🎙️'}</span>
              {listening ? 'Nagrywam...' : 'Dyktuj'}
            </button>
          )}
        </div>
        <textarea required rows={3}
          className={`w-full bg-white border rounded-xl p-3 outline-none focus:border-blue-500 resize-none transition-colors ${
            listening ? 'border-red-300 bg-red-50' : 'border-slate-200'
          }`}
          placeholder="O czym rozmawialiście?"
          value={data.notes}
          onChange={e => setData({ ...data, notes: e.target.value })} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase ml-1">Ustalenia Cenowe / Rabaty</label>
          <textarea rows={3}
            className="w-full bg-white border border-slate-200 rounded-xl p-3 outline-none focus:border-blue-500 resize-none"
            placeholder="Np. Rabat 10%..."
            value={data.tradeNotes}
            onChange={e => setData({ ...data, tradeNotes: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase ml-1 mb-2 block">Zainteresowany Produktami</label>
          <div className="bg-white border border-slate-200 rounded-xl p-3 max-h-[100px] overflow-y-auto space-y-2">
            {products.length === 0
              ? <p className="text-xs text-slate-400">Brak produktów...</p>
              : products.map(p => (
                <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 p-1 rounded">
                  <input type="checkbox"
                    checked={data.products.includes(p.name)}
                    onChange={() => handleProductToggle(p.name)}
                    className="rounded text-blue-600 focus:ring-blue-500" />
                  <span className="text-slate-700">{p.name}</span>
                </label>
              ))
            }
          </div>
        </div>
      </div>

      {/* Sekcja follow-up tylko przy dodawaniu nowej notatki */}
      {withFollowUp && (
        <div className="mt-4 pt-4 border-t border-blue-200/50">
          <label className="flex items-center gap-2 cursor-pointer font-bold text-blue-900 mb-4 select-none">
            <input type="checkbox" checked={planFollowUp}
              onChange={e => setPlanFollowUp(e.target.checked)}
              className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500" />
            ⏰ Zaplanuj kolejny kontakt
          </label>
          {planFollowUp && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-4 rounded-xl border border-blue-100 animate-in fade-in duration-200">
              <div className="col-span-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Kiedy zadzwonić?</label>
                <input type="date" required={planFollowUp}
                  className="w-full mt-1 border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500"
                  value={followUpData.dueDate}
                  onChange={e => setFollowUpData({ ...followUpData, dueDate: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Notatka dla przypomnienia</label>
                <input type="text" placeholder="O co zapytać przy kolejnym kontakcie?"
                  className="w-full mt-1 border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500"
                  value={followUpData.reminderText}
                  onChange={e => setFollowUpData({ ...followUpData, reminderText: e.target.value })} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3 mt-6">
        <button type="button" onClick={onCancel}
          className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors">
          Anuluj
        </button>
        <button type="submit" disabled={saving}
          className="bg-blue-600 text-white font-bold px-8 py-2.5 rounded-xl shadow-lg hover:bg-blue-700 transition-colors disabled:opacity-60">
          {saving ? 'Zapisuję...' : saveLabel}
        </button>
      </div>
    </form>
  );
};

// ─── Główny komponent ──────────────────────────────────────────────────────
const ClientCard: React.FC<ClientCardProps> = ({ client, onClose }) => {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEmailModal, setShowEmailModal] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [interactionsData, productsData] = await Promise.all([
          getClientInteractions(client.id),
          getProductsList()
        ]);
        setInteractions(interactionsData);
        setProducts(productsData);
      } catch (err) {
        console.error('Błąd ładowania danych karty:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [client.id]);

  // Dodawanie nowej notatki
  const handleAddSave = async (data: InteractionFormData) => {
    const newInteraction = await createClientInteraction(client.id, data);
    setInteractions(prev => [newInteraction, ...prev]);
    setShowAddForm(false);
  };

  // Zapis edytowanej notatki
  const handleEditSave = async (interactionId: string, data: InteractionFormData) => {
    const updated = await updateClientInteraction(client.id, interactionId, data);
    setInteractions(prev => prev.map(i => i.id === interactionId ? updated : i));
    setEditingId(null);
  };

  const handleGenerateEmail = () => {
    const subject = encodeURIComponent(`Oferta współpracy - ${client.companyName} / Antyramy`);
    const greeting = client.contactPerson
      ? `Dzień dobry Panie/Pani ${client.contactPerson},`
      : `Dzień dobry,`;
    const body = encodeURIComponent(
      `${greeting}\n\nNawiązując do naszej rozmowy, przesyłam zarys propozycji współpracy...\n\n[Tutaj wpisz szczegóły wyceny lub załącz plik z ofertą]\n\nW razie jakichkolwiek pytań, pozostaję do dyspozycji.\n\nPozdrawiam serdecznie,`
    );
    window.location.href = `mailto:${client.email}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 animate-in fade-in duration-300">
      <button onClick={onClose} className="mb-6 flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-blue-600 transition-colors">
        <span>←</span> Wróć do listy klientów
      </button>

      {/* Nagłówek karty */}
      <div className="flex flex-col md:flex-row justify-between items-start border-b border-slate-100 pb-6 mb-6 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-3xl font-black text-slate-800">{client.companyName}</h2>
            <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-wider ${
              client.type === 'agencja' ? 'bg-violet-100 text-violet-700' :
              client.type === 'zakład' ? 'bg-amber-100 text-amber-700' :
              'bg-emerald-100 text-emerald-700'
            }`}>
              {client.type}
            </span>
          </div>
          <p className="text-slate-500 font-medium">
            Osoba kontaktowa: <span className="text-slate-800 font-bold">{client.contactPerson || 'Brak'}</span>
          </p>
          {client.nip && (
            <p className="text-slate-400 text-sm mt-1">
              NIP: <span className="text-slate-600 font-mono font-semibold">{client.nip}</span>
            </p>
          )}
        </div>
        <div className="text-sm text-slate-500 bg-slate-50 p-4 rounded-2xl md:text-right w-full md:w-auto">
          <p className="flex items-center gap-2 md:justify-end mb-1">
            <span>📞</span>
            <a href={`tel:${client.phone}`} className="hover:text-blue-600 font-bold">{client.phone || 'Brak'}</a>
          </p>
          <p className="flex items-center gap-2 md:justify-end">
            <span>✉️</span>
            <a href={`mailto:${client.email}`} className="hover:text-blue-600 font-bold">{client.email || 'Brak'}</a>
          </p>
          {(client.address?.street || client.address?.city || client.address?.zipCode) ? (
            <div className="mt-2 text-xs md:text-right leading-5">
              <span className="mr-1">📍</span>
              {[
                client.address.street && client.address.number
                  ? `${client.address.street} ${client.address.number}`
                  : client.address.street || '',
                client.address.zipCode && client.address.city
                  ? `${client.address.zipCode} ${client.address.city}`
                  : client.address.city || client.address.zipCode || '',
                client.address.province || '',
              ].filter(Boolean).join(', ')}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-400 md:text-right">📍 Brak adresu</p>
          )}
          {client.email && (
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => setShowEmailModal(true)}
                className="w-full bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-bold py-2.5 px-4 rounded-xl transition-colors text-xs flex items-center justify-center gap-2 shadow-sm"
              >
                <span className="text-base">📦</span> Wyślij ofertę produktów
              </button>
              <button
                onClick={handleGenerateEmail}
                className="w-full bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold py-2.5 px-4 rounded-xl transition-colors text-xs flex items-center justify-center gap-2 shadow-sm"
              >
                <span className="text-base">📝</span> Generuj maila z ofertą
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sekcja historii kontaktów */}
      <div className="mt-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-800">Historia Kontaktów</h3>
          <button
            onClick={() => { setShowAddForm(v => !v); setEditingId(null); }}
            className="bg-slate-900 hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
          >
            {showAddForm ? '✕ Anuluj' : '+ Dodaj notatkę z rozmowy'}
          </button>
        </div>

        {/* Formularz dodawania */}
        {showAddForm && (
          <InteractionForm
            initialData={emptyForm()}
            products={products}
            onSave={handleAddSave}
            onCancel={() => setShowAddForm(false)}
            saveLabel="Zapisz notatkę"
            withFollowUp
            clientId={client.id}
            clientName={client.companyName}
          />
        )}

        {/* Lista notatek */}
        {loading ? (
          <p className="text-slate-400 text-center py-8">Ładowanie historii...</p>
        ) : interactions.length === 0 ? (
          <div className="bg-slate-50 rounded-2xl p-8 text-center border border-slate-100 border-dashed">
            <span className="text-4xl block mb-3">📭</span>
            <p className="text-slate-500 font-medium">Brak wpisów w historii.</p>
          </div>
        ) : (
          <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
            {interactions.map(interaction => (
              <div key={interaction.id} className="relative flex items-start justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                {/* Ikona na osi czasu */}
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-blue-100 text-blue-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 text-xl mt-1">
                  {CHANNEL_ICON[interaction.channel] ?? '📌'}
                </div>

                {/* Karta notatki / Formularz edycji */}
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)]">
                  {editingId === interaction.id ? (
                    // ── TRYB EDYCJI ──
                    <InteractionForm
                      initialData={{
                        contactDate: interaction.contactDate,
                        channel: interaction.channel,
                        notes: interaction.notes,
                        tradeNotes: interaction.tradeNotes ?? '',
                        products: interaction.products ?? []
                      }}
                      products={products}
                      onSave={(data) => handleEditSave(interaction.id, data)}
                      onCancel={() => setEditingId(null)}
                      saveLabel="Zapisz zmiany"
                      withFollowUp
                      clientId={client.id}
                      clientName={client.companyName}
                    />
                  ) : (
                    // ── TRYB PODGLĄDU ──
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-black text-slate-800">{interaction.contactDate}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-400">Przez: {interaction.createdBy.split('@')[0]}</span>
                          <button
                            onClick={() => { setEditingId(interaction.id); setShowAddForm(false); }}
                            className="text-xs font-bold text-slate-400 hover:text-blue-600 transition-colors flex items-center gap-1"
                          >
                            ✎ Edytuj
                          </button>
                        </div>
                      </div>
                      <p className="text-slate-600 text-sm mb-3">{interaction.notes}</p>

                      {(interaction.tradeNotes || (interaction.products && interaction.products.length > 0)) && (
                        <div className="mt-4 pt-4 border-t border-slate-100 text-xs">
                          {interaction.tradeNotes && (
                            <p className="mb-2">
                              <span className="font-bold text-slate-500">💰 Ustalenia:</span> {interaction.tradeNotes}
                            </p>
                          )}
                          {interaction.products && interaction.products.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              <span className="font-bold text-slate-500 mr-1 mt-1">📦 Produkty:</span>
                              {interaction.products.map((p, i) => (
                                <span key={i} className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded border border-emerald-100">{p}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal wysyłki produktów */}
      {showEmailModal && (
        <ProductEmailModal
          client={client}
          products={products}
          onClose={() => setShowEmailModal(false)}
        />
      )}
    </div>
  );
};

export default ClientCard;
