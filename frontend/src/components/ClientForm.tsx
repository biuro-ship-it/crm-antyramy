import React, { useState, useEffect, ChangeEvent } from 'react';
import { ClientFormData, Client, getNipData } from '../services/api';

interface ClientFormProps {
  initial?: Client | null;
  onSubmit: (data: ClientFormData) => Promise<void> | void;
  onCancel: () => void;
}

// Funkcja pomocnicza do precyzyjnego mapowania dwucyfrowych prefiksów PNA na Województwa
const getVoivodeshipByZip = (zipCode: string): string => {
  const digits = zipCode.replace(/\D/g, '');
  if (digits.length < 2) return '';
  
  const prefix = parseInt(digits.slice(0, 2), 10);

  if (prefix >= 0 && prefix <= 9) {
    // Okręg 26 to Radom i okolice (woj. mazowieckie)
    if (prefix === 26) return 'Mazowieckie';
    return 'Mazowieckie';
  }
  if (prefix >= 10 && prefix <= 14) return 'Warmińsko-Mazurskie';
  if (prefix >= 15 && prefix <= 19) return 'Podlaskie';
  if (prefix >= 20 && prefix <= 24) return 'Lubelskie';
  if (prefix === 25 || prefix === 27 || prefix === 28 || prefix === 29) return 'Świętokrzyskie';
  if (prefix >= 30 && prefix <= 34) return 'Małopolskie';
  if (prefix >= 35 && prefix <= 39) return 'Podkarpackie';
  if (prefix >= 40 && prefix <= 44) return 'Śląskie';
  if (prefix >= 45 && prefix <= 49) return 'Opolskie';
  if (prefix >= 50 && prefix <= 59) return 'Dolnośląskie';
  if (prefix >= 60 && prefix <= 64) return 'Wielkopolskie';
  if (prefix >= 65 && prefix <= 69) return 'Lubuskie';
  if (prefix >= 70 && prefix <= 79) return 'Zachodniopomorskie';
  if (prefix >= 80 && prefix <= 84) return 'Pomorskie';
  if (prefix >= 85 && prefix <= 89) return 'Kujawsko-Pomorskie';
  if (prefix >= 90 && prefix <= 99) return 'Łódzkie';
  
  return '';
};

const emptyForm = (c?: Client | null): ClientFormData => ({
  companyName: c?.companyName || '',
  type: (c?.type as 'zakład' | 'sklep' | 'agencja' | 'inne') || 'zakład',
  nip: c?.nip || '',
  contactPerson: c?.contactPerson || '',
  email: c?.email || '',
  phone: c?.phone || '',
  address: {
    street: c?.address?.street || '',
    number: c?.address?.number || '',
    city: c?.address?.city || '',
    zipCode: c?.address?.zipCode || '',
    province: c?.address?.province || '',
  },
  relationshipColor: c?.relationshipColor || 'default',
});

const ClientForm: React.FC<ClientFormProps> = ({ initial, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState<ClientFormData>(emptyForm(initial));
  const [nipLoading, setNipLoading] = useState(false);
  const [nipError, setNipError] = useState('');
  const [nipSuccess, setNipSuccess] = useState('');

  useEffect(() => {
    setFormData(emptyForm(initial));
    setNipError('');
    setNipSuccess('');
  }, [initial]);

  const handleTopChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'nip') {
      setNipError('');
      setNipSuccess('');
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddressChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name } = e.target;
    let value = e.target.value;

    if (name === 'zipCode') {
      const digits = value.replace(/\D/g, '').slice(0, 5);
      value = digits.length > 2 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : digits;
    }

    // Wyznaczenie województwa na podstawie pierwszych dwóch cyfr nowego kodu pocztowego
    let province = formData.address.province;
    if (name === 'zipCode') {
      province = getVoivodeshipByZip(value);
    }

    setFormData(prev => ({
      ...prev,
      address: { ...prev.address, [name]: value, province },
    }));
  };

  const handleNipLookup = async () => {
    const nipClean = formData.nip.replace(/[-\s]/g, '');
    if (nipClean.length !== 10) {
      setNipError('NIP musi mieć 10 cyfr');
      return;
    }
    setNipLoading(true);
    setNipError('');
    setNipSuccess('');
    try {
      const data = await getNipData(nipClean);
      setFormData(prev => ({
        ...prev,
        companyName: data.companyName || prev.companyName,
      }));
      setNipSuccess(`Pobrano dane: ${data.companyName}`);
    } catch (err) {
      setNipError(err instanceof Error ? err.message : 'Błąd pobierania danych');
    } finally {
      setNipLoading(false);
    }
  };

  const labelClass = 'eyebrow block mb-2';

  return (
    <div className={`card-padded transition-colors ${
      formData.relationshipColor === 'lilac' ? 'bg-block-lilac' :
      formData.relationshipColor === 'cream' ? 'bg-block-cream' :
      formData.relationshipColor === 'pink' ? 'bg-block-pink' :
      formData.relationshipColor === 'mint' ? 'bg-block-mint' : 'bg-canvas'
    }`}>
      <div className="flex justify-between items-start mb-6">
        <h2 className="section-title">{initial ? 'Edytuj dane' : 'Dodaj nowego klienta'}</h2>
        <button type="button" onClick={onCancel} className="btn-tertiary" aria-label="Zamknij">
          ✕
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
        <div className="md:col-span-1">
          <label className={labelClass}>Typ</label>
          <select name="type" value={formData.type} onChange={handleTopChange} className="select-field bg-white">
            <option value="zakład">Zakład</option>
            <option value="sklep">Sklep</option>
            <option value="agencja">Agencja</option>
            <option value="inne">Inne</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Nazwa firmy</label>
          <input type="text" name="companyName" value={formData.companyName} onChange={handleTopChange} className="input-field bg-white" />
        </div>
        
        {/* WYBÓR KOLORU KARTY */}
        <div className="md:col-span-2">
          <label className={labelClass}>Kolor etykiety na liście</label>
          <div className="flex gap-3 mt-3">
            {[
              { id: 'default', bg: 'bg-white' },
              { id: 'lilac', bg: 'bg-block-lilac' },
              { id: 'cream', bg: 'bg-block-cream' },
              { id: 'pink', bg: 'bg-block-pink' },
              { id: 'mint', bg: 'bg-block-mint' },
            ].map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, relationshipColor: c.id }))}
                className={`w-8 h-8 rounded-full border border-hairline transition-transform shadow-sm ${c.bg} ${
                  formData.relationshipColor === c.id ? 'ring-2 ring-offset-2 ring-ink scale-110' : 'opacity-50 hover:opacity-100 hover:scale-105'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <label className={labelClass}>NIP</label>
        <div className="flex gap-3">
          <input
            type="text"
            name="nip"
            value={formData.nip}
            onChange={handleTopChange}
            className="input-field flex-1 bg-white"
            placeholder="np. 123-456-78-90"
            maxLength={13}
          />
          <button type="button" onClick={handleNipLookup} disabled={nipLoading} className="btn-secondary shrink-0 bg-white">
            {nipLoading ? '…' : 'Pobierz dane'}
          </button>
        </div>
        {nipError && <p className="text-body-sm mt-2">{nipError}</p>}
        {nipSuccess && <p className="text-body-sm font-medium mt-2 text-success">✓ {nipSuccess}</p>}
      </div>

      <div className="mb-4">
        <label className={labelClass}>Osoba kontaktowa</label>
        <input type="text" name="contactPerson" value={formData.contactPerson} onChange={handleTopChange} className="input-field bg-white" />
      </div>

      <div className="mb-4">
        <label className={labelClass}>E-mail</label>
        <input type="email" name="email" value={formData.email} onChange={handleTopChange} className="input-field bg-white" />
      </div>

      <div className="mb-4">
        <label className={labelClass}>Telefon</label>
        <input type="tel" name="phone" value={formData.phone} onChange={handleTopChange} className="input-field bg-white" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div className="md:col-span-3">
          <label className={labelClass}>Ulica</label>
          <input type="text" name="street" value={formData.address.street} onChange={handleAddressChange} className="input-field bg-white" />
        </div>
        <div>
          <label className={labelClass}>Numer</label>
          <input type="text" name="number" value={formData.address.number} onChange={handleAddressChange} className="input-field bg-white" placeholder="12A" />
        </div>
      </div>

      <div className="mb-4">
        <label className={labelClass}>Miasto</label>
        <input type="text" name="city" value={formData.address.city} onChange={handleAddressChange} className="input-field bg-white" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className={labelClass}>Kod pocztowy</label>
          <input type="text" name="zipCode" value={formData.address.zipCode} onChange={handleAddressChange} className="input-field bg-white" placeholder="00-000" />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Województwo</label>
          <input type="text" name="province" value={formData.address.province} readOnly className="input-field bg-white/50" />
        </div>
      </div>

      <button type="button" onClick={() => onSubmit(formData)} className="btn-primary w-full">
        {initial ? 'Zapisz zmiany' : 'Dodaj klienta'}
      </button>
    </div>
  );
};

export default ClientForm;