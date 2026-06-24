import React, { useState, useEffect } from 'react';
import { Supplier, SupplierFormData, getSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../services/api';
import SupplierCard from './SupplierCard';
import HdfCalculator from './HdfCalculator';

const COLOR_CLASSES: Record<string, string> = {
  default: 'bg-canvas', lilac: 'bg-block-lilac', cream: 'bg-block-cream', pink: 'bg-block-pink', mint: 'bg-block-mint',
};

// DODANE: 'Plexa' do domyślnych kategorii
const DEFAULT_CATEGORIES = ['Szkło', 'Drewno / Listwy', 'Opakowania / Kartony', 'Akcesoria / Zawieszki', 'Plexa', 'Kurierzy', 'Inne'];

const emptyForm = (): SupplierFormData => ({
  companyName: '', category: DEFAULT_CATEGORIES[0], email: '', phoneCompany: '', phoneSales: '', phoneOwner: '', whatsapp: '', messenger: '', notes: '', relationshipColor: 'default', files: [],
  address: { street: '', zipCode: '', city: '' },
  contactNames: { company: '', sales: '', owner: '' },
  agreements: { discount: '', paymentTerm: '', deliveryFreq: '' }
});

export default function SuppliersPanel() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [viewSupplier, setViewSupplier] = useState<Supplier | null>(null);
  const [search, setSearch] = useState('');
  const [showCalc, setShowCalc] = useState(false);

  // Stan formularza
  const [form, setForm] = useState<SupplierFormData>(emptyForm());
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
      setForm({
        ...supplier,
        address: supplier.address || { street: '', zipCode: '', city: '' },
        contactNames: supplier.contactNames || { company: '', sales: '', owner: '' },
        agreements: supplier.agreements || { discount: '', paymentTerm: '', deliveryFreq: '' }
      });
      setCustomCategory(DEFAULT_CATEGORIES.includes(supplier.category) ? '' : supplier.category);
    } else {
      setEditingSupplier(null);
      setForm(emptyForm());
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
      alert('Błąd Screena/Usuwania');
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
        {!showForm && (
          <div className="flex gap-2">
            <button onClick={() => setShowCalc(true)} className="btn-secondary">🧮 Kalkulator</button>
            <button onClick={() => openForm()} className="btn-primary">＋ Dodaj dostawcę</button>
          </div>
        )}
      </div>

      {showForm ? (
        /* ZAKTUALIZOWANE: max-w-5xl dla szerszego, czytelniejszego formularza na komputerze */
        <div className={`max-w-5xl mx-auto card-padded transition-colors ${COLOR_CLASSES[form.relationshipColor]}`}>
          <div className="flex justify-between items-start mb-6">
            <h3 className="section-title">{editingSupplier ? 'Edytuj dostawcę' : 'Nowy dostawca'}</h3>
            <button type="button" onClick={() => setShowForm(false)} className="btn-tertiary">✕</button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* RZĄD 1: Dane Podstawowe */}
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

            {/* RZĄD 2: Dane adresowe */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="eyebrow block mb-2">Kod pocztowy</label>
                <input type="text" value={form.address?.zipCode} onChange={e => setForm({...form, address: {...form.address!, zipCode: e.target.value}})} className="input-field bg-white" placeholder="00-000" />
              </div>
              <div>
                <label className="eyebrow block mb-2">Miasto</label>
                <input type="text" value={form.address?.city} onChange={e => setForm({...form, address: {...form.address!, city: e.target.value}})} className="input-field bg-white" />
              </div>
              <div>
                <label className="eyebrow block mb-2">Ulica i numer</label>
                <input type="text" value={form.address?.street} onChange={e => setForm({...form, address: {...form.address!, street: e.target.value}})} className="input-field bg-white" />
              </div>
            </div>

            {/* RZĄD 3: Numery Telefonów z Podziałem i Imionami */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-hairline-soft pt-4">
              <div className="bg-white/40 p-4 rounded-xl border border-hairline shadow-sm">
                <label className="eyebrow block mb-2 text-ink/70">🏢 Tel. Firmowy (Biuro)</label>
                <input type="text" placeholder="Dział / Obsługa (opcjonalnie)" value={form.contactNames?.company} onChange={e => setForm({...form, contactNames: {...form.contactNames!, company: e.target.value}})} className="input-field bg-white text-body-sm mb-2" />
                <input type="text" placeholder="Numer telefonu" value={form.phoneCompany} onChange={e => setForm({...form, phoneCompany: e.target.value})} className="input-field bg-white text-body-sm" />
              </div>
              <div className="bg-white/40 p-4 rounded-xl border border-hairline shadow-sm">
                <label className="eyebrow block mb-2 text-ink/70">👨‍💼 Tel. Handlowiec / Opiekun</label>
                <input type="text" placeholder="Imię i nazwisko handlowca" value={form.contactNames?.sales} onChange={e => setForm({...form, contactNames: {...form.contactNames!, sales: e.target.value}})} className="input-field bg-white text-body-sm mb-2" />
                <input type="text" placeholder="Numer telefonu" value={form.phoneSales} onChange={e => setForm({...form, phoneSales: e.target.value})} className="input-field bg-white text-body-sm" />
              </div>
              <div className="bg-white/40 p-4 rounded-xl border border-hairline shadow-sm">
                <label className="eyebrow block mb-2 text-ink/70">👑 Tel. Właściciel / Szef</label>
                <input type="text" placeholder="Imię i nazwisko szefa" value={form.contactNames?.owner} onChange={e => setForm({...form, contactNames: {...form.contactNames!, owner: e.target.value}})} className="input-field bg-white text-body-sm mb-2" />
                <input type="text" placeholder="Numer telefonu" value={form.phoneOwner} onChange={e => setForm({...form, phoneOwner: e.target.value})} className="input-field bg-white text-body-sm" />
              </div>
            </div>

            {/* RZĄD 4: Kanały Komunikacji Elektronicznej */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="eyebrow block mb-2">✉️ E-mail do zamówień</label>
                <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="input-field bg-white" placeholder="zamowienia@..." />
              </div>
              <div>
                <label className="eyebrow block mb-2 text-success">WhatsApp (Numer)</label>
                <input type="text" placeholder="np. 48123456789" value={form.whatsapp} onChange={e => setForm({...form, whatsapp: e.target.value})} className="input-field bg-white" />
              </div>
              <div>
                <label className="eyebrow block mb-2 text-[#0084FF]">Messenger (ID / Link)</label>
                <input type="text" placeholder="np. nazwa.profilu" value={form.messenger} onChange={e => setForm({...form, messenger: e.target.value})} className="input-field bg-white" />
              </div>
            </div>

            {/* RZĄD 5: UZGODNIENIA HANDLOWE */}
            <div className="bg-white/50 p-5 rounded-xl border border-hairline shadow-sm">
              <h4 className="font-semibold text-body-sm mb-3 text-ink">🤝 Stałe uzgodnienia logistyczno-handlowe</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="eyebrow block mb-2">Poziom Rabatu</label>
                  <input type="text" placeholder="np. 15% na profile, 5% szkło" value={form.agreements?.discount} onChange={e => setForm({...form, agreements: {...form.agreements!, discount: e.target.value}})} className="input-field bg-white text-body-sm" />
                </div>
                <div>
                  <label className="eyebrow block mb-2">Termin Płatności</label>
                  <input type="text" placeholder="np. przelew 14 dni, pobranie" value={form.agreements?.paymentTerm} onChange={e => setForm({...form, agreements: {...form.agreements!, paymentTerm: e.target.value}})} className="input-field bg-white text-body-sm" />
                </div>
                <div>
                  <label className="eyebrow block mb-2">Częstotliwość Dostaw</label>
                  <input type="text" placeholder="np. każdy wtorek rano, kurier" value={form.agreements?.deliveryFreq} onChange={e => setForm({...form, agreements: {...form.agreements!, deliveryFreq: e.target.value}})} className="input-field bg-white text-body-sm" />
                </div>
              </div>
            </div>

            {/* RZĄD 6: UWAGI / NOTATKI */}
            <div>
              <label className="eyebrow block mb-2">📝 Ogólne uwagi / Dodatkowe warunki handlowe</label>
              <textarea rows={3} placeholder="Wszelkie inne ważne adnotacje, np. darmowe minimum logistyczne od 2000zł netto..." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="w-full bg-white border border-hairline rounded-xl p-3 outline-none focus:ring-2 focus:ring-ink text-body-sm font-light resize-none" />
            </div>

            {/* RZĄD 7: Kolorystyka i wysyłka */}
            <div className="pt-4 border-t border-hairline-soft flex flex-col sm:flex-row justify-between items-center gap-4">
              <div>
                <label className="eyebrow block mb-2">Kolorystyka kafelka</label>
                <div className="flex gap-3">
                  {Object.keys(COLOR_CLASSES).map(colorId => (
                    <button
                      key={colorId}
                      type="button"
                      onClick={() => setForm({...form, relationshipColor: colorId})}
                      className={`w-8 h-8 rounded-full border border-hairline transition-transform shadow-sm ${colorId === 'default' ? 'bg-white' : `bg-block-${colorId}`} ${
                        form.relationshipColor === colorId ? 'ring-2 ring-offset-2 ring-ink scale-110' : 'opacity-60 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <button type="submit" className="btn-primary px-10 min-w-[200px]">
                Zapisz dostawcę
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* LISTA DOSTAWCÓW */
        <>
          <div className="mb-6">
            <input type="text" placeholder="Szukaj dostawcy..." className="input-field max-w-md" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {loading ? <p className="text-center text-body-sm font-light py-6">Ładowanie...</p> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map(s => (
                <div key={s.id} className={`card-padded flex flex-col h-full shadow-sm hover:shadow-md transition-shadow ${COLOR_CLASSES[s.relationshipColor || 'default']}`}>
                  <div className="flex justify-between items-start mb-3">
                    <span className="badge badge-lilac text-xs font-bold px-2 py-0.5">{s.category}</span>
                    <button type="button" onClick={() => openForm(s)} className="btn-tertiary bg-white/40 text-xs py-1 hover:bg-white/80">Edytuj</button>
                  </div>
                  <h3 className="text-card-title mb-4 truncate" title={s.companyName}>{s.companyName}</h3>
                  <div className="text-body-sm font-light space-y-1.5 mb-4 flex-grow">
                    {s.phoneCompany && <p>📞 {s.contactNames?.company ? `${s.contactNames.company}: ` : ''}{s.phoneCompany}</p>}
                    {s.phoneSales && <p>👨‍💼 {s.contactNames?.sales ? `${s.contactNames.sales}: ` : ''}{s.phoneSales}</p>}
                    {s.email && <p className="truncate">✉️ {s.email}</p>}
                    {s.files?.length > 0 && <p className="text-xs text-ink/60 pt-1 font-medium">📎 Załączono cenniki: {s.files.length}</p>}
                  </div>
                  <div className="flex gap-2 mt-auto border-t border-black/5 pt-4">
                    <button type="button" onClick={() => setViewSupplier(s)} className="btn-secondary w-full text-xs bg-white border-none shadow-sm">Otwórz kartę</button>
                    <button type="button" onClick={() => handleDelete(s.id)} className="px-3 text-red-500 hover:bg-red-50 rounded-lg text-xs font-bold bg-white/40">Usuń</button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="col-span-full card-padded text-center border-dashed py-10">
                  <p className="text-body-sm font-light text-ink/40">Brak pasujących dostawców.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showCalc && <HdfCalculator onClose={() => setShowCalc(false)} />}
    </div>
  );
}