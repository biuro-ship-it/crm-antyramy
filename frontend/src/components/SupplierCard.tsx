import React, { useState, useEffect, useRef } from 'react';
import { Supplier, SupplierFile, Interaction, InteractionFormData, getSupplierInteractions, createSupplierInteraction, updateSupplierInteraction, updateSupplier, uploadImage } from '../services/api';
import SupplierMaterials from './SupplierMaterials';

const colorClasses: Record<string, string> = {
  default: 'bg-canvas', lilac: 'bg-block-lilac', cream: 'bg-block-cream', pink: 'bg-block-gray', mint: 'bg-block-mint',
};

const CHANNEL_ICON: Record<string, string> = { telefon: '📞', mail: '✉️', spotkanie: '🤝', inne: '📌' };

interface SupplierCardProps {
  supplier: Supplier;
  onClose: () => void;
  onSupplierUpdated: (s: Supplier) => void;
}

export default function SupplierCard({ supplier, onClose, onSupplierUpdated }: SupplierCardProps) {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSupplierInteractions(supplier.id)
      .then(setInteractions)
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [supplier.id]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    const data: InteractionFormData = {
      contactDate: new Date().toISOString().split('T')[0],
      channel: 'telefon',
      notes: noteText,
      tradeNotes: '',
      products: [],
    };
    const newInteraction = await createSupplierInteraction(supplier.id, data);
    setInteractions([newInteraction, ...interactions]);
    setNoteText('');
    setShowAddNote(false);
  };

  const startEdit = (interaction: Interaction) => {
    setEditingId(interaction.id);
    setEditText(interaction.notes);
    setShowAddNote(false);
  };

  const handleEditSave = async (e: React.FormEvent, interaction: Interaction) => {
    e.preventDefault();
    if (!editText.trim()) return;
    setSavingEdit(true);
    try {
      const data: InteractionFormData = {
        contactDate: interaction.contactDate,
        channel: interaction.channel,
        notes: editText,
        tradeNotes: interaction.tradeNotes ?? '',
        products: interaction.products ?? [],
      };
      const updated = await updateSupplierInteraction(supplier.id, interaction.id, data);
      setInteractions(prev => prev.map(i => i.id === interaction.id ? updated : i));
      setEditingId(null);
      setEditText('');
    } catch (err) {
      alert('Nie udało się zapisać zmian w notatce.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      const newFile: SupplierFile = {
        id: crypto.randomUUID(),
        name: file.name,
        url: url,
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        uploadedAt: new Date().toISOString().split('T')[0],
      };
      const updatedSupplier = await updateSupplier(supplier.id, {
        ...supplier,
        files: [...(supplier.files || []), newFile]
      });
      onSupplierUpdated(updatedSupplier);
    } catch (err) {
      alert('Nie udało się wgrać pliku.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!window.confirm('Usunąć ten plik?')) return;
    try {
      const updatedFiles = (supplier.files || []).filter(f => f.id !== fileId);
      const updatedSupplier = await updateSupplier(supplier.id, { ...supplier, files: updatedFiles });
      onSupplierUpdated(updatedSupplier);
    } catch {
      alert('Błąd usuwania pliku.');
    }
  };

  const cardBg = colorClasses[supplier.relationshipColor || 'default'];

  return (
    <div className={`card-padded transition-colors ${cardBg}`}>
      <button onClick={onClose} className="mb-6 flex items-center gap-2 text-sm font-bold text-ink bg-white/40 dark:bg-white/10 px-3 py-1.5 rounded-lg hover:bg-white/80 dark:hover:bg-white/20 w-max">
        ← Wróć do bazy dostawców
      </button>

      {/* 1. NAGŁÓWEK KARTY Z ADRESEM */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-hairline-soft">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-3xl font-black text-ink">{supplier.companyName}</h2>
            <span className="badge badge-lilac shadow-sm">{supplier.category}</span>
          </div>
          {(supplier.address?.street || supplier.address?.city || supplier.address?.zipCode) ? (
            <p className="text-body-sm font-light text-ink/70">
              📍 {[supplier.address.street, supplier.address.zipCode, supplier.address.city].filter(Boolean).join(', ')}
            </p>
          ) : (
            <p className="text-xs font-light text-ink/40 italic">📍 Brak wprowadzonego adresu</p>
          )}
        </div>
      </div>

      {/* 2. ZAKTUALIZOWANE: PANALE UZGODNIEŃ I UWAG WYSTAWIĘ NA SAMĄ GÓRĘ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {/* Panel stałych uzgodnień */}
        <div className="bg-white/70 dark:bg-white/5 rounded-xl p-5 border border-hairline-soft shadow-sm">
          <h3 className="text-xs font-bold text-ink font-light uppercase tracking-wider mb-3">🤝 Stałe uzgodnienia</h3>
          <div className="space-y-2 text-body-sm font-light">
            <div className="flex justify-between border-b border-hairline-soft pb-1">
              <span className="opacity-60">Poziom rabatu:</span>
              <span className="font-bold text-ink">{supplier.agreements?.discount || '—'}</span>
            </div>
            <div className="flex justify-between border-b border-hairline-soft pb-1">
              <span className="opacity-60">Termin płatności:</span>
              <span className="font-bold text-ink">{supplier.agreements?.paymentTerm || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-60">Częstotliwość dostaw:</span>
              <span className="font-bold text-ink">{supplier.agreements?.deliveryFreq || '—'}</span>
            </div>
          </div>
        </div>

        {/* Panel ogólnych uwag */}
        <div className="bg-white/70 dark:bg-white/5 rounded-xl p-5 border border-hairline-soft shadow-sm flex flex-col">
          <h3 className="text-xs font-bold text-ink font-light uppercase tracking-wider mb-2">📝 Ogólne uwagi / Informacje</h3>
          <p className="text-body-sm font-light text-ink whitespace-pre-line leading-relaxed flex-grow">
            {supplier.notes || <span className="italic opacity-40">Brak dodatkowych uwag o dostawcy.</span>}
          </p>
        </div>
      </div>

      {/* 3. DANE KONTAKTOWE, KOMUNIKATORY I PLIKOWNIA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 border-b border-hairline-soft pb-8 mb-6">
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-xs font-bold text-ink font-light uppercase tracking-wider">☎️ Dane telefoniczne i bezpośrednie czaty</h3>
          
          <div className="flex flex-col gap-3 bg-white/50 dark:bg-white/5 p-4 rounded-xl border border-hairline-soft shadow-sm">
            {supplier.phoneCompany && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-body-sm">
                <span className="w-24 font-bold opacity-60">🏢 Centrala:</span>
                {supplier.contactNames?.company && <span className="font-medium text-ink/80">{supplier.contactNames.company} — </span>}
                <a href={`tel:${supplier.phoneCompany}`} className="font-bold hover:underline text-ink">{supplier.phoneCompany}</a>
              </div>
            )}
            {supplier.phoneSales && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-body-sm">
                <span className="w-24 font-bold opacity-60">👨‍💼 Opiekun:</span>
                {supplier.contactNames?.sales && <span className="font-medium text-ink/80">{supplier.contactNames.sales} — </span>}
                <a href={`tel:${supplier.phoneSales}`} className="font-bold hover:underline text-ink">{supplier.phoneSales}</a>
              </div>
            )}
            {supplier.phoneOwner && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-body-sm">
                <span className="w-24 font-bold opacity-60">👑 Szef/Właściciel:</span>
                {supplier.contactNames?.owner && <span className="font-medium text-ink/80">{supplier.contactNames.owner} — </span>}
                <a href={`tel:${supplier.phoneOwner}`} className="font-bold hover:underline text-ink">{supplier.phoneOwner}</a>
              </div>
            )}
            {supplier.email && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-body-sm pt-2 border-t border-hairline-soft mt-1">
                <span className="w-24 font-bold opacity-60">✉️ E-mail:</span>
                <a href={`mailto:${supplier.email}`} className="font-bold hover:underline text-ink">{supplier.email}</a>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            {supplier.whatsapp && (
              <a href={`https://wa.me/${supplier.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-[#25D366] text-white px-4 py-2 rounded-lg font-bold text-xs hover:opacity-90 shadow-sm transition-opacity">
                💬 Uruchom WhatsApp
              </a>
            )}
            {supplier.messenger && (
              <a href={`https://m.me/${supplier.messenger}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-[#0084FF] text-white px-4 py-2 rounded-lg font-bold text-xs hover:opacity-90 shadow-sm transition-opacity">
                ⚡ Otwórz Messenger
              </a>
            )}
            {supplier.email && (
              <a href={`mailto:${supplier.email}`} className="flex items-center gap-2 bg-white dark:bg-surface-soft text-ink px-4 py-2 rounded-lg font-bold text-xs border border-hairline hover:bg-surface-soft shadow-sm transition-colors">
                ✉️ Napisz E-mail
              </a>
            )}
          </div>
        </div>

        {/* SKRZYNKA NA PLIKI (CENNIKI) */}
        <div className="bg-white/60 dark:bg-white/10 p-4 rounded-xl shadow-sm border border-hairline-soft h-max">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-bold text-ink font-light uppercase tracking-wider">📂 Oferty i Cenniki</h3>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="text-[11px] font-bold bg-primary text-on-primary px-2 py-1 rounded transition-opacity hover:opacity-90">
              {uploading ? 'Wgrywam...' : '+ Dodaj plik'}
            </button>
            <input type="file" className="hidden" ref={fileRef} onChange={handleFileUpload} />
          </div>
          
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {(!supplier.files || supplier.files.length === 0) ? (
              <p className="text-xs text-ink/40 text-center py-4 italic">Brak załączonych plików.</p>
            ) : (
              supplier.files.map(file => (
                <div key={file.id} className="flex justify-between items-center bg-white dark:bg-surface-soft p-2 rounded border border-hairline text-xs shadow-sm">
                  <a href={file.url} target="_blank" rel="noreferrer" className="font-medium hover:underline text-ink truncate mr-2" title={file.name}>📄 {file.name}</a>
                  <button type="button" onClick={() => handleDeleteFile(file.id)} className="text-red-500 font-bold hover:underline shrink-0 px-1">Usuń</button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 3.5 SUROWCE I ZAMÓWIENIA */}
      <SupplierMaterials supplier={supplier} onSupplierUpdated={onSupplierUpdated} />

      {/* 4. OŚ CZASU (ROZMOWY I USTALENIA) */}
      <div className="mt-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-ink">Historia i bieżące rozmowy</h3>
          <button type="button" onClick={() => setShowAddNote(!showAddNote)} className="btn-primary text-body-sm">
            {showAddNote ? '✕ Anuluj' : '＋ Dodaj notatkę z kontaktu'}
          </button>
        </div>

        {showAddNote && (
          <form onSubmit={handleAddNote} className="bg-white/50 dark:bg-white/5 p-4 rounded-xl border border-hairline-soft mb-6 animate-in fade-in duration-200">
            <textarea required rows={3} placeholder="Wpisz krótki przebieg rozmowy, zgłoszone reklamacje, ustalenia z dostawcą..." value={noteText} onChange={e => setNoteText(e.target.value)} className="w-full bg-canvas border border-hairline rounded-lg p-3 outline-none focus:ring-2 focus:ring-ink text-body-sm font-light mb-3 resize-none" />
            <button type="submit" className="btn-primary px-6 py-2 text-sm">Zapisz notatkę</button>
          </form>
        )}

        {loading ? (
          <p className="text-center text-body-sm font-light py-8 animate-pulse">Ładowanie osi ustaleń...</p>
        ) : interactions.length === 0 ? (
          <p className="text-center py-8 text-body-sm font-light opacity-50 border-2 border-dashed rounded-xl">Brak odnotowanych rozmów w chmurze.</p>
        ) : (
          <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-hairline before:to-transparent">
            {interactions.map(interaction => (
              <div key={interaction.id} className="relative flex items-start justify-between md:justify-normal md:odd:flex-row-reverse group">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-canvas bg-block-mint text-ink shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 text-xl mt-1 shadow-sm">
                  {CHANNEL_ICON[interaction.channel] ?? '📌'}
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)]">
                  <div className="bg-canvas p-5 rounded-lg border border-hairline shadow-sm hover:shadow transition-shadow">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-black text-body-sm text-ink">{interaction.contactDate}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-ink/40">Zapis: {interaction.createdBy.split('@')[0]}</span>
                        {editingId !== interaction.id && (
                          <button
                            type="button"
                            onClick={() => startEdit(interaction)}
                            className="text-xs font-bold text-ink hover:underline transition-colors flex items-center gap-1"
                          >
                            ✎ Edytuj
                          </button>
                        )}
                      </div>
                    </div>
                    {editingId === interaction.id ? (
                      <form onSubmit={e => handleEditSave(e, interaction)} className="animate-in fade-in duration-200">
                        <textarea
                          required
                          rows={3}
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          className="w-full bg-canvas border border-hairline rounded-lg p-3 outline-none focus:ring-2 focus:ring-ink text-body-sm font-light mb-3 resize-none"
                        />
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => { setEditingId(null); setEditText(''); }} className="btn-secondary px-4 py-1.5 text-xs">
                            Anuluj
                          </button>
                          <button type="submit" disabled={savingEdit} className="btn-primary px-4 py-1.5 text-xs disabled:opacity-60">
                            {savingEdit ? 'Zapisuję...' : 'Zapisz zmiany'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <p className="text-ink text-body-sm font-light leading-relaxed whitespace-pre-line">{interaction.notes}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}