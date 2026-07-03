import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Client, Interaction, InteractionFormData, Product, Order, FakturowniaInvoice,
  getClientInteractions, createClientInteraction, updateClientInteraction,
  getProductsList, createFollowUp, updateClient, getClients,
  fakturowniaLookup, openFakturowniaPdf
} from '../services/api';
import { zl, clientYearTotal, clientMonthTotal } from '../utils/sales';
import EmailSendModal from './EmailSendModal';

const colorClasses: Record<string, string> = {
  default: 'bg-canvas',
  lilac: 'bg-block-lilac',
  cream: 'bg-block-cream',
  pink: 'bg-block-gray',
  mint: 'bg-block-mint',
};

// Czytelne etykiety statusu faktury z Fakturowni
const fkStatusLabel = (s: string): string => ({
  paid: 'Zapłacona',
  partial: 'Częściowo',
  sent: 'Wysłana',
  issued: 'Wystawiona',
  rejected: 'Odrzucona',
}[s] || (s || '—'));

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
  onClientUpdated?: (c: Client) => void;
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
                  ? 'bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 animate-pulse'
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
            listening ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40' : 'border-hairline'
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
const todaySaleISO = () => new Date().toISOString().split('T')[0];
const parseAmount = (v: string): number => {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const ClientCard: React.FC<ClientCardProps> = ({ client, onClose, onClientUpdated }) => {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showEmailSendModal, setShowEmailSendModal] = useState(false);

  // Faktury z Fakturowni (migawka zapisana na kliencie)
  const [fkInvoices, setFkInvoices] = useState<FakturowniaInvoice[]>(client.fakturowniaInvoices ?? []);
  const [fkSyncedAt, setFkSyncedAt] = useState<string>(client.fakturowniaSyncedAt || '');
  const [fkLoading, setFkLoading] = useState(false);
  const [fkError, setFkError] = useState('');

  const handleFakturowniaSync = async () => {
    const nip = (client.nip || '').replace(/[-\s]/g, '');
    if (nip.length !== 10) { setFkError('Klient nie ma poprawnego NIP (wymagane 10 cyfr).'); return; }
    setFkLoading(true); setFkError('');
    try {
      const { client: fk, invoices } = await fakturowniaLookup(nip);
      const now = new Date().toISOString();
      // Uzupełniamy tylko brakujące dane kontaktowe — nie nadpisujemy istniejących
      const updated = await updateClient(client.id, {
        ...client,
        email: client.email || fk.email || '',
        phone: client.phone || fk.phone || '',
        contactPerson: client.contactPerson || fk.person || '',
        bankAccount: client.bankAccount || fk.bankAccount || '',
        fakturowniaInvoices: invoices,
        fakturowniaSyncedAt: now,
      });
      setFkInvoices(updated.fakturowniaInvoices ?? invoices);
      setFkSyncedAt(updated.fakturowniaSyncedAt || now);
      onClientUpdated?.(updated);
    } catch (e) {
      setFkError(e instanceof Error ? e.message : 'Błąd synchronizacji z Fakturownią');
    } finally {
      setFkLoading(false);
    }
  };

  const handleOpenPdf = async (id: number) => {
    try { await openFakturowniaPdf(id); }
    catch { alert('Nie udało się otworzyć PDF faktury.'); }
  };

  // Sprzedaż (zamówienia) — osadzona tablica na dokumencie klienta
  const [orders, setOrders] = useState<Order[]>(client.orders ?? []);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [saleAmount, setSaleAmount] = useState('');
  const [saleDate, setSaleDate] = useState(todaySaleISO());
  const [saleNote, setSaleNote] = useState('');
  const [savingSale, setSavingSale] = useState(false);

  const handleAddSale = async () => {
    const amount = parseAmount(saleAmount);
    if (amount <= 0) { alert('Podaj kwotę sprzedaży.'); return; }
    if (!saleDate) { alert('Podaj datę.'); return; }
    const newOrder: Order = {
      id: crypto.randomUUID(),
      amount,
      date: saleDate,
      note: saleNote.trim(),
    };
    const nextOrders = [...orders, newOrder];
    try {
      setSavingSale(true);
      const updated = await updateClient(client.id, {
        ...client,
        salesEnabled: true,
        orders: nextOrders,
      });
      setOrders(updated.orders ?? nextOrders);
      onClientUpdated?.(updated);
      setShowSaleForm(false);
      setSaleAmount(''); setSaleDate(todaySaleISO()); setSaleNote('');
    } catch {
      alert('Nie udało się zapisać sprzedaży.');
    } finally {
      setSavingSale(false);
    }
  };

  const handleDeleteSale = async (orderId: string) => {
    if (!window.confirm('Usunąć ten wpis sprzedaży?')) return;
    const nextOrders = orders.filter(o => o.id !== orderId);
    try {
      const updated = await updateClient(client.id, { ...client, orders: nextOrders });
      setOrders(updated.orders ?? nextOrders);
      onClientUpdated?.(updated);
    } catch {
      alert('Nie udało się usunąć wpisu.');
    }
  };

  const ordersTotal = orders.reduce((s, o) => s + (o.amount || 0), 0);

  // Udział % w globalnym obrocie (rok / miesiąc). Sumy pozostałych klientów
  // pobieramy raz; obrót bieżącego klienta liczymy z żywego `orders`, żeby
  // udział reagował na dodanie/usunięcie sprzedaży bez przeładowania.
  const [othersSales, setOthersSales] = useState<{ year: number; month: number } | null>(null);
  useEffect(() => {
    let active = true;
    getClients()
      .then(all => {
        if (!active) return;
        const others = all.filter(c => c.id !== client.id);
        setOthersSales({
          year: others.reduce((s, c) => s + clientYearTotal(c), 0),
          month: others.reduce((s, c) => s + clientMonthTotal(c), 0),
        });
      })
      .catch(() => active && setOthersSales({ year: 0, month: 0 }));
    return () => { active = false; };
  }, [client.id]);

  const liveClient = { ...client, orders } as Client;
  const myYear = clientYearTotal(liveClient);
  const myMonth = clientMonthTotal(liveClient);
  const globalYear = (othersSales?.year ?? 0) + myYear;
  const globalMonth = (othersSales?.month ?? 0) + myMonth;
  const shareYear = globalYear > 0 ? (myYear / globalYear) * 100 : 0;
  const shareMonth = globalMonth > 0 ? (myMonth / globalMonth) * 100 : 0;
  const pct = (n: number) =>
    n.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';

  // Wspólna oś czasu: notatki + sprzedaż, malejąco po dacie
  type TimelineItem =
    | { kind: 'interaction'; date: string; data: Interaction }
    | { kind: 'sale'; date: string; data: Order };
  const timeline: TimelineItem[] = [
    ...interactions.map(i => ({ kind: 'interaction' as const, date: i.contactDate, data: i })),
    ...orders.map(o => ({ kind: 'sale' as const, date: o.date, data: o })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

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
      <button onClick={onClose} className="mb-6 flex items-center gap-2 text-sm font-bold text-ink font-light hover:underline transition-colors bg-white/40 dark:bg-white/10 px-3 py-1.5 rounded-lg hover:bg-white/80 dark:hover:bg-white/20 w-max">
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
          {ordersTotal > 0 && (
            <div className="mt-3 bg-white/60 dark:bg-white/10 rounded-lg px-3 py-2 shadow-sm inline-block">
              <p className="text-[11px] uppercase tracking-wide text-ink/60 font-semibold mb-1">
                Udział w obrocie firmy
              </p>
              <div className="flex gap-4">
                <div title={`${zl(myYear)} z ${zl(globalYear)}`}>
                  <span className="text-xs text-ink/60">Rok&nbsp;</span>
                  <span className="text-base font-black text-ink">
                    {othersSales ? pct(shareYear) : '…'}
                  </span>
                </div>
                <div className="border-l border-hairline pl-4" title={`${zl(myMonth)} z ${zl(globalMonth)}`}>
                  <span className="text-xs text-ink/60">Mies.&nbsp;</span>
                  <span className="text-base font-black text-ink">
                    {othersSales ? pct(shareMonth) : '…'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="text-sm text-ink font-light bg-white/60 dark:bg-white/10 p-4 rounded-lg md:text-right w-full md:w-auto shadow-sm">
          <p className="flex items-center gap-2 md:justify-end mb-1">
            <span>📞</span>
            <a href={`tel:${client.phone}`} className="hover:underline font-bold">{client.phone || 'Brak'}</a>
          </p>
          {client.phone && (
            <a
              href={`tel:${client.phone}`}
              className="btn-primary flex items-center justify-center gap-2 mb-2 text-sm"
            >
              📞 Zadzwoń
            </a>
          )}
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
          {(client.nip || client.vatStatus || client.regon || client.bankAccount) && (
            <div className="mt-3 pt-3 border-t border-hairline-soft text-xs md:text-right space-y-1">
              {client.nip && <p><span className="text-ink/50">NIP:</span> <span className="font-mono">{client.nip}</span></p>}
              {client.vatStatus && (
                <p className="flex items-center gap-1.5 md:justify-end">
                  <span className="text-ink/50">VAT:</span>
                  <span className={`badge ${
                    client.vatStatus === 'Czynny' ? 'badge-mint'
                    : client.vatStatus === 'Zwolniony' ? 'badge-cream'
                    : 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300'
                  }`}>{client.vatStatus}</span>
                </p>
              )}
              {client.regon && <p><span className="text-ink/50">REGON:</span> <span className="font-mono">{client.regon}</span></p>}
              {client.bankAccount && <p className="break-all"><span className="text-ink/50">Konto:</span> <span className="font-mono">{client.bankAccount}</span></p>}
            </div>
          )}
          {client.email && (
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowEmailModal(true)}
                className="btn-secondary w-full text-body-sm bg-white dark:bg-surface-soft"
              >
                <span className="text-base">📦</span> Wyślij ofertę produktów
              </button>
              <button
                type="button"
                onClick={handleGenerateEmail}
                className="btn-secondary w-full text-body-sm bg-white dark:bg-surface-soft"
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

      {/* FAKTURY Z FAKTUROWNI (tylko odczyt) */}
      <div className="mt-8">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
          <h3 className="text-xl font-bold text-ink">Faktury (Fakturownia)</h3>
          <div className="flex items-center gap-3 flex-wrap">
            {fkSyncedAt && (
              <span className="text-caption text-ink/50">
                zsync.: {new Date(fkSyncedAt).toLocaleString('pl-PL')}
              </span>
            )}
            <button type="button" onClick={handleFakturowniaSync} disabled={fkLoading} className="btn-secondary text-body-sm">
              {fkLoading ? 'Synchronizuję…' : (fkSyncedAt ? '↻ Odśwież' : '⬇ Pobierz z Fakturowni')}
            </button>
          </div>
        </div>
        {fkError && <div className="alert-error mb-4">⚠️ {fkError}</div>}
        {fkInvoices.length === 0 ? (
          <div className="card-soft text-ink/60">
            Brak pobranych faktur. Kliknij „Pobierz z Fakturowni" (wymaga NIP na karcie). Przy okazji uzupełnimy brakujące dane kontaktowe (e-mail, telefon, osoba, konto).
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="text-left text-ink/50 border-b border-hairline">
                  <th className="py-2 pr-3 font-medium">Numer</th>
                  <th className="py-2 pr-3 font-medium">Data</th>
                  <th className="py-2 pr-3 font-medium text-right">Brutto</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {fkInvoices.map(inv => (
                  <tr key={inv.id} className="border-b border-hairline-soft">
                    <td className="py-2 pr-3 font-medium">{inv.number}</td>
                    <td className="py-2 pr-3 text-ink/70 whitespace-nowrap">{inv.issueDate}</td>
                    <td className="py-2 pr-3 text-right font-mono whitespace-nowrap">{inv.priceGross.toFixed(2)} {inv.currency}</td>
                    <td className="py-2 pr-3">
                      <span className={`badge ${inv.status === 'paid' ? 'badge-mint' : 'badge-cream'}`}>{fkStatusLabel(inv.status)}</span>
                    </td>
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => handleOpenPdf(inv.id)} className="btn-tertiary text-body-sm">PDF</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-caption text-ink/50 mt-2">
              Faktur: {fkInvoices.length} · suma brutto: {zl(fkInvoices.reduce((s, i) => s + i.priceGross, 0))}
            </p>
          </div>
        )}
      </div>

      <div className="mt-8">
        <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h3 className="text-xl font-bold text-ink">Historia Kontaktów</h3>
            {ordersTotal > 0 && (
              <span className="badge badge-mint shadow-sm">💰 Sprzedaż łącznie: {zl(ordersTotal)}</span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { setShowAddForm(v => !v); setEditingId(null); setShowSaleForm(false); }}
              className="btn-primary text-body-sm"
            >
              {showAddForm ? '✕ Anuluj' : '+ Dodaj notatkę z rozmowy'}
            </button>
            <button
              onClick={() => { setShowSaleForm(v => !v); setShowAddForm(false); setEditingId(null); }}
              className="btn-secondary text-body-sm bg-white dark:bg-surface-soft"
            >
              {showSaleForm ? '✕ Anuluj' : '💰 Dodaj sprzedaż'}
            </button>
          </div>
        </div>

        {showSaleForm && (
          <div className="color-block-mint mb-6 p-5 rounded-xl">
            <h4 className="font-bold text-ink mb-4">💰 Nowa sprzedaż</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="eyebrow block mb-2">Kwota (zł netto)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={saleAmount}
                  onChange={e => setSaleAmount(e.target.value)}
                  placeholder="np. 1500"
                  className="input-field bg-white dark:bg-surface-soft"
                  autoFocus
                />
              </div>
              <div>
                <label className="eyebrow block mb-2">Data</label>
                <input
                  type="date"
                  value={saleDate}
                  onChange={e => setSaleDate(e.target.value)}
                  className="input-field bg-white dark:bg-surface-soft"
                />
              </div>
              <div>
                <label className="eyebrow block mb-2">Uwagi (opcjonalnie)</label>
                <input
                  type="text"
                  value={saleNote}
                  onChange={e => setSaleNote(e.target.value)}
                  placeholder="np. zamówienie hurtowe"
                  className="input-field bg-white dark:bg-surface-soft"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleAddSale} disabled={savingSale} className="btn-primary text-body-sm disabled:opacity-50">
                {savingSale ? 'Zapisywanie...' : 'Zapisz sprzedaż'}
              </button>
              <button onClick={() => setShowSaleForm(false)} className="btn-tertiary text-body-sm bg-white dark:bg-surface-soft">
                Anuluj
              </button>
            </div>
          </div>
        )}

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
        ) : timeline.length === 0 ? (
          <div className="bg-white/40 dark:bg-white/5 rounded-lg p-8 text-center border border-hairline-soft border-dashed">
            <span className="text-4xl block mb-3">📭</span>
            <p className="text-ink font-light font-medium">Brak wpisów w historii.</p>
          </div>
        ) : (
          <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-hairline before:to-transparent">
            {timeline.map(item => item.kind === 'sale' ? (
              <div key={`sale-${item.data.id}`} className="relative flex items-start justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-canvas bg-block-mint text-ink shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 text-xl mt-1">
                  💰
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)]">
                  <div className="bg-block-mint p-5 rounded-lg border border-hairline shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-black text-ink">{item.data.date}</span>
                      <button
                        onClick={() => handleDeleteSale(item.data.id)}
                        className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline transition-colors"
                      >
                        Usuń
                      </button>
                    </div>
                    <p className="text-2xl font-black text-ink">{zl(item.data.amount)}</p>
                    {item.data.note && (
                      <p className="text-ink font-light text-sm mt-2">📝 {item.data.note}</p>
                    )}
                    <span className="badge badge-cream text-[10px] mt-2 inline-block">Sprzedaż</span>
                  </div>
                </div>
              </div>
            ) : (
              <div key={item.data.id} className="relative flex items-start justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-canvas bg-block-lilac text-ink shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 text-xl mt-1">
                  {CHANNEL_ICON[item.data.channel] ?? '📌'}
                </div>

                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)]">
                  {editingId === item.data.id ? (
                    <InteractionForm
                      initialData={{
                        contactDate: item.data.contactDate,
                        channel: item.data.channel,
                        notes: item.data.notes,
                        tradeNotes: item.data.tradeNotes ?? '',
                        products: item.data.products ?? []
                      }}
                      products={products}
                      onSave={(data) => handleEditSave(item.data.id, data)}
                      onCancel={() => setEditingId(null)}
                      saveLabel="Zapisz zmiany"
                      withFollowUp
                      clientId={client.id}
                      clientName={client.companyName}
                    />
                  ) : (
                    <div className="bg-canvas p-5 rounded-lg border border-hairline shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-black text-ink">{item.data.contactDate}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-ink font-light">Przez: {item.data.createdBy.split('@')[0]}</span>
                          <button
                            onClick={() => { setEditingId(item.data.id); setShowAddForm(false); }}
                            className="text-xs font-bold text-ink font-light hover:underline transition-colors flex items-center gap-1"
                          >
                            ✎ Edytuj
                          </button>
                        </div>
                      </div>
                      <p className="text-ink font-light text-sm mb-3">{item.data.notes}</p>

                      {(item.data.tradeNotes || (item.data.products && item.data.products.length > 0)) && (
                        <div className="mt-4 pt-4 border-t border-hairline-soft text-xs">
                          {item.data.tradeNotes && (
                            <p className="mb-2">
                              <span className="font-bold text-ink font-light">💰 Ustalenia:</span> {item.data.tradeNotes}
                            </p>
                          )}
                          {item.data.products && item.data.products.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              <span className="font-bold text-ink font-light mr-1 mt-1">📦 Produkty:</span>
                              {item.data.products.map((p, i) => (
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