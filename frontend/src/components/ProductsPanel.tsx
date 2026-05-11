import React, { useState, useEffect, useRef } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../services/firebase';
import {
  Product, ProductFormData,
  getProductsList, createProduct, updateProduct, deleteProduct
} from '../services/api';

// ─── Pusty formularz ────────────────────────────────────────────────────────
const emptyForm = (): ProductFormData => ({
  name: '',
  code: '',
  priceNetto: 0,
  imageUrl: ''
});

// ─── Formularz dodawania / edycji produktu ───────────────────────────────────
interface ProductFormProps {
  initial: ProductFormData;
  onSave: (data: ProductFormData) => Promise<void>;
  onCancel: () => void;
  saveLabel: string;
}

const ProductForm: React.FC<ProductFormProps> = ({ initial, onSave, onCancel, saveLabel }) => {
  const [form, setForm] = useState<ProductFormData>(initial);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setForm(prev => ({ ...prev, imageUrl: url }));
    } catch {
      setUploadError('Nie udało się wgrać zdjęcia. Spróbuj ponownie.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-50 rounded-2xl border border-slate-200 p-6 mb-6 animate-in fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

        {/* Nazwa */}
        <div className="md:col-span-2">
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Nazwa produktu *</label>
          <input
            required
            type="text"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="np. Pluszek Maxi mix"
            className="w-full border border-slate-200 rounded-xl p-3 outline-none focus:border-blue-500 bg-white"
          />
        </div>

        {/* Kod produktu */}
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Kod produktu</label>
          <input
            type="text"
            value={form.code}
            onChange={e => setForm({ ...form, code: e.target.value })}
            placeholder="np. PLX-001"
            className="w-full border border-slate-200 rounded-xl p-3 outline-none focus:border-blue-500 bg-white"
          />
        </div>

        {/* Cena netto */}
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Cena netto (zł)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.priceNetto}
            onChange={e => setForm({ ...form, priceNetto: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
            className="w-full border border-slate-200 rounded-xl p-3 outline-none focus:border-blue-500 bg-white"
          />
        </div>

        {/* Zdjęcie */}
        <div className="md:col-span-2">
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Zdjęcie produktu</label>
          <div className="flex items-center gap-4">
            {form.imageUrl && (
              <img src={form.imageUrl} alt="podgląd" className="w-16 h-16 object-cover rounded-xl border border-slate-200 shrink-0" />
            )}
            <div className="flex-1">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-xl p-4 text-sm text-slate-500 hover:text-blue-600 transition-colors text-center disabled:opacity-60"
              >
                {uploading ? '⏳ Wgrywam zdjęcie...' : '📸 Kliknij aby wybrać zdjęcie (JPG, PNG)'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              {uploadError && <p className="text-red-500 text-xs mt-1">{uploadError}</p>}
              {form.imageUrl && !uploading && (
                <p className="text-emerald-600 text-xs mt-1">✓ Zdjęcie wgrane</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel}
          className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-100 transition-colors">
          Anuluj
        </button>
        <button type="submit" disabled={saving || uploading}
          className="px-6 py-2.5 bg-slate-900 hover:bg-blue-600 text-white font-bold rounded-xl transition-colors disabled:opacity-60">
          {saving ? 'Zapisuję...' : saveLabel}
        </button>
      </div>
    </form>
  );
};

// ─── Główny panel ─────────────────────────────────────────────────────────────
const ProductsPanel: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await getProductsList();
      setProducts(data);
    } catch {
      setError('Nie udało się pobrać listy produktów.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (data: ProductFormData) => {
    const newProduct = await createProduct(data);
    setProducts(prev => [...prev, newProduct].sort((a, b) => a.name.localeCompare(b.name)));
    setShowAddForm(false);
  };

  const handleUpdate = async (id: string, data: ProductFormData) => {
    const updated = await updateProduct(id, data);
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p));
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteProduct(id);
    setProducts(prev => prev.filter(p => p.id !== id));
    setDeleteConfirm(null);
  };

  return (
    <div>
      {/* Nagłówek + przycisk dodaj */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">Baza Produktów</h2>
          <p className="text-slate-500 text-sm mt-1">Zarządzaj swoją ofertą — {products.length} {products.length === 1 ? 'produkt' : 'produktów'}</p>
        </div>
        <button
          onClick={() => { setShowAddForm(v => !v); setEditingId(null); }}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center gap-2"
        >
          {showAddForm ? '✕ Anuluj' : '＋ Dodaj produkt'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-4">⚠️ {error}</div>}

      {/* Formularz dodawania */}
      {showAddForm && (
        <ProductForm
          initial={emptyForm()}
          onSave={handleAdd}
          onCancel={() => setShowAddForm(false)}
          saveLabel="Dodaj produkt"
        />
      )}

      {/* Lista produktów */}
      {loading ? (
        <div className="text-center text-slate-400 py-12 animate-pulse">Ładowanie produktów...</div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <span className="text-4xl block mb-3">📦</span>
          <p className="text-slate-500">Brak produktów. Dodaj pierwszy produkt powyżej.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {products.map(product => (
            <div key={product.id}>
              {editingId === product.id ? (
                <ProductForm
                  initial={{ name: product.name, code: product.code, priceNetto: product.priceNetto, imageUrl: product.imageUrl }}
                  onSave={(data) => handleUpdate(product.id, data)}
                  onCancel={() => setEditingId(null)}
                  saveLabel="Zapisz zmiany"
                />
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  {/* Zdjęcie */}
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="w-full h-40 object-cover" />
                  ) : (
                    <div className="w-full h-40 bg-slate-100 flex items-center justify-center text-slate-400 text-4xl">📦</div>
                  )}

                  {/* Dane */}
                  <div className="p-4">
                    <h3 className="font-bold text-slate-800 text-base leading-tight mb-1">{product.name}</h3>
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-xs text-slate-400 font-mono">{product.code || '—'}</span>
                      <span className="text-base font-black text-slate-900">
                        {product.priceNetto > 0 ? `${product.priceNetto.toFixed(2)} zł` : <span className="text-slate-300">brak ceny</span>}
                      </span>
                    </div>

                    {/* Akcje */}
                    {deleteConfirm === product.id ? (
                      <div className="flex gap-2">
                        <button onClick={() => handleDelete(product.id)}
                          className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 rounded-lg transition-colors">
                          ✓ Tak, usuń
                        </button>
                        <button onClick={() => setDeleteConfirm(null)}
                          className="flex-1 border border-slate-200 text-slate-600 text-xs font-bold py-2 rounded-lg hover:bg-slate-50 transition-colors">
                          Anuluj
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingId(product.id); setShowAddForm(false); }}
                          className="flex-1 border border-slate-200 text-slate-700 text-xs font-bold py-2 rounded-lg hover:bg-slate-50 transition-colors">
                          ✎ Edytuj
                        </button>
                        <button onClick={() => setDeleteConfirm(product.id)}
                          className="px-3 border border-red-100 text-red-400 text-xs font-bold py-2 rounded-lg hover:bg-red-50 transition-colors">
                          🗑
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductsPanel;
