import React, { useState, useEffect } from 'react';
import {
  Client, Product,
  getClients, getProductsList, createClientInteraction
} from '../services/api';

const PromotionsPanel: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Zaznaczenia
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());

  // Filtr klientów
  const [clientFilter, setClientFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | 'sklep' | 'zakład' | 'agencja'>('');

  // Treść promocji
  const [message, setMessage] = useState('');

  // Wysyłanie
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: number; fail: number } | null>(null);

  useEffect(() => {
    Promise.all([getClients(), getProductsList()])
      .then(([c, p]) => { setClients(c); setProducts(p); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggleProduct = (id: string) =>
    setSelectedProducts(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleClient = (id: string) =>
    setSelectedClients(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const filteredClients = clients.filter(c => {
    const matchName = c.companyName.toLowerCase().includes(clientFilter.toLowerCase());
    const matchType = !typeFilter || c.type === typeFilter;
    return matchName && matchType;
  });

  const allFilteredSelected = filteredClients.length > 0 &&
    filteredClients.every(c => selectedClients.has(c.id));

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedClients(prev => {
        const n = new Set(prev);
        filteredClients.forEach(c => n.delete(c.id));
        return n;
      });
    } else {
      setSelectedClients(prev => {
        const n = new Set(prev);
        filteredClients.forEach(c => n.add(c.id));
        return n;
      });
    }
  };

  const chosenProducts = products.filter(p => selectedProducts.has(p.id));

  const handleSend = async () => {
    if (!message.trim()) { alert('Wpisz treść promocji'); return; }
    if (selectedClients.size === 0) { alert('Zaznacz przynajmniej jednego klienta'); return; }
    if (selectedProducts.size === 0) { alert('Zaznacz przynajmniej jeden produkt'); return; }

    setSending(true);
    setResult(null);
    let ok = 0, fail = 0;

    const today = new Date().toISOString().split('T')[0];
    const productNames = chosenProducts.map(p => p.name);

    const targets = clients.filter(c => selectedClients.has(c.id));

    for (const client of targets) {
      try {
        await createClientInteraction(client.id, {
          contactDate: today,
          channel: 'inne',
          notes: message,
          tradeNotes: '',
          products: productNames,
        });
        ok++;
      } catch {
        fail++;
      }
    }

    setSending(false);
    setResult({ ok, fail });
    if (ok > 0) {
      // Wyczyść zaznaczenia po udanym wysłaniu
      setSelectedClients(new Set());
      setSelectedProducts(new Set());
      setMessage('');
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-400 text-lg">
      Ładowanie danych...
    </div>
  );

  return (
    <div className="animate-in slide-in-from-top-4">
      <div className="mb-6">
        <h2 className="text-3xl font-extrabold text-slate-900">📢 Panel Promocji</h2>
        <p className="text-slate-500 mt-1">Zaznacz produkty, wybierz klientów i wyślij promocję — trafi do historii kontaktów każdego klienta.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* KROK 1 — Wybierz produkty */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-black text-slate-800 text-lg mb-4 flex items-center gap-2">
            <span className="w-7 h-7 bg-blue-600 text-white text-sm rounded-full flex items-center justify-center font-black">1</span>
            Wybierz produkty
          </h3>
          {products.length === 0
            ? <p className="text-slate-400 text-sm">Brak produktów. Dodaj je w zakładce Produkty.</p>
            : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {products.map(p => (
                  <label key={p.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${selectedProducts.has(p.id) ? 'bg-blue-50 border-blue-200' : 'border-transparent hover:bg-slate-50'}`}>
                    <input
                      type="checkbox"
                      checked={selectedProducts.has(p.id)}
                      onChange={() => toggleProduct(p.id)}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{p.name}</p>
                      {p.code && <p className="text-xs text-slate-400">{p.code}</p>}
                    </div>
                    {p.priceNetto > 0 && (
                      <span className="text-xs font-bold text-emerald-600 whitespace-nowrap">{p.priceNetto.toFixed(2)} zł</span>
                    )}
                  </label>
                ))}
              </div>
            )
          }
          {selectedProducts.size > 0 && (
            <p className="mt-3 text-xs text-blue-600 font-bold">✓ Wybrano: {selectedProducts.size} {selectedProducts.size === 1 ? 'produkt' : 'produkty/ów'}</p>
          )}
        </div>

        {/* KROK 2 — Wybierz klientów */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-black text-slate-800 text-lg mb-4 flex items-center gap-2">
            <span className="w-7 h-7 bg-blue-600 text-white text-sm rounded-full flex items-center justify-center font-black">2</span>
            Wybierz klientów
          </h3>

          {/* Filtry */}
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="Szukaj..."
              value={clientFilter}
              onChange={e => setClientFilter(e.target.value)}
              className="flex-1 border border-slate-200 rounded-lg p-2 text-sm outline-none focus:border-blue-400"
            />
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
              className="border border-slate-200 rounded-lg p-2 text-sm outline-none focus:border-blue-400 bg-white"
            >
              <option value="">Wszyscy</option>
              <option value="sklep">Sklep</option>
              <option value="zakład">Zakład</option>
              <option value="agencja">Agencja</option>
            </select>
          </div>

          {/* Zaznacz wszystkich z filtra */}
          <label className="flex items-center gap-2 text-xs font-bold text-slate-500 mb-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleAllFiltered}
              className="rounded text-blue-600"
            />
            Zaznacz wszystkich ({filteredClients.length})
          </label>

          <div className="space-y-1 max-h-60 overflow-y-auto">
            {filteredClients.length === 0
              ? <p className="text-slate-400 text-sm py-2">Brak klientów</p>
              : filteredClients.map(c => (
                <label key={c.id} className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer border transition-colors ${selectedClients.has(c.id) ? 'bg-blue-50 border-blue-200' : 'border-transparent hover:bg-slate-50'}`}>
                  <input
                    type="checkbox"
                    checked={selectedClients.has(c.id)}
                    onChange={() => toggleClient(c.id)}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{c.companyName}</p>
                    <p className="text-xs text-slate-400">{c.type} · {c.address?.city || 'brak miasta'}</p>
                  </div>
                </label>
              ))
            }
          </div>

          {selectedClients.size > 0 && (
            <p className="mt-3 text-xs text-blue-600 font-bold">✓ Wybrano: {selectedClients.size} {selectedClients.size === 1 ? 'klienta' : 'klientów'}</p>
          )}
        </div>

        {/* KROK 3 — Treść i wysyłka */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col">
          <h3 className="font-black text-slate-800 text-lg mb-4 flex items-center gap-2">
            <span className="w-7 h-7 bg-blue-600 text-white text-sm rounded-full flex items-center justify-center font-black">3</span>
            Treść promocji
          </h3>

          <textarea
            rows={6}
            className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-blue-400 resize-none flex-1 mb-4"
            placeholder="Np. Ruszamy z promocją wiosenną! Produkty w obniżonej cenie do końca miesiąca..."
            value={message}
            onChange={e => setMessage(e.target.value)}
          />

          {/* Podsumowanie */}
          {(selectedProducts.size > 0 || selectedClients.size > 0) && (
            <div className="bg-slate-50 rounded-xl p-3 mb-4 text-xs text-slate-600 space-y-1">
              {selectedProducts.size > 0 && (
                <p>📦 <strong>Produkty:</strong> {chosenProducts.map(p => p.name).join(', ')}</p>
              )}
              {selectedClients.size > 0 && (
                <p>🏢 <strong>Odbiorcy:</strong> {selectedClients.size} {selectedClients.size === 1 ? 'klient' : 'klientów'}</p>
              )}
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={sending || selectedClients.size === 0 || selectedProducts.size === 0 || !message.trim()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
          >
            {sending ? '⏳ Wysyłam...' : `📢 Wyślij do ${selectedClients.size} klientów`}
          </button>

          {/* Wynik */}
          {result && (
            <div className={`mt-4 p-4 rounded-xl text-sm font-semibold ${result.fail === 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              {result.fail === 0
                ? `✅ Promocja wysłana do ${result.ok} klientów! Wpisy dodane do historii kontaktów.`
                : `⚠️ Wysłano do ${result.ok}, błąd przy ${result.fail} klientach.`
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PromotionsPanel;
