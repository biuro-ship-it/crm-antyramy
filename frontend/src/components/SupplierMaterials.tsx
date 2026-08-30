import React, { useState } from 'react';
import {
  Supplier, SupplierMaterial, Interaction, InteractionFormData,
  updateSupplier, createSupplierInteraction,
} from '../services/api';

interface SupplierMaterialsProps {
  supplier: Supplier;
  onSupplierUpdated: (s: Supplier) => void;
  // Wysłane zamówienie trafia do historii kontaktów — karta dopisuje je do osi czasu.
  onOrderLogged?: (interaction: Interaction) => void;
}

const UNITS: SupplierMaterial['unit'][] = ['szt', 'm²', 'ark.', 'kpl'];

// Akceptuje przecinek jako separator dziesiętny (polski format).
const parsePrice = (v: string): number => {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const zl = (n: number) =>
  new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const todayPl = () => {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};

const todayISO = () => new Date().toISOString().split('T')[0];

type Draft = { name: string; unit: SupplierMaterial['unit']; price: string };
const emptyDraft: Draft = { name: '', unit: 'szt', price: '' };

// Podgląd zamówienia przed wysyłką — treść maila można jeszcze poprawić.
type OrderPreview = { subject: string; body: string; lines: string[]; total: number };

export default function SupplierMaterials({ supplier, onSupplierUpdated, onOrderLogged }: SupplierMaterialsProps) {
  const materials: SupplierMaterial[] = supplier.materials ?? [];

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Katalog: nowy surowiec + edycja istniejącego.
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);

  // Zamówienie: ilości per surowiec + uwagi.
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [orderNotes, setOrderNotes] = useState('');

  // Podgląd + zapis w historii kontaktów.
  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const [sending, setSending] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  // Zapis katalogu surowców przez istniejące PUT /api/suppliers/:id (wzorzec files[]).
  const persist = async (next: SupplierMaterial[]) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateSupplier(supplier.id, { ...supplier, materials: next });
      onSupplierUpdated(updated);
    } catch {
      setError('Nie udało się zapisać surowców.');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    const name = newDraft.name.trim();
    if (!name) return;
    const material: SupplierMaterial = {
      id: crypto.randomUUID(),
      name,
      unit: newDraft.unit,
      price: parsePrice(newDraft.price),
    };
    await persist([...materials, material]);
    setNewDraft(emptyDraft);
  };

  const startEdit = (m: SupplierMaterial) => {
    setEditingId(m.id);
    setEditDraft({ name: m.name, unit: m.unit, price: String(m.price) });
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    const name = editDraft.name.trim();
    if (!name) return;
    const next = materials.map(m =>
      m.id === editingId ? { ...m, name, unit: editDraft.unit, price: parsePrice(editDraft.price) } : m,
    );
    await persist(next);
    setEditingId(null);
    setEditDraft(emptyDraft);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Usunąć ten surowiec z katalogu dostawcy?')) return;
    await persist(materials.filter(m => m.id !== id));
    setQuantities(prev => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const setQty = (id: string, value: string) => {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    setQuantities(prev => ({ ...prev, [id]: n }));
  };

  const selected = materials.filter(m => (quantities[m.id] ?? 0) > 0);
  const orderTotal = selected.reduce((sum, m) => sum + (quantities[m.id] ?? 0) * m.price, 0);

  const handleClear = () => {
    setQuantities({});
    setOrderNotes('');
  };

  // Mail NIE zawiera cen — tylko nazwy, ilości i jednostki.
  const buildPreview = (): OrderPreview => {
    const lines = selected.map(m => `- ${m.name}: ${quantities[m.id]} ${m.unit}`);
    const notesPart = orderNotes.trim() ? `\n\nUwagi: ${orderNotes.trim()}` : '';
    const signature =
      `Pozdrawiam\n\n` +
      `Krzysztof Godek\n` +
      `Pluszek sp. z o.o. ul.Monopolowa 11 , 33-100 Tarnów\n` +
      `NIP 993-068-10-97   tel. 500 601 601`;
    const body =
      `Dzień dobry,\n\n` +
      `proszę o realizację poniższego zamówienia:\n\n` +
      `${lines.join('\n')}` +
      `${notesPart}\n\n` +
      signature;
    return { subject: `Zamówienie — Antyramy (${todayPl()})`, body, lines, total: orderTotal };
  };

  const handleOpenPreview = () => {
    if (!supplier.email) {
      alert('Ten dostawca nie ma zapisanego adresu e-mail.');
      return;
    }
    if (selected.length === 0) {
      alert('Wpisz ilość przy co najmniej jednym surowcu.');
      return;
    }
    setLogError(null);
    setPreview(buildPreview());
  };

  // Wpis w historii = pełny podgląd zamówienia: pozycje, wartość i treść maila.
  const buildHistoryNote = (p: OrderPreview): string =>
    `📦 ZAMÓWIENIE wysłane mailem\n` +
    `Do: ${supplier.email}\n` +
    `Temat: ${p.subject}\n\n` +
    `Pozycje:\n${p.lines.join('\n')}\n\n` +
    `Wartość wg cennika: ${zl(p.total)} zł netto (wyliczona w CRM — w mailu cen nie ma)\n\n` +
    `— treść wysłanej wiadomości —\n${p.body}`;

  const finishSend = (p: OrderPreview) => {
    setPreview(null);
    setLogError(null);
    handleClear();
    window.location.href =
      `mailto:${supplier.email}?subject=${encodeURIComponent(p.subject)}&body=${encodeURIComponent(p.body)}`;
  };

  const handleConfirmSend = async () => {
    if (!preview) return;
    setSending(true);
    setLogError(null);
    try {
      const data: InteractionFormData = {
        contactDate: todayISO(),
        channel: 'mail',
        notes: buildHistoryNote(preview),
        tradeNotes: `Zamówienie: ${preview.lines.length} poz., ${zl(preview.total)} zł netto`,
        products: [],
      };
      const interaction = await createSupplierInteraction(supplier.id, data);
      onOrderLogged?.(interaction);
      finishSend(preview);
    } catch {
      setLogError('Nie udało się zapisać zamówienia w historii kontaktów.');
    } finally {
      setSending(false);
    }
  };

  // Awaryjnie: gdy zapis do historii padnie, mail i tak da się wysłać.
  const handleSendWithoutLog = () => {
    if (preview) finishSend(preview);
  };

  return (
    <div className="bg-white/70 dark:bg-white/5 rounded-xl p-5 border border-hairline-soft shadow-sm mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-xs font-bold text-ink font-light uppercase tracking-wider">📦 Surowce i zamówienia</h3>
        {saving && <span className="text-xs text-ink/40 italic">Zapisuję...</span>}
      </div>

      {error && (
        <div className="bg-block-pink border border-hairline text-ink text-body-sm rounded-md p-3 mb-4">⚠️ {error}</div>
      )}

      {/* KATALOG SUROWCÓW + WYBÓR ILOŚCI */}
      <div className="space-y-2 mb-4">
        {materials.length === 0 ? (
          <p className="text-xs text-ink/40 text-center py-4 italic border border-dashed border-hairline rounded-xl">
            Brak surowców w katalogu. Dodaj pierwszy poniżej.
          </p>
        ) : (
          materials.map(m => {
            const qty = quantities[m.id] ?? 0;
            const isEditing = editingId === m.id;
            return (
              <div
                key={m.id}
                className={`rounded-xl border border-hairline-soft p-3 shadow-sm transition-colors ${qty > 0 ? 'bg-block-mint' : 'bg-canvas'}`}
              >
                {isEditing ? (
                  <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                    <input
                      autoFocus
                      value={editDraft.name}
                      onChange={e => setEditDraft({ ...editDraft, name: e.target.value })}
                      placeholder="Nazwa surowca"
                      className="flex-1 bg-canvas border border-hairline rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ink text-body-sm"
                    />
                    <select
                      value={editDraft.unit}
                      onChange={e => setEditDraft({ ...editDraft, unit: e.target.value as SupplierMaterial['unit'] })}
                      className="bg-canvas border border-hairline rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-ink text-body-sm"
                    >
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <input
                      value={editDraft.price}
                      onChange={e => setEditDraft({ ...editDraft, price: e.target.value })}
                      inputMode="decimal"
                      placeholder="Cena netto"
                      className="w-28 bg-canvas border border-hairline rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ink text-body-sm"
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={handleEditSave} disabled={saving} className="btn-primary px-4 py-1.5 text-xs disabled:opacity-60">Zapisz</button>
                      <button type="button" onClick={() => { setEditingId(null); setEditDraft(emptyDraft); }} className="btn-secondary px-4 py-1.5 text-xs">Anuluj</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[10rem]">
                      <span className="font-bold text-body-sm text-ink">{m.name}</span>
                      <span className="text-xs text-ink/50 ml-2">{zl(m.price)} zł netto / {m.unit}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-ink/60">Ilość:</label>
                      <input
                        type="number"
                        min={0}
                        value={qty || ''}
                        onChange={e => setQty(m.id, e.target.value)}
                        placeholder="0"
                        className="w-20 bg-canvas border border-hairline rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-ink text-body-sm"
                      />
                      <span className="text-xs text-ink/50 w-10">{m.unit}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => startEdit(m)} className="text-xs font-bold text-ink hover:underline">✎ Edytuj</button>
                      <button type="button" onClick={() => handleDelete(m.id)} className="text-xs font-bold text-red-500 hover:underline">Usuń</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* DODAWANIE NOWEGO SUROWCA */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center bg-canvas border border-hairline rounded-xl p-3 mb-5">
        <input
          value={newDraft.name}
          onChange={e => setNewDraft({ ...newDraft, name: e.target.value })}
          placeholder="Nazwa nowego surowca"
          className="flex-1 bg-white dark:bg-surface-soft border border-hairline rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ink text-body-sm"
        />
        <select
          value={newDraft.unit}
          onChange={e => setNewDraft({ ...newDraft, unit: e.target.value as SupplierMaterial['unit'] })}
          className="bg-white dark:bg-surface-soft border border-hairline rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-ink text-body-sm"
        >
          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <input
          value={newDraft.price}
          onChange={e => setNewDraft({ ...newDraft, price: e.target.value })}
          inputMode="decimal"
          placeholder="Cena netto / jedn."
          className="w-36 bg-white dark:bg-surface-soft border border-hairline rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ink text-body-sm"
        />
        <button type="button" onClick={handleAdd} disabled={saving || !newDraft.name.trim()} className="btn-primary px-5 py-2 text-sm disabled:opacity-60">
          ＋ Dodaj surowiec
        </button>
      </div>

      {/* ZAMÓWIENIE */}
      <div className="border-t border-hairline-soft pt-4">
        <label className="block text-xs font-bold text-ink/60 uppercase tracking-wider mb-2">Uwagi do zamówienia (opcjonalne)</label>
        <textarea
          rows={2}
          value={orderNotes}
          onChange={e => setOrderNotes(e.target.value)}
          placeholder="Np. termin dostawy, sposób pakowania..."
          className="w-full bg-canvas border border-hairline rounded-lg p-3 outline-none focus:ring-2 focus:ring-ink text-body-sm font-light resize-none mb-3"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-body-sm text-ink/70">
            Wartość wybranych pozycji:{' '}
            <span className="font-black text-ink">{zl(orderTotal)} zł netto</span>
            <span className="text-xs text-ink/40 ml-1">(podgląd — nie trafia do maila)</span>
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={handleClear} className="btn-secondary px-4 py-2 text-sm">Wyczyść</button>
            <button type="button" onClick={handleOpenPreview} className="btn-primary px-5 py-2 text-sm">✉️ Wyślij zamówienie mailem</button>
          </div>
        </div>
      </div>

      {/* PODGLĄD ZAMÓWIENIA PRZED WYSYŁKĄ */}
      {preview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-canvas rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-hairline-soft">
              <h3 className="text-lg font-bold text-ink">📦 Podgląd zamówienia</h3>
              <button type="button" onClick={() => { setPreview(null); setLogError(null); }} className="text-ink font-light text-2xl leading-none">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {logError && (
                <div className="bg-block-pink border border-hairline text-ink text-body-sm rounded-md p-3 mb-4">⚠️ {logError}</div>
              )}

              <p className="text-xs font-bold text-ink/60 uppercase">Do: {supplier.email}</p>
              <p className="text-xs font-bold text-ink/60 uppercase mb-3">Temat: {preview.subject}</p>
              <p className="text-xs text-ink/50 mb-3">
                Pozycji: {preview.lines.length} · wartość wg cennika {zl(preview.total)} zł netto
                <span className="text-ink/40 ml-1">(ceny trafiają tylko do historii, nie do maila)</span>
              </p>

              <label className="block text-xs font-bold text-ink/60 uppercase tracking-wider mb-1">Treść maila — możesz ją jeszcze poprawić</label>
              <textarea
                rows={14}
                value={preview.body}
                onChange={e => setPreview({ ...preview, body: e.target.value })}
                className="w-full bg-canvas border border-hairline rounded-xl p-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ink resize-none font-mono leading-relaxed"
              />
              <p className="text-xs text-ink/40 mt-2">
                Po wysłaniu zamówienie zapisze się w historii kontaktów dostawcy razem z całą tą treścią.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-hairline-soft flex flex-wrap justify-between items-center gap-2">
              <button type="button" onClick={() => { setPreview(null); setLogError(null); }} className="btn-secondary px-4 py-2 text-sm">
                ← Wróć do edycji
              </button>
              <div className="flex gap-2">
                {logError && (
                  <button type="button" onClick={handleSendWithoutLog} className="btn-secondary px-4 py-2 text-sm">
                    Wyślij bez zapisu
                  </button>
                )}
                <button type="button" onClick={handleConfirmSend} disabled={sending} className="btn-primary px-5 py-2 text-sm disabled:opacity-60">
                  {sending ? 'Zapisuję...' : '✉️ Wyślij i zapisz w historii'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
