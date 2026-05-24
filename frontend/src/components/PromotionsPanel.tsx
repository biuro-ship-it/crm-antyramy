import React, { useState, useEffect } from 'react';
import {
  Client, Product,
  getClients, getProductsList,
  sendPromotion, previewPromotionPdf,
  PromotionSendResult,
} from '../services/api';

type Step = 1 | 2 | 3;

const INITIAL_SUBJECT = 'Nowa oferta — Antyramy';

const PromotionsPanel: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<Step>(1);

  // Krok 1 — wybór produktów
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());

  // Krok 2 — wybór klientów
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [clientSearch, setClientSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | 'zakład' | 'sklep' | 'agencja' | 'inne'>('');

  // Krok 3 — treść
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState(INITIAL_SUBJECT);
  const [content, setContent] = useState('');

  // Stan wysyłki
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult] = useState<PromotionSendResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getClients(), getProductsList()])
      .then(([c, p]) => { setClients(c); setProducts(p); })
      .catch(() => setError('Błąd wczytywania danych'))
      .finally(() => setLoading(false));
  }, []);

  const toggleProduct = (id: string) =>
    setSelectedProducts(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleClient = (id: string) =>
    setSelectedClients(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const filteredClients = clients.filter(c => {
    const q = clientSearch.toLowerCase();
    const matchName = c.companyName.toLowerCase().includes(q) || (c.address?.city || '').toLowerCase().includes(q);
    const matchType = !typeFilter || c.type === typeFilter;
    return matchName && matchType;
  });

  const allVisible = filteredClients.length > 0 && filteredClients.every(c => selectedClients.has(c.id));

  const toggleAllVisible = () => {
    setSelectedClients(prev => {
      const n = new Set(prev);
      if (allVisible) filteredClients.forEach(c => n.delete(c.id));
      else filteredClients.forEach(c => n.add(c.id));
      return n;
    });
  };

  const chosenProducts = products.filter(p => selectedProducts.has(p.id));
  const chosenClients = clients.filter(c => selectedClients.has(c.id));
  const recipientsWithEmail = chosenClients.filter(c => c.email);

  const canGoStep2 = selectedProducts.size > 0;
  const canGoStep3 = selectedClients.size > 0;
  const canSend = title.trim() && content.trim() && recipientsWithEmail.length > 0 && !sending;

  const handlePreviewPdf = async () => {
    if (!title.trim() || !content.trim()) {
      setError('Uzupełnij tytuł i treść przed podglądem');
      return;
    }
    setPreviewing(true);
    setError('');
    try {
      await previewPromotionPdf(title, content, [...selectedProducts]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setError('');
    setResult(null);
    try {
      const res = await sendPromotion({
        title,
        subject,
        content,
        productIds: [...selectedProducts],
        clientIds: [...selectedClients],
      });
      setResult(res);
      if (res.sent > 0) {
        setSelectedProducts(new Set());
        setSelectedClients(new Set());
        setTitle('');
        setSubject(INITIAL_SUBJECT);
        setContent('');
        setStep(1);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-32 text-ink font-light">Wczytywanie...</div>
  );

  return (
    <div className="max-w-6xl mx-auto">

      {/* Nagłówek */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-ink tracking-tight">Wysyłka promocji</h2>
        <p className="text-ink font-light mt-1 text-sm">Wybierz produkty, klientów i treść — backend wyśle maile z PDF i zapisze historię kontaktów.</p>
      </div>

      {/* Pasek kroków */}
      <div className="flex items-center gap-0 mb-8 bg-surface-soft rounded-xl p-1">
        {([
          { n: 1 as Step, label: 'Produkty', sub: `${selectedProducts.size} wybranych` },
          { n: 2 as Step, label: 'Odbiorcy', sub: `${selectedClients.size} wybranych` },
          { n: 3 as Step, label: 'Treść i wysyłka', sub: recipientsWithEmail.length > 0 ? `${recipientsWithEmail.length} z emailem` : '' },
        ] as const).map(({ n, label, sub }) => (
          <button
            key={n}
            onClick={() => { if (n === 2 && !canGoStep2) return; if (n === 3 && !canGoStep3) return; setStep(n); }}
            className={`flex-1 flex flex-col items-center py-3 px-4 rounded-lg transition-all text-sm font-medium ${
              step === n
                ? 'bg-canvas shadow-sm text-ink'
                : 'text-ink font-light hover:text-ink'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${
                step === n ? 'bg-primary text-on-primary' : 'bg-hairline text-ink font-light'
              }`}>{n}</span>
              {label}
            </span>
            {sub && <span className="text-xs text-ink font-light mt-0.5">{sub}</span>}
          </button>
        ))}
      </div>

      {/* ===== KROK 1 — PRODUKTY ===== */}
      {step === 1 && (
        <div>
          {products.length === 0 ? (
            <div className="text-center py-16 text-ink font-light">
              <p className="font-medium">Brak produktów w katalogu</p>
              <p className="text-sm mt-1">Dodaj produkty w zakładce Produkty</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
              {products.map(p => {
                const selected = selectedProducts.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleProduct(p.id)}
                    className={`text-left rounded-xl border-2 overflow-hidden transition-all ${
                      selected
                        ? 'border-ink '
                        : 'border-hairline hover:border-hairline'
                    }`}
                  >
                    <div className="aspect-square bg-surface-soft overflow-hidden relative">
                      {p.imageUrl
                        ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-ink font-light opacity-50 text-xs">brak zdjęcia</div>
                      }
                      {selected && (
                        <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                          <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-semibold text-ink text-sm leading-tight line-clamp-2">{p.name}</p>
                      {p.code && <p className="text-xs text-ink font-light mt-0.5">{p.code}</p>}
                      {p.priceNetto > 0 && (
                        <p className="text-sm font-bold text-ink mt-1">{p.priceNetto.toFixed(2)} zł</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex justify-between items-center">
            <p className="text-sm text-ink font-light">
              {selectedProducts.size > 0
                ? `Wybrano ${selectedProducts.size} z ${products.length} produktów`
                : 'Kliknij produkt aby go wybrać'}
            </p>
            <button
              onClick={() => setStep(2)}
              disabled={!canGoStep2}
              className="px-6 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-colors"
            >
              Dalej: wybór odbiorców
            </button>
          </div>
        </div>
      )}

      {/* ===== KROK 2 — ODBIORCY ===== */}
      {step === 2 && (
        <div>
          <div className="flex gap-3 mb-4">
            <input
              type="text"
              placeholder="Szukaj po nazwie lub mieście..."
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              className="flex-1 border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ink focus:ring-1 focus:ring-ink"
            />
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
              className="border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ink bg-canvas"
            >
              <option value="">Wszystkie typy</option>
              <option value="zakład">Zakład</option>
              <option value="sklep">Sklep</option>
              <option value="agencja">Agencja</option>
              <option value="inne">Inne</option>
            </select>
          </div>

          <div className="bg-canvas border border-hairline rounded-xl overflow-hidden mb-6">
            {/* Nagłówek tabeli */}
            <div className="flex items-center gap-3 px-4 py-3 bg-surface-soft border-b border-hairline">
              <input
                type="checkbox"
                checked={allVisible}
                onChange={toggleAllVisible}
                className="rounded border-hairline text-ink"
              />
              <span className="text-xs font-semibold text-ink font-light uppercase tracking-wide">
                {filteredClients.length} firm{filteredClients.length === 1 ? 'a' : ''}
                {clientSearch || typeFilter ? ' (przefiltrowanych)' : ''}
              </span>
            </div>

            {/* Lista */}
            <div className="divide-y divide-hairline-soft max-h-96 overflow-y-auto">
              {filteredClients.length === 0 ? (
                <p className="text-sm text-ink font-light px-4 py-6">Brak wyników</p>
              ) : filteredClients.map(c => {
                const selected = selectedClients.has(c.id);
                const hasEmail = !!c.email;
                return (
                  <label key={c.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${selected ? 'bg-block-lilac' : 'hover:bg-surface-soft'}`}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleClient(c.id)}
                      className="rounded border-hairline text-ink shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-ink text-sm truncate">{c.companyName}</p>
                      <p className="text-xs text-ink font-light truncate">
                        {c.type} {c.address?.city ? `· ${c.address.city}` : ''}
                        {c.email ? ` · ${c.email}` : ''}
                      </p>
                    </div>
                    {!hasEmail && (
                      <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full shrink-0">brak e-mail</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {selectedClients.size > 0 && (
            <div className="bg-block-lilac border border-hairline rounded-lg px-4 py-3 mb-6 text-sm text-ink">
              Wybrano <strong>{selectedClients.size}</strong> klientów,
              z czego <strong>{recipientsWithEmail.length}</strong> ma adres email (do nich trafi mail).
              {selectedClients.size !== recipientsWithEmail.length && (
                <span className="text-amber-700"> {selectedClients.size - recipientsWithEmail.length} bez emaila zostanie pominięte.</span>
              )}
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="px-6 py-2.5 border border-hairline text-ink text-sm font-medium rounded-lg hover:bg-surface-soft transition-colors">
              Wstecz
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!canGoStep3}
              className="px-6 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-colors"
            >
              Dalej: treść maila
            </button>
          </div>
        </div>
      )}

      {/* ===== KROK 3 — TREŚĆ I WYSYŁKA ===== */}
      {step === 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

          {/* Formularz — lewa strona */}
          <div className="lg:col-span-3 space-y-5">
            <div>
              <label className="block text-xs font-semibold text-ink font-light uppercase tracking-wide mb-1.5">Tytuł oferty (na PDF)</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="np. Wiosenna promocja ram drewnianych"
                className="w-full border border-hairline rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ink focus:ring-1 focus:ring-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink font-light uppercase tracking-wide mb-1.5">Temat maila</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full border border-hairline rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ink focus:ring-1 focus:ring-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink font-light uppercase tracking-wide mb-1.5">Treść maila</label>
              <textarea
                rows={9}
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Szanowni Państwo,&#10;&#10;Z przyjemnością informujemy o naszej aktualnej ofercie..."
                className="w-full border border-hairline rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ink focus:ring-1 focus:ring-ink resize-none font-sans"
              />
              <p className="text-xs text-ink font-light mt-1">Treść pojawi się zarówno w mailu jak i w PDF.</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {result && (
              <div className={`rounded-lg px-4 py-3 text-sm ${result.failed.length === 0 ? 'bg-block-mint border border-hairline text-ink' : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
                <p className="font-semibold">
                  Wysłano {result.sent} z {result.total} maili.
                </p>
                {result.failed.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {result.failed.map(f => (
                      <li key={f.email} className="text-xs">{f.email}: {f.error}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <button onClick={() => setStep(2)} className="px-5 py-2.5 border border-hairline text-ink text-sm font-medium rounded-lg hover:bg-surface-soft transition-colors">
                Wstecz
              </button>
              <button
                onClick={handlePreviewPdf}
                disabled={previewing || !title.trim() || !content.trim()}
                className="px-5 py-2.5 border border-hairline text-ink text-sm font-medium rounded-lg hover:bg-surface-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {previewing ? 'Generuję...' : 'Podgląd PDF'}
              </button>
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="px-6 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-colors"
              >
                {sending
                  ? 'Wysyłam...'
                  : `Wyślij do ${recipientsWithEmail.length} odbiorców`}
              </button>
            </div>
          </div>

          {/* Podsumowanie — prawa strona */}
          <div className="lg:col-span-2">
            <div className="bg-surface-soft rounded-xl border border-hairline p-5 sticky top-4">
              <h3 className="text-sm font-semibold text-ink mb-4">Podsumowanie kampanii</h3>

              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-ink font-light uppercase tracking-wide mb-2">Produkty ({chosenProducts.length})</p>
                  <div className="space-y-1">
                    {chosenProducts.map(p => (
                      <div key={p.id} className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-canvas rounded border border-hairline overflow-hidden shrink-0">
                          {p.imageUrl
                            ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full bg-surface-soft" />
                          }
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-ink truncate">{p.name}</p>
                          {p.priceNetto > 0 && <p className="text-xs text-ink">{p.priceNetto.toFixed(2)} zł</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-hairline pt-4">
                  <p className="text-xs font-semibold text-ink font-light uppercase tracking-wide mb-2">Odbiorcy</p>
                  <p className="text-sm text-ink"><span className="font-bold">{recipientsWithEmail.length}</span> firm z adresem email</p>
                  {chosenClients.length !== recipientsWithEmail.length && (
                    <p className="text-xs text-amber-600 mt-0.5">{chosenClients.length - recipientsWithEmail.length} bez emaila</p>
                  )}
                </div>

                <div className="border-t border-hairline pt-4">
                  <p className="text-xs font-semibold text-ink font-light uppercase tracking-wide mb-2">Co wyślemy</p>
                  <ul className="space-y-1 text-xs text-ink font-light">
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-block-lilac0 rounded-full"></span>
                      Mail HTML z tabelą produktów
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-block-lilac0 rounded-full"></span>
                      PDF z logo, treścią i zdjęciami
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-block-lilac0 rounded-full"></span>
                      Wpis w historii każdego klienta
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PromotionsPanel;
