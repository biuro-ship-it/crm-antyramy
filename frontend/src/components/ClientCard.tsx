import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Client, Interaction, InteractionFormData, Product,
  getClientInteractions, createClientInteraction, updateClientInteraction,
  getProductsList, createFollowUp
} from '../services/api';
import EmailSendModal from './EmailSendModal';

const colorClasses: Record<string, string> = {
  default: 'bg-canvas',
  lilac: 'bg-block-lilac',
  cream: 'bg-block-cream',
  pink: 'bg-block-pink',
  mint: 'bg-block-mint',
};

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
    window.open(`mailto:${client.email}?subject=${subject}&body=${body}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-canvas rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        <div className="flex justify-between items-center px-6 py-4 border-b border-hairline-soft">
          <h3 className="text-lg font-bold text-ink">
            {step === 'select' ? '📦 Wybierz produkty do wysyłki' : '✉️ Podgląd i edycja e-maila'}
          </h3>
          <button onClick={onClose} className="text-ink font-light hover:text-ink text-2xl leading-none">✕</button>
        </div>

        {step === 'select' && (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              {products.length === 0 ? (
                <p className="text-ink font-light text-center py-8">Brak produktów w bazie. Dodaj je w zakładce Produkty.</p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {products.map(p => {
                    const isSelected = selected.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleProduct(p.id)}
                        className={`text-left rounded-lg border-2 overflow-hidden transition-all ${isSelected ? 'border-ink ' : 'border-hairline hover:border-hairline'}`}
                      >
                        {p.imageUrl
                          ? <img src={p.imageUrl} alt={p.name} className="w-full h-28 object-cover" />
                          : <div className="w-full h-28 bg-surface-soft flex items-center justify-center text-3xl">📦</div>
                        }
                        <div className="p-3">
                          <div className="flex justify-between items-start gap-2">
                            <p className="font-bold text-ink text-sm leading-tight">{p.name}</p>
                            {isSelected && <span className="text-ink text-lg shrink-0">✓</span>}
                          </div>
                          {p.code && <p className="text-xs text-ink font-light font-mono mt-0.5">{p.code}</p>}
                          {p.priceNetto > 0 && (
                            <p className="text-sm font-black text-ink mt-1">{p.priceNetto.toFixed(2)} zł</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-hairline-soft flex justify-between items-center">
              <span className="text-sm text-ink font-light">
                {selected.size > 0 ? `Wybrano: ${selected.size} ${selected.size === 1 ? 'produkt' : 'produktów'}` : 'Zaznacz produkty do wysyłki'}
              </span>
              <button
                onClick={handleGoToPreview}
                disabled={selected.size === 0}
                className="btn-primary disabled:opacity-40"
              >
                Dalej — podgląd →
              </button>
            </div>
          </>
        )}

        {step === 'preview' && (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              <p className="text-xs text-ink font-light mb-2 font-bold uppercase">Do: {client.email}</p>
              <p className="text-xs text-ink font-light mb-4">Treść e-maila — możesz ją edytować przed wysłaniem:</p>
              <textarea
                value={emailBody}
                onChange={e => setEmailBody(e.target.value)}
                rows={16}
                className="w-full border border-hairline rounded-xl p-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ink resize-none font-mono leading-relaxed"
              />
            </div>
            <div className="px-6 py-4 border-t border-hairline-soft flex justify-between items-center">
              <button onClick={() => setStep('select')}
                className="text-ink font-light hover:text-ink font-semibold text-sm flex items-center gap-1">
                ← Wróć do wyboru
              </button>
              <button
                onClick={handleSend}
                className="btn-primary"
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

interface InteractionFormProps {
  initialData: InteractionFormData;
  products: Product[];
  onSave: (data: InteractionFormData) => Promise<void>;
  onCancel: () => void;
  saveLabel: string;
  withFollowUp?: boolean;
  clientId?: string;
  clientName?: string;
}

type AnySpeechRecognition = any;

const useSpeechRecognition = (onResult: (text: string) => void) => {
  const recognitionRef = useRef<AnySpeechRecognition>(null);
  const [listening, setListening] = useState(false);
  const [supported] = useState(() =>
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  );

  const start = useCallback(() => {
    if (!supported) return;
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    const rec: AnySpeechRecognition = new SR();
    rec.lang = 'pl-PL';
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e: AnySpeechRecognition) => {
      const transcript = Array.from(e.results as AnySpeechRecognition[])
        .map((r: AnySpeechRecognition) => r[0].transcript as string)
        .join(' ');
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
    <form onSubmit={handleSubmit} className="color-block-lilac mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="text-xs font-bold text-ink font-light uppercase ml-1">Data kontaktu</label>
          <input type="date" required
            className="input-field"
            value={data.contactDate}
            onChange={e => setData({ ...data, contactDate: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-bold text-ink font-light uppercase ml-1">Forma kontaktu</label>
          <select
            className="input-field"
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
          <label className="text-xs font-bold text-ink font-light uppercase ml-1">Przebieg rozmowy (Notatki)</label>
          {speechSupported && (
            <button
              type="button"
              onClick={listening ? stopSpeech : startSpeech}
              title={listening ? 'Zatrzymaj nagrywanie' : 'Dyktuj głosem'}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                listening
                  ? 'bg-red-100 text-red-600 animate-pulse'
                  : 'bg-surface-soft text-ink font-light hover:bg-block-lilac hover:underline'
              }`}
            >
              <span>{listening ? '⏹' : '🎙️'}</span>
              {listening ? 'Nagrywam...' : 'Dyktuj'}
            </button>
          )}
        </div>
        <textarea required rows={3}
          className={`w-full bg-canvas border rounded-xl p-3 outline-none focus:ring-2 focus:ring-ink resize-none transition-colors ${
            listening ? 'border-red-300 bg-red-50' : 'border-hairline'
          }`}
          placeholder="O czym rozmawialiście?"
          value={data.notes}
          onChange={e => setData({ ...data, notes: e.target.value })} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="text-xs font-bold text-ink font-light uppercase ml-1">Ustalenia Cenowe / Rabaty</label>
          <textarea rows={3}
            className="w-full bg-canvas border border-hairline rounded-xl p-3 outline-none focus:ring-2 focus:ring-ink resize-none"
            placeholder="Np. Rabat 10%..."
            value={data.tradeNotes}
            onChange={e => setData({ ...data, tradeNotes: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-bold text-ink font-light uppercase ml-1 mb-2 block">Zainteresowany Produktami</label>
          <div className="bg-canvas border border-hairline rounded-xl p-3 max-h-[100px] overflow-y-auto space-y-2">
            {products.length === 0
              ? <p className="text-xs text-ink font-light">Brak produktów...</p>
              : products.map(p => (
                <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-surface-soft p-1 rounded">
                  <input type="checkbox"
                    checked={data.products.includes(p.name)}
                    onChange={() => handleProductToggle(p.name)}
                    className="rounded text-ink focus:ring-ink" />
                  <span className="text-ink">{p.name}</span>
                </label>
              ))
            }
          </div>
        </div>
      </div>

      {withFollowUp && (
        <div className="mt-4 pt-4 border-t border-hairline">
          <label className="flex items-center gap-2 cursor-pointer font-medium text-ink mb-4 select-none">
            <input type="checkbox" checked={planFollowUp}
              onChange={e => setPlanFollowUp(e.target.checked)}
              className="w-5 h-5 rounded focus:ring-ink" />
            ⏰ Zaplanuj kolejny kontakt
          </label>
          {planFollowUp && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-canvas p-4 rounded-md border border-hairline">
              <div className="col-span-1">
                <label className="text-xs font-bold text-ink font-light uppercase ml-1">Kiedy zadzwonić?</label>
                <input type="date" required={planFollowUp}
                  className="w-full mt-1 border border-hairline rounded-lg p-2 outline-none focus:ring-2 focus:ring-ink"
                  value={followUpData.dueDate}
                  onChange={e => setFollowUpData({ ...followUpData, dueDate: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-bold text-ink font-light uppercase ml-1">Notatka dla przypomnienia</label>
                <input type="text" placeholder="O co zapytać przy kolejnym kontakcie?"
                  className="w-full mt-1 border border-hairline rounded-lg p-2 outline-none focus:ring-2 focus:ring-ink"
                  value={followUpData.reminderText}
                  onChange={e => setFollowUpData({ ...followUpData, reminderText: e.target.value })} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3 mt-6">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Anuluj
        </button>
        <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
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
  const [showEmailSendModal, setShowEmailSendModal] = useState(false);

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

  const handleAddSave = async (data: InteractionFormData) => {
    const newInteraction = await createClientInteraction(client.id, data);
    setInteractions(prev => [newInteraction, ...prev]);
    setShowAddForm(false);
  };

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
    window.open(`mailto:${client.email}?subject=${subject}&body=${body}`);
  };

  // Karta przyjmuje kolor, który ustawiłeś dla tego klienta w formularzu edycji
  const cardBgClass = colorClasses[client.relationshipColor || 'default'] || colorClasses.default;

  return (
    <div className={`card-padded transition-colors ${cardBgClass}`}>
      <button onClick={onClose} className="mb-6 flex items-center gap-2 text-sm font-bold text-ink font-light hover:underline transition-colors bg-white/40 px-3 py-1.5 rounded-lg hover:bg-white/80 w-max">
        <span>←</span> Wróć do listy klientów
      </button>

      <div className="flex flex-col md:flex-row justify-between items-start border-b border-hairline-soft pb-6 mb-6 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-3xl font-black text-ink">{client.companyName}</h2>
            <span className={`badge shadow-sm ${
              client.type === 'agencja' ? 'badge-lilac' :
              client.type === 'zakład' ? 'badge-cream' :
              'badge-mint'
            }`}>
              {client.type}
            </span>
          </div>
          <p className="text-ink font-light font-medium">
            Osoba kontaktowa: <span className="text-ink font-bold">{client.contactPerson || 'Brak'}</span>
          </p>
          {client.nip && (
            <p className="text-ink font-light text-sm mt-1">
              NIP: <span className="text-ink font-light font-mono font-semibold">{client.nip}</span>
            </p>
          )}
        </div>
        <div className="text-sm text-ink font-light bg-white/60 p-4 rounded-lg md:text-right w-full md:w-auto shadow-sm">
          <p className="flex items-center gap-2 md:justify-end mb-1">
            <span>📞</span>
            <a href={`tel:${client.phone}`} className="hover:underline font-bold">{client.phone || 'Brak'}</a>
          </p>
          <p className="flex items-center gap-2 md:justify-end">
            <span>✉️</span>
            <a href={`mailto:${client.email}`} className="hover:underline font-bold">{client.email || 'Brak'}</a>
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
            <p className="mt-2 text-xs text-ink font-light md:text-right">📍 Brak adresu</p>
          )}
          {client.email && (
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowEmailModal(true)}
                className="btn-secondary w-full text-body-sm bg-white"
              >
                <span className="text-base">📦</span> Wyślij ofertę produktów
              </button>
              <button
                type="button"
                onClick={handleGenerateEmail}
                className="btn-secondary w-full text-body-sm bg-white"
              >
                <span className="text-base">📝</span> Generuj maila z ofertą
              </button>
              <button
                type="button"
                onClick={() => setShowEmailSendModal(true)}
                className="btn-primary w-full text-body-sm"
              >
                <span className="text-base">📋</span> Wyślij mail z szablonu
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-ink">Historia Kontaktów</h3>
          <button
            onClick={() => { setShowAddForm(v => !v); setEditingId(null); }}
            className="btn-primary text-body-sm"
          >
            {showAddForm ? '✕ Anuluj' : '+ Dodaj notatkę z rozmowy'}
          </button>
        </div>

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

        {loading ? (
          <p className="text-ink font-light text-center py-8">Ładowanie historii...</p>
        ) : interactions.length === 0 ? (
          <div className="bg-white/40 rounded-lg p-8 text-center border border-hairline-soft border-dashed">
            <span className="text-4xl block mb-3">📭</span>
            <p className="text-ink font-light font-medium">Brak wpisów w historii.</p>
          </div>
        ) : (
          <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-hairline before:to-transparent">
            {interactions.map(interaction => (
              <div key={interaction.id} className="relative flex items-start justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-canvas bg-block-lilac text-ink shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 text-xl mt-1">
                  {CHANNEL_ICON[interaction.channel] ?? '📌'}
                </div>

                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)]">
                  {editingId === interaction.id ? (
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
                    <div className="bg-canvas p-5 rounded-lg border border-hairline shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-black text-ink">{interaction.contactDate}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-ink font-light">Przez: {interaction.createdBy.split('@')[0]}</span>
                          <button
                            onClick={() => { setEditingId(interaction.id); setShowAddForm(false); }}
                            className="text-xs font-bold text-ink font-light hover:underline transition-colors flex items-center gap-1"
                          >
                            ✎ Edytuj
                          </button>
                        </div>
                      </div>
                      <p className="text-ink font-light text-sm mb-3">{interaction.notes}</p>

                      {(interaction.tradeNotes || (interaction.products && interaction.products.length > 0)) && (
                        <div className="mt-4 pt-4 border-t border-hairline-soft text-xs">
                          {interaction.tradeNotes && (
                            <p className="mb-2">
                              <span className="font-bold text-ink font-light">💰 Ustalenia:</span> {interaction.tradeNotes}
                            </p>
                          )}
                          {interaction.products && interaction.products.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              <span className="font-bold text-ink font-light mr-1 mt-1">📦 Produkty:</span>
                              {interaction.products.map((p, i) => (
                                <span key={i} className="badge-mint">{p}</span>
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

      {showEmailModal && (
        <ProductEmailModal
          client={client}
          products={products}
          onClose={() => setShowEmailModal(false)}
        />
      )}

      {showEmailSendModal && (
        <EmailSendModal
          client={client}
          onClose={() => setShowEmailSendModal(false)}
        />
      )}
    </div>
  );
};

export default ClientCard;