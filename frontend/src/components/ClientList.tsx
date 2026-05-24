import React, { useState, useEffect } from 'react';
import { Client } from '../services/api';

interface ClientListProps {
  clients: Client[];
  onEdit: (client: Client) => void;
  onDelete?: (id: string) => void;
  onView: (client: Client) => void;
}

const PROVINCES = [
  'Dolnośląskie', 'Kujawsko-pomorskie', 'Lubelskie', 'Lubuskie',
  'Łódzkie', 'Małopolskie', 'Mazowieckie', 'Opolskie',
  'Podkarpackie', 'Podlaskie', 'Pomorskie', 'Śląskie',
  'Świętokrzyskie', 'Warmińsko-mazurskie', 'Wielkopolskie', 'Zachodniopomorskie',
];

const PAGE_SIZE = 20;

const typeBadge: Record<string, string> = {
  agencja: 'badge-lilac',
  zakład: 'badge-cream',
  inne: 'badge-mint',
  sklep: 'badge-lime',
};

// DODANE: Odwzorowanie kolorów na głównej liście
const colorClasses: Record<string, string> = {
  default: 'bg-canvas',
  lilac: 'bg-block-lilac',
  cream: 'bg-block-cream',
  pink: 'bg-block-pink',
  mint: 'bg-block-mint',
};

const ClientList: React.FC<ClientListProps> = ({ clients, onEdit, onView }) => {
  const [search, setSearch] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('');
  const [sortBy, setSortBy] = useState('alpha');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, provinceFilter, sortBy]);

  let processed = clients.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch =
      (c.companyName ?? '').toLowerCase().includes(q) ||
      (c.contactPerson ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q);
    const matchProvince = provinceFilter === '' ? true : c.address?.province === provinceFilter;
    return matchSearch && matchProvince;
  });

  processed.sort((a, b) => {
    if (sortBy === 'alpha') return (a.companyName || '').localeCompare(b.companyName || '');
    if (sortBy === 'type') return (a.type || '').localeCompare(b.type || '');
    if (sortBy === 'oldest') {
      const dateA = new Date(a.lastContactAt || a.createdAt).getTime();
      const dateB = new Date(b.lastContactAt || b.createdAt).getTime();
      return dateA - dateB;
    }
    return 0;
  });

  const totalPages = Math.ceil(processed.length / PAGE_SIZE) || 1;
  const paginated = processed.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const renderDaysCounter = (client: Client) => {
    const dateToUse = client.lastContactAt || client.createdAt;
    if (!dateToUse) return null;

    const contactDate = new Date(dateToUse);
    const today = new Date();
    contactDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((today.getTime() - contactDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays > 45) return <span className="font-semibold ml-2">({diffDays})</span>;
    if (diffDays > 21) return <span className="font-medium ml-2">({diffDays})</span>;
    return <span className="font-light ml-2">({diffDays})</span>;
  };

  return (
    <div>
      <div className="card-padded mb-6 flex flex-col md:flex-row gap-4">
        <input
          type="text"
          placeholder="Szukaj (nazwa, osoba, e-mail, telefon)..."
          className="input-field flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="select-field md:w-56" value={provinceFilter} onChange={(e) => setProvinceFilter(e.target.value)}>
          <option value="">Wszystkie województwa</option>
          {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="select-field md:w-56" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="alpha">Alfabetycznie (A–Z)</option>
          <option value="oldest">Od najstarszego kontaktu</option>
          <option value="type">Według kategorii</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {paginated.map((client) => {
          // Pobierz przypisany kolor
          const bgClass = colorClasses[client.relationshipColor || 'default'] || colorClasses.default;
          
          return (
            <div key={client.id} className={`card-padded flex flex-col h-full group transition-colors shadow-sm hover:shadow-md ${bgClass}`}>
              <div className="flex justify-between items-start mb-4">
                <span className={`${typeBadge[client.type] || 'badge-mint'} ${client.relationshipColor !== 'default' ? 'shadow-sm' : ''}`}>
                  {client.type}
                </span>
                <button type="button" onClick={() => onEdit(client)} className="btn-tertiary text-body-sm py-1 bg-white/40 hover:bg-white/80">
                  Edytuj
                </button>
              </div>

              <h3 className="text-card-title mb-1 flex flex-wrap items-center">
                {client.companyName}
                {renderDaysCounter(client)}
              </h3>
              <p className="text-body-sm font-light mb-4">{client.contactPerson || 'Brak osoby kontaktowej'}</p>

              <div className="space-y-2 mb-6 flex-grow text-body-sm font-light">
                <p>{client.address?.city || 'Brak miasta'}, {client.address?.province || '—'}</p>
                <p>{client.phone || 'Brak telefonu'}</p>
              </div>

              <button type="button" onClick={() => onView(client)} className={`btn-secondary w-full mt-auto ${client.relationshipColor && client.relationshipColor !== 'default' ? 'border-none shadow-sm' : ''}`}>
                Otwórz kartę klienta
              </button>
            </div>
          );
        })}
        {paginated.length === 0 && (
          <div className="col-span-full card-padded text-center border-dashed">
            <p className="text-body-sm font-light">Brak wyników dla obecnych filtrów.</p>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 card px-6 py-3 w-max mx-auto">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => prev - 1)}
            className="btn-tertiary disabled:opacity-30"
          >
            ← Poprzednia
          </button>
          <span className="text-body-sm font-medium px-3 py-1 bg-surface-soft rounded-md">
            Strona {currentPage} z {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => prev + 1)}
            className="btn-tertiary disabled:opacity-30"
          >
            Następna →
          </button>
        </div>
      )}
    </div>
  );
};

export default ClientList;