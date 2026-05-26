import React, { useState, useEffect, ChangeEvent } from 'react';

interface SupplierFile {
  id: string;
  name: string;
  uploadedAt: string;
  size: string;
}

interface Supplier {
  id: string;
  companyName: string;
  category: string;
  email: string;
  phoneCompany: string; // Telefon do firmy
  phoneSales: string;   // Telefon do handlowca
  phoneOwner: string;   // Telefon do właściciela
  notes: string;
  relationshipColor: string;
  files: SupplierFile[];
}

const COLOR_CLASSES: Record<string, string> = {
  default: 'bg-canvas',
  lilac: 'bg-block-lilac',
  cream: 'bg-block-cream',
  pink: 'bg-block-pink',
  mint: 'bg-block-mint',
};

const CATEGORIES = ['Szkło', 'Drewno / Listwy', 'Opakowania / Kartony', 'Akcesoria / Zawieszki', 'Kurierzy', 'Inne'];

const SuppliersPanel: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  
  // Stan wyszukiwania i filtrów
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Stan formularza
  const [companyName, setCompanyName] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [email, setEmail] = useState('');
  const [phoneCompany, setPhoneCompany] = useState('');
  const [phoneSales, setPhoneSales] = useState('');
  const [phoneOwner, setPhoneOwner] = useState('');
  const [notes, setNotes] = useState('');
  const [relationshipColor, setRelationshipColor] = useState('default');
  const [attachedFiles, setAttachedFiles] = useState<SupplierFile[]>([]);

  // Wczytywanie dostawców z localStorage przy starcie
  useEffect(() => {
    const saved = localStorage.getItem('crm_suppliers');
    if (saved) {
      setSuppliers(JSON.parse(saved));
    }
  }, []);

  // Zapis do localStorage przy każdej zmianie
  const saveToStorage = (updatedSuppliers: Supplier[]) => {
    setSuppliers(updatedSuppliers);
    localStorage.setItem('crm_suppliers', JSON.stringify(updatedSuppliers));
  };

  const openAddForm = () => {
    setEditingSupplier(null);
    setCompanyName('');
    setCategory(CATEGORIES[0]);
    setEmail('');
    setPhoneCompany('');
    setPhoneSales('');
    setPhoneOwner('');
    setNotes('');
    setRelationshipColor('default');
    setAttachedFiles([]);
    setShowForm(true);
  };

  const openEditForm = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setCompanyName(supplier.companyName);
    setCategory(supplier.category);
    setEmail(supplier.email);
    setPhoneCompany(supplier.phoneCompany || '');
    setPhoneSales(supplier.phoneSales || '');
    setPhoneOwner(supplier.phoneOwner || '');
    setNotes(supplier.notes || '');
    setRelationshipColor(supplier.relationshipColor || 'default');
    setAttachedFiles(supplier.files || []);
    setShowForm(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return alert('Nazwa firmy jest wymagana');

    if (editingSupplier) {
      // Edycja istniejącego
      const updated = suppliers.map(s => s.id === editingSupplier.id ? {
        ...s,
        companyName, category, email, phoneCompany, phoneSales, phoneOwner, notes, relationshipColor, files: attachedFiles
      } : s);
      saveToStorage(updated);
    } else {
      // Dodawanie nowego
      const newSupplier: Supplier = {
        id: crypto.randomUUID(),
        companyName, category, email, phoneCompany, phoneSales, phoneOwner, notes, relationshipColor, files: attachedFiles
      };
      saveToStorage([newSupplier, ...suppliers]);
    }

    setShowForm(false);
  };

  const handleDeleteSupplier = (id: string, name: string) => {
    if (window.confirm(`Czy na pewno chcesz usunąć dostawcę "${name}"?`)) {
      const updated = suppliers.filter(s => s.id !== id);
      saveToStorage(updated);
    }
  };

  // Obsługa symulacji wgrywania plików (ofert/cenników)
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const fileList = Array.from(e.target.files);

    const newFiles: SupplierFile[] = fileList.map(f => ({
      id: crypto.randomUUID(),
      name: f.name,
      uploadedAt: new Date().toISOString().split('T')[0],
      size: `${(f.size / 1024 / 1024).toFixed(2)} MB`
    }));

    setAttachedFiles(prev => [...prev, ...newFiles]);
  };

  const handleRemoveFile = (fileId: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // Filtrowanie listy dostawców
  const filteredSuppliers = suppliers.filter(s => {
    const q = search.toLowerCase();
    const matchesSearch = 
      s.companyName.toLowerCase().includes(q) || 
      s.email.toLowerCase().includes(q) ||
      s.phoneCompany.includes(q) ||
      s.phoneSales.includes(q) ||
      s.phoneOwner.includes(q);
      
    const matchesCategory = categoryFilter === '' ? true : s.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div>
      {/* NAGŁÓWEK PANELU */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-8">
        <div>
          <h2 className="page-title">Baza Dostawców</h2>
          <p className="text-body-sm font-light mt-2">Zarządzaj dostawcami surowców, cennikami i ofertami handlowymi</p>
        </div>
        {!showForm && (
          <button type="button" onClick={openAddForm} className="btn-primary">
            ＋ Dodaj dostawcę
          </button>
        )}
      </div>

      {showForm ? (
        /* FORMULARZ DODAWANIA / EDYCJI */
        <div className={`max-w-3xl mx-auto card-padded transition-colors ${COLOR_CLASSES[relationshipColor]}`}>
          <div className="flex justify-between items-start mb-6">
            <h3 className="section-title">{editingSupplier ? 'Edytuj dostawcę' : 'Nowy dostawca'}</h3>
            <button type="button" onClick={() => setShowForm(false)} className="btn-tertiary">✕</button>
          </div>

          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="eyebrow block mb-2">Nazwa firmy dostawcy</label>
                <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} className="input-field bg-white" required />
              </div>
              <div>
                <label className="eyebrow block mb-2">Kategoria dostaw</label>
                <select value={category} onChange={e => setCategory(e.target.value)} className="select-field bg-white">
                  {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="eyebrow block mb-2">📞 Telefon firmowy (Biuro)</label>
                <input type="tel" value={phoneCompany} onChange={e => setPhoneCompany(e.target.value)} className="input-field bg-white" placeholder="np. Centrala" />
              </div>
              <div>
                <label className="eyebrow block mb-2">👨‍💼 Telefon do handlowca</label>
                <input type="tel" value={phoneSales} onChange={e => setPhoneSales(e.target.value)} className="input-field bg-white" placeholder="np. Opiekun klienta" />
              </div>
              <div>
                <label className="eyebrow block mb-2">👑 Telefon do właściciela</label>
                <input type="tel" value={phoneOwner} onChange={e => setPhoneOwner(e.target.value)} className="input-field bg-white" />
              </div>
            </div>

            <div>
              <label className="eyebrow block mb-2">E-mail do zamówień</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field bg-white" placeholder="zamowienia@..." />
            </div>

            {/* SELEKTOR KOLORU */}
            <div>
              <label className="eyebrow block mb-2">Kolor karty dostawcy</label>
              <div className="flex gap-3 mt-2">
                {Object.keys(COLOR_CLASSES).map(colorId => (
                  <button
                    key={colorId}
                    type="button"
                    onClick={() => setRelationshipColor(colorId)}
                    className={`w-8 h-8 rounded-full border border-hairline transition-transform shadow-sm ${colorId === 'default' ? 'bg-white' : `bg-block-${colorId}`} ${
                      relationshipColor === colorId ? 'ring-2 ring-offset-2 ring-ink scale-110' : 'opacity-50 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* SEKCJA WGRYWANIA PLIKÓW */}
            <div className="bg-white/50 p-4 rounded-xl border border-hairline">
              <label className="eyebrow block mb-2">📂 Oferty, cenniki i dokumenty PDF</label>
              <input type="file" multiple onChange={handleFileUpload} className="block w-full text-sm text-ink font-light file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-surface-soft file:text-ink hover:file:bg-hairline cursor-pointer" />
              
              {attachedFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  {attachedFiles.map(file => (
                    <div key={file.id} className="flex justify-between items-center bg-white p-2 rounded-lg border border-hairline text-body-sm shadow-sm">
                      <span className="truncate pr-4">📄 <strong>{file.name}</strong> <span className="text-xs text-ink/50">({file.size})</span></span>
                      <button type="button" onClick={() => handleRemoveFile(file.id)} className="text-red-500 hover:underline font-bold text-xs px-2">Usuń</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="eyebrow block mb-2">Notatki / Specjalne warunki handlowe (np. rabaty, logistyka)</label>
              <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} className="w-full bg-white border border-hairline rounded-xl p-3 outline-none focus:ring-2 focus:ring-ink resize-none text-body-sm font-light" placeholder="Np. Darmowe minimum logistyczne od 2000zł netto..." />
            </div>

            <div className="flex gap-3 pt-4">
              <button type="submit" className="btn-primary flex-1">Zapisz dostawcę</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Anuluj</button>
            </div>
          </form>
        </div>
      ) : (
        /* WIDOK LISTY I FILTRÓW */
        <>
          <div className="card-padded mb-6 flex flex-col md:flex-row gap-4">
            <input
              type="text"
              placeholder="Szukaj dostawcy (nazwa, email, telefony)..."
              className="input-field flex-1"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select className="select-field md:w-64" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              <option value="">Wszystkie kategorie dostaw</option>
              {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSuppliers.map(supplier => {
              const bgClass = COLOR_CLASSES[supplier.relationshipColor || 'default'];
              return (
                <div key={supplier.id} className={`card-padded flex flex-col h-full transition-shadow shadow-sm hover:shadow-md ${bgClass}`}>
                  <div className="flex justify-between items-start mb-3">
                    <span className="badge badge-lilac text-xs px-2.5 py-1 font-bold shadow-sm">{supplier.category}</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => openEditForm(supplier)} className="btn-tertiary text-xs py-1 bg-white/40 hover:bg-white/80">Edytuj</button>
                      <button type="button" onClick={() => handleDeleteSupplier(supplier.id, supplier.companyName)} className="text-red-600 text-xs px-2 py-1 bg-white/10 hover:bg-red-50 rounded-lg border border-red-100">Usuń</button>
                    </div>
                  </div>

                  <h3 className="text-card-title mb-4 truncate" title={supplier.companyName}>{supplier.companyName}</h3>

                  {/* SEKCJA TELEFONÓW (3 POLA) */}
                  <div className="space-y-1.5 text-body-sm font-light text-ink mb-4 border-b border-hairline-soft pb-3">
                    {supplier.phoneCompany && <p>🏢 <strong>Firmowy:</strong> <a href={`tel:${supplier.phoneCompany}`} className="hover:underline">{supplier.phoneCompany}</a></p>}
                    {supplier.phoneSales && <p>👨‍💼 <strong>Handlowiec:</strong> <a href={`tel:${supplier.phoneSales}`} className="hover:underline">{supplier.phoneSales}</a></p>}
                    {supplier.phoneOwner && <p>👑 <strong>Właściciel:</strong> <a href={`tel:${supplier.phoneOwner}`} className="hover:underline">{supplier.phoneOwner}</a></p>}
                    {supplier.email && <p>✉️ <strong>E-mail:</strong> <a href={`mailto:${supplier.email}`} className="hover:underline font-medium">{supplier.email}</a></p>}
                  </div>

                  {/* SEKCJA PLIKÓW (OFERTY/CENNIKI) */}
                  <div className="flex-grow mb-4">
                    <p className="eyebrow mb-2">Pliki ({supplier.files?.length || 0})</p>
                    {supplier.files && supplier.files.length > 0 ? (
                      <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                        {supplier.files.map(file => (
                          <div key={file.id} className="text-xs bg-white/50 p-1.5 rounded border border-hairline flex justify-between items-center">
                            <span className="truncate pr-2" title={file.name}>📄 {file.name}</span>
                            <span className="text-[10px] text-ink/40 shrink-0 font-mono">{file.uploadedAt}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-ink/40 font-light italic">Brak załączonych cenników</p>
                    )}
                  </div>

                  {/* NOTATKA */}
                  {supplier.notes && (
                    <div className="bg-white/40 p-3 rounded-lg border border-hairline-soft text-xs font-light text-ink">
                      <p className="font-bold eyebrow mb-1">Warunki handlowe:</p>
                      <p className="line-clamp-3 whitespace-pre-line">{supplier.notes}</p>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredSuppliers.length === 0 && (
              <div className="col-span-full card-padded text-center border-dashed py-12">
                <p className="text-body-sm font-light text-ink/50">Brak dostawców spełniających kryteria wyszukiwania.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SuppliersPanel;