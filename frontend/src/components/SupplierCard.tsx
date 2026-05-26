import React, { useState, useEffect, useRef } from 'react';
import { Supplier, SupplierFile, Interaction, InteractionFormData, getSupplierInteractions, createSupplierInteraction, updateSupplier, uploadImage } from '../services/api';

const colorClasses: Record<string, string> = {
  default: 'bg-canvas', lilac: 'bg-block-lilac', cream: 'bg-block-cream', pink: 'bg-block-pink', mint: 'bg-block-mint',
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
        files: [...supplier.files, newFile]
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
      const updatedFiles = supplier.files.filter(f => f.id !== fileId);
      const updatedSupplier = await updateSupplier(supplier.id, { ...supplier, files: updatedFiles });
      onSupplierUpdated(updatedSupplier);
    } catch {
      alert('Błąd usuwania pliku.');
    }
  };

  const cardBg = colorClasses[supplier.relationshipColor || 'default'];

  return (
    <div className={`card-padded transition-colors ${cardBg}`}>
      <button onClick={onClose} className="mb-6 flex items-center gap-2 text-sm font-bold text-ink bg-white/40 px-3 py-1.5 rounded-lg hover:bg-white/80 w-max">
        ← Wróć do bazy dostawców
      </button>

      {/* NAGŁÓWEK KARTY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 border-b border-hairline-soft pb-6 mb-6">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-3xl font-black text-ink">{supplier.companyName}</h2>
            <span className="badge badge-lilac shadow-sm">{supplier.category}</span>
          </div>
          
          <div className="flex flex-wrap gap-4 mt-4 bg-white/50 p-4 rounded-xl border border-hairline-soft">
            {supplier.phoneCompany && <p className="text-sm">🏢 <a href={`tel:${supplier.phoneCompany}`} className="font-bold hover:underline">{supplier.phoneCompany}</a> (Firma)</p>}
            {supplier.phoneSales && <p className="text-sm">👨‍💼 <a href={`tel:${supplier.phoneSales}`} className="font-bold hover:underline">{supplier.phoneSales}</a> (Handlowiec)</p>}
            {supplier.phoneOwner && <p className="text-sm">👑 <a href={`tel:${supplier.phoneOwner}`} className="font-bold hover:underline">{supplier.phoneOwner}</a> (Właściciel)</p>}
            {supplier.email && <p className="text-sm w-full mt-2">✉️ <a href={`mailto:${supplier.email}`} className="font-bold hover:underline">{supplier.email}</a></p>}
          </div>

          <div className="flex gap-3 mt-4">
            {supplier.whatsapp && (
              <a href={`https://wa.me/${supplier.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-[#25D366] text-white px-4 py-2 rounded-lg font-bold text-sm hover:opacity-90 transition shadow-sm">
                WhatsApp
              </a>
            )}
            {supplier.messenger && (
              <a href={`https://m.me/${supplier.messenger}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-[#0084FF] text-white px-4 py-2 rounded-lg font-bold text-sm hover:opacity-90 transition shadow-sm">
                Messenger
              </a>
            )}
            {supplier.email && (
              <a href={`mailto:${supplier.email}`} className="flex items-center gap-2 bg-white text-ink px-4 py-2 rounded-lg font-bold text-sm border border-hairline hover:bg-surface-soft transition shadow-sm">
                Wyślij E-mail
              </a>
            )}
          </div>
        </div>

        {/* SEKCJA PLIKÓW */}
        <div className="bg-white/60 p-4 rounded-xl shadow-sm border border-hairline-soft h-max">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-sm">📂 Oferty i Cenniki</h3>
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="text-xs font-bold bg-primary text-white px-2 py-1 rounded">
              {uploading ? 'Wgrywam...' : '+ Dodaj plik'}
            </button>
            <input type="file" className="hidden" ref={fileRef} onChange={handleFileUpload} />
          </div>
          
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {supplier.files.length === 0 ? (
              <p className="text-xs text-ink/50 text-center py-4">Brak załączonych plików.</p>
            ) : (
              supplier.files.map(file => (
                <div key={file.id} className="flex justify-between items-center bg-white p-2 rounded border border-hairline text-xs">
                  <a href={file.url} target="_blank" rel="noreferrer" className="font-medium hover:underline truncate mr-2" title={file.name}>📄 {file.name}</a>
                  <button onClick={() => handleDeleteFile(file.id)} className="text-red-500 font-bold hover:underline shrink-0">Usuń</button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* OŚ CZASU */}
      <div className="mt-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-ink">Historia i ustalenia</h3>
          <button onClick={() => setShowAddNote(!showAddNote)} className="btn-primary text-body-sm">
            {showAddNote ? '✕ Anuluj' : '+ Dodaj notatkę'}
          </button>
        </div>

        {showAddNote && (
          <form onSubmit={handleAddNote} className="bg-white/50 p-4 rounded-xl border border-hairline-soft mb-6">
            <textarea required rows={3} placeholder="Wpisz przebieg rozmowy, ustalenia z dostawcą..." value={noteText} onChange={e => setNoteText(e.target.value)} className="w-full bg-canvas border border-hairline rounded-lg p-3 outline-none focus:ring-2 focus:ring-ink text-sm mb-3 resize-none" />
            <button type="submit" className="btn-primary px-6 py-2 text-sm">Zapisz do historii</button>
          </form>
        )}

        {loading ? (
          <p className="text-center py-8">Ładowanie...</p>
        ) : interactions.length === 0 ? (
          <p className="text-center py-8 opacity-50 border-2 border-dashed rounded-xl">Brak wpisów w historii.</p>
        ) : (
          <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-hairline before:to-transparent">
            {interactions.map(interaction => (
              <div key={interaction.id} className="relative flex items-start justify-between md:justify-normal md:odd:flex-row-reverse group">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-canvas bg-block-mint text-ink shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 text-xl mt-1">
                  {CHANNEL_ICON[interaction.channel] ?? '📌'}
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)]">
                  <div className="bg-canvas p-5 rounded-lg border border-hairline shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-black text-ink">{interaction.contactDate}</span>
                      <span className="text-xs text-ink/50">{interaction.createdBy.split('@')[0]}</span>
                    </div>
                    <p className="text-ink text-sm">{interaction.notes}</p>
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