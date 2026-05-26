import React, { useState, useEffect } from 'react';
import { Supplier, SupplierFormData, getSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../services/api';
import SupplierCard from './SupplierCard';

const COLOR_CLASSES: Record<string, string> = {
  default: 'bg-canvas', lilac: 'bg-block-lilac', cream: 'bg-block-cream', pink: 'bg-block-pink', mint: 'bg-block-mint',
};

const DEFAULT_CATEGORIES = ['Szkło', 'Drewno / Listwy', 'Opakowania / Kartony', 'Akcesoria / Zawieszki', 'Kurierzy', 'Inne'];

export default function SuppliersPanel() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [viewSupplier, setViewSupplier] = useState<Supplier | null>(null);
  const [search, setSearch] = useState('');
  
  // Stan formularza
  const [form, setForm] = useState<SupplierFormData>({
    companyName: '', category: DEFAULT_CATEGORIES[0], email: '', phoneCompany: '', phoneSales: '', phoneOwner: '', whatsapp: '', messenger: '', notes: '', relationshipColor: 'default', files: []
  });
  const [customCategory, setCustomCategory] = useState('');

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      setSuppliers(await getSuppliers());
    } catch (err) {
      alert('Błąd pobierania dostawców');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSuppliers(); }, []);

  const openForm = (supplier?: Supplier) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setForm(supplier);
      setCustomCategory(DEFAULT_CATEGORIES.includes(supplier.category) ? '' : supplier.category);
    } else {
      setEditingSupplier(null);
      setForm({ companyName: '', category: DEFAULT_CATEGORIES[0], email: '', phoneCompany: '', phoneSales: '', phoneOwner: '', whatsapp: '', messenger: '', notes: '', relationshipColor: 'default', files: [] });
      setCustomCategory('');
    }
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = form.category === 'CUSTOM' ? customCategory : form.category;
    const finalForm = { ...form, category: finalCategory };
    try {
      if (editingSupplier) {
        const updated = await updateSupplier(editingSupplier.id, finalForm);
        setSuppliers(prev => prev.map(s => s.id === updated.id ? updated : s));
      } else {
        const created = await createSupplier(finalForm);
        setSuppliers([created, ...suppliers]);
      }
      setShowForm(false);
    } catch {
      alert('Błąd zapisu dostawcy');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Usunąć dostawcę?')) return;
    try {
      await deleteSupplier(id);
      setSuppliers(prev => prev.filter(s => s.id !== id));
    } catch {
      alert('Błąd usuwania');
    }
  };

  if (viewSupplier) {
    return (
      <SupplierCard 
        supplier={viewSupplier} 
        onClose={() => { setViewSupplier(null); fetchSuppliers(); }} 
        onSupplierUpdated={(updated) => setViewSupplier(updated)}
      />
    );
  }

  const filtered = suppliers.filter(s => 
    s.companyName.toLowerCase().includes(search.toLowerCase()) || 
    s.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-end gap-4 mb-8">
        <div>
          <h2 className="page-title">Baza Dostawców</h2>
          <p className="text-body-sm font-light mt-2">Zarządzaj dostawcami surowców, cennikami i ofertami</p>
        </div>
        {!showForm && <button onClick={() => openForm()} className="btn-primary">＋ Dodaj dostawcę</button>}
      </div>

      {showForm ? (
        <div className={`max-w-3xl mx-auto card-padded transition-colors ${COLOR_CLASSES[form.relationshipColor]}`}>
          <div className="flex justify-between items-start mb-6">
            <h3 className="section-title">{editingSupplier ? 'Edytuj' : 'Nowy dostawca'}</h3>
            <button onClick={() => setShowForm(false)} className="btn-tertiary">✕</button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="eyebrow block mb-2">Nazwa firmy</label>
                <input required type="text" value={form.companyName} onChange={e => setForm({...form, companyName: e.target.value})} className="input-field bg-white" />
              </div>
              <div>
                <label className="eyebrow block mb-2">Kategoria</label>
                <select value={DEFAULT_CATEGORIES.includes(form.category) ? form.category : 'CUSTOM'} onChange={e => setForm({...form, category: e.target.value})} className="select-field bg-white">
                  {DEFAULT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="CUSTOM">+ Dodaj własną kategorię...</option>
                </select>
                {(form.category === 'CUSTOM' || (!DEFAULT_CATEGORIES.includes(form.category) && form.category !== '')) && (
                  <input type="text" placeholder="Wpisz nazwę kategorii" required value={customCategory} onChange={e => setCustomCategory(e.target.value)} className="input-field bg-white mt-2" />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className="eyebrow block mb-2">📞 Tel Firmowy</label><input type="text" value={form.phoneCompany} onChange={e => setForm({...form, phoneCompany: e.target.value})} className="input-field bg-white" /></div>
              <div><label className="eyebrow block mb-2">👨‍💼 Tel Handlowiec</label><input type="text" value={form.phoneSales} onChange={e => setForm({...form, phoneSales: e.target.value})} className="input-field bg-white" /></div>
              <div><label className="eyebrow block mb-2">👑 Tel Właściciel</label><input type="text" value={form.phoneOwner} onChange={e => setForm({...form, phoneOwner: e.target.value})} className="input-field bg-white" /></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-hairline-soft pt-4 mt-4">
              <div><label className="eyebrow block mb-2">✉️ E-mail</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="input-field bg-white" /></div>
              <div><label className="eyebrow block mb-2 text-[#25D366]">WhatsApp (Numer)</label><input type="text" placeholder="np. 48123456789" value={form.whatsapp} onChange={e => setForm({...form, whatsapp: e.target.value})} className="input-field bg-white" /></div>
              <div><label className="eyebrow block mb-2 text-[#0084FF]">Messenger (ID/Link)</label><input type="text" placeholder="np. nazwa.firmy" value={form.messenger} onChange={e => setForm({...form, messenger: e.target.value})} className="input-field bg-white" /></div>
            </div>

            <div className="pt-4 border-t border-hairline-soft">
              <label className="eyebrow block mb-2">Kolor karty</label>
              <div className="flex gap-3">
                {Object.keys(COLOR_CLASSES).map(colorId => (
                  <button key={colorId} type="button" onClick={() => setForm({...form, relationshipColor: colorId})} className={`w-8 h-8 rounded-full border border-hairline transition-transform shadow-sm ${colorId === 'default' ? 'bg-white' : `bg-block-${colorId}`} ${form.relationshipColor === colorId ? 'ring-2 ring-ink scale-110' : 'opacity-50'}`} />
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button type="submit" className="btn-primary flex-1">Zapisz</button>
            </div>
          </form>
        </div>
      ) : (
        <>
          <div className="mb-6"><input type="text" placeholder="Szukaj dostawcy..." className="input-field max-w-md" value={search} onChange={e => setSearch(e.target.value)} /></div>
          {loading ? <p>Ładowanie...</p> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map(s => (
                <div key={s.id} className={`card-padded flex flex-col h-full ${COLOR_CLASSES[s.relationshipColor || 'default']}`}>
                  <div className="flex justify-between items-start mb-3">
                    <span className="badge badge-lilac">{s.category}</span>
                    <button onClick={() => openForm(s)} className="btn-tertiary bg-white/40 text-xs py-1">Edytuj</button>
                  </div>
                  <h3 className="text-card-title mb-4 truncate">{s.companyName}</h3>
                  <div className="text-sm font-light space-y-1 mb-4 flex-grow">
                    {s.phoneCompany && <p>📞 {s.phoneCompany}</p>}
                    {s.email && <p>✉️ {s.email}</p>}
                    {s.files?.length > 0 && <p className="mt-2 text-xs font-bold">📎 {s.files.length} plików cenników</p>}
                  </div>
                  <div className="flex gap-2 mt-auto border-t border-black/5 pt-4">
                    <button onClick={() => setViewSupplier(s)} className="btn-secondary w-full text-xs bg-white border-none shadow-sm">Otwórz kartę</button>
                    <button onClick={() => handleDelete(s.id)} className="px-3 text-red-500 hover:bg-red-50 rounded-lg text-xs font-bold bg-white/40">Usuń</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}