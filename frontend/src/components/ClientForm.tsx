import React, { useState, useEffect, ChangeEvent } from 'react';
import { ClientFormData, Client } from '../services/api';

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


const ClientForm: React.FC<ClientFormProps> = ({ initial, onSubmit, onCancel }) => {
  // Mapowanie danych z obiektu Client na pola formularza (kluczowe przy edycji!)
  const [formData, setFormData] = useState<ClientFormData>({
    companyName: initial?.companyName || '',
    type: initial?.type || 'sklep',
    contactPerson: initial?.contactPerson || '',
    email: initial?.email || '',
    phone: initial?.phone || '',
    address: {
      street:   initial?.address?.street   || '',
      number:   initial?.address?.number   || '',
      city:     initial?.address?.city     || '',
      zipCode:  initial?.address?.zipCode  || '',
      province: initial?.address?.province || ''
    }
  });

  // Reset formularza gdy zmienia się 'initial' (przełączanie między nowy/edytuj)
  useEffect(() => {
    setFormData({
      companyName: initial?.companyName || '',
      type: initial?.type || 'sklep',
      contactPerson: initial?.contactPerson || '',
      email: initial?.email || '',
      phone: initial?.phone || '',
      address: {
        street:   initial?.address?.street   || '',
        number:   initial?.address?.number   || '',
        city:     initial?.address?.city     || '',
        zipCode:  initial?.address?.zipCode  || '',
        province: initial?.address?.province || ''
      }
    });
  }, [initial]);

  // Obsługa zmian pól płaskich (companyName, type, contactPerson, email, phone)
  const handleTopChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Obsługa zmian pól adresowych (address.*)
  const handleAddressChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

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
            <option value="hurt">Hurt</option>
            <option value="sklep">Sklep</option>
          </select>
        </div>
        <div style={{ flex: 3 }}>
          <label style={styles.label}>Nazwa firmy / Klienta</label>
          <input type="text" name="companyName" value={formData.companyName} onChange={handleTopChange} style={styles.input} />
        </div>
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
