import React, { useState, useEffect, ChangeEvent } from 'react';
import { ClientFormData, Client, getNipData } from '../services/api';

// Props dopasowane do Dashboard.tsx
interface ClientFormProps {
  initial?: Client | null; // Przyjmuje 'Client' lub null
  onSubmit: (data: ClientFormData) => Promise<void> | void;
  onCancel: () => void;
}

const voivodeshipMap: { [key: string]: string } = {
  '0': 'Mazowieckie',
  '1': 'Podlaskie / Warmińsko-Mazurskie',
  '2': 'Lubelskie / Świętokrzyskie',
  '3': 'Małopolskie / Podkarpackie',
  '4': 'Śląskie / Opolskie',
  '5': 'Dolnośląskie',
  '6': 'Wielkopolskie / Lubuskie',
  '7': 'Zachodniopomorskie / Pomorskie',
  '8': 'Kujawsko-Pomorskie / Pomorskie',
  '9': 'Łódzkie'
};

const emptyForm = (c?: Client | null): ClientFormData => ({
  companyName: c?.companyName || '',
  type: (c?.type as 'sklep' | 'zakład' | 'agencja') || 'sklep',
  nip: c?.nip || '',
  contactPerson: c?.contactPerson || '',
  email: c?.email || '',
  phone: c?.phone || '',
  address: {
    street:   c?.address?.street   || '',
    number:   c?.address?.number   || '',
    city:     c?.address?.city     || '',
    zipCode:  c?.address?.zipCode  || '',
    province: c?.address?.province || '',
  },
});

const ClientForm: React.FC<ClientFormProps> = ({ initial, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState<ClientFormData>(emptyForm(initial));
  const [nipLoading, setNipLoading] = useState(false);
  const [nipError, setNipError] = useState('');
  const [nipSuccess, setNipSuccess] = useState('');

  // Reset formularza gdy zmienia się 'initial' (przełączanie między nowy/edytuj)
  useEffect(() => {
    setFormData(emptyForm(initial));
    setNipError('');
    setNipSuccess('');
  }, [initial]);

  // Obsługa zmian pól płaskich (companyName, type, nip, contactPerson, email, phone)
  const handleTopChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'nip') {
      setNipError('');
      setNipSuccess('');
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Obsługa zmian pól adresowych (address.*)
  const handleAddressChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name } = e.target;
    let value = e.target.value;

    if (name === 'zipCode') {
      // Zostaw tylko cyfry, maksymalnie 5
      const digits = value.replace(/\D/g, '').slice(0, 5);
      // Auto-wstaw myślnik po 2 cyfrach: XX-XXX
      value = digits.length > 2 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : digits;
    }

    // Automatyczne uzupełnianie województwa na podstawie kodu pocztowego
    let province = formData.address.province;
    if (name === 'zipCode' && value.length >= 1) {
      province = voivodeshipMap[value[0]] || '';
    }

    setFormData(prev => ({
      ...prev,
      address: { ...prev.address, [name]: value, province }
    }));
  };

  // Pobierz dane firmy z GUS na podstawie NIP
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
      setNipSuccess(`✓ Pobrano dane: ${data.companyName}`);
    } catch (err) {
      setNipError(err instanceof Error ? err.message : 'Błąd pobierania danych');
    } finally {
      setNipLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>{initial ? 'Edytuj dane' : 'Dodaj nowego klienta'}</h2>
        <button onClick={onCancel} style={styles.closeBtn}>✕</button>
      </div>

      {/* TYP + NAZWA */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>Typ</label>
          <select name="type" value={formData.type} onChange={handleTopChange} style={styles.input}>
            <option value="sklep">Sklep</option>
            <option value="zakład">Zakład</option>
            <option value="agencja">Agencja</option>
          </select>
        </div>
        <div style={{ flex: 3 }}>
          <label style={styles.label}>Nazwa firmy / Klienta</label>
          <input type="text" name="companyName" value={formData.companyName} onChange={handleTopChange} style={styles.input} />
        </div>
      </div>

      {/* NIP */}
      <div style={styles.fieldGroup}>
        <label style={styles.label}>NIP</label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            name="nip"
            value={formData.nip}
            onChange={handleTopChange}
            style={{ ...styles.input, flex: 1 }}
            placeholder="np. 123-456-78-90"
            maxLength={13}
          />
          <button
            type="button"
            onClick={handleNipLookup}
            disabled={nipLoading}
            style={styles.nipBtn}
          >
            {nipLoading ? '⏳' : '🔍 Pobierz dane'}
          </button>
        </div>
        {nipError && <p style={{ color: '#dc2626', fontSize: '13px', marginTop: '4px' }}>{nipError}</p>}
        {nipSuccess && <p style={{ color: '#16a34a', fontSize: '13px', marginTop: '4px' }}>{nipSuccess}</p>}
      </div>

      {/* OSOBA KONTAKTOWA */}
      <div style={styles.fieldGroup}>
        <label style={styles.label}>Osoba kontaktowa</label>
        <input type="text" name="contactPerson" value={formData.contactPerson} onChange={handleTopChange} style={styles.input} />
      </div>

      {/* EMAIL */}
      <div style={styles.fieldGroup}>
        <label style={styles.label}>Adres E-mail</label>
        <input type="email" name="email" value={formData.email} onChange={handleTopChange} style={styles.input} />
      </div>

      {/* TELEFON */}
      <div style={styles.fieldGroup}>
        <label style={styles.label}>Telefon</label>
        <input type="tel" name="phone" value={formData.phone} onChange={handleTopChange} style={styles.input} />
      </div>

      {/* ULICA + NUMER */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
        <div style={{ flex: 3 }}>
          <label style={styles.label}>Ulica</label>
          <input type="text" name="street" value={formData.address.street} onChange={handleAddressChange} style={styles.input} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>Numer</label>
          <input type="text" name="number" value={formData.address.number} onChange={handleAddressChange} style={styles.input} placeholder="np. 12A" />
        </div>
      </div>

      {/* MIASTO */}
      <div style={styles.fieldGroup}>
        <label style={styles.label}>Miasto</label>
        <input type="text" name="city" value={formData.address.city} onChange={handleAddressChange} style={styles.input} placeholder="np. Warszawa" />
      </div>

      {/* KOD POCZTOWY + WOJEWÓDZTWO */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>Kod pocztowy</label>
          <input
            type="text"
            name="zipCode"
            value={formData.address.zipCode}
            onChange={handleAddressChange}
            style={styles.input}
            placeholder="00-000"
          />
        </div>
        <div style={{ flex: 2 }}>
          <label style={styles.label}>Województwo (wypełnia się samo)</label>
          <input
            type="text"
            name="province"
            value={formData.address.province}
            readOnly
            style={{ ...styles.input, backgroundColor: '#f0f0f0' }}
          />
        </div>
      </div>

      <button onClick={() => onSubmit(formData)} style={styles.saveBtn}>
        {initial ? 'Zapisz zmiany' : 'Dodaj klienta'}
      </button>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: '20px', backgroundColor: '#fff' },
  fieldGroup: { marginBottom: '15px', display: 'flex', flexDirection: 'column' as const },
  label: { fontWeight: 'bold', marginBottom: '5px', fontSize: '14px' },
  input: {
    border: '2px solid #000',
    padding: '10px',
    fontSize: '16px',
    borderRadius: '4px',
    color: '#000',
    width: '100%',
    boxSizing: 'border-box' as const
  },
  nipBtn: {
    backgroundColor: '#1d4ed8',
    color: '#fff',
    padding: '10px 16px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  saveBtn: {
    backgroundColor: '#000',
    color: '#fff',
    padding: '14px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    width: '100%',
    fontSize: '16px',
    fontWeight: 'bold',
    marginTop: '10px'
  },
  closeBtn: { background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }
};

export default ClientForm;
