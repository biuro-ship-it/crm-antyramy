import React, { useState, useEffect, useMemo } from 'react';
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
  const [routeFilter, setRouteFilter] = useState('');
  const [sortBy, setSortBy] = useState('alpha');
  const [currentPage, setCurrentPage] = useState(1);

  // Unikalne trasy z listy klientów (tylko niepuste)
  const availableRoutes = useMemo(() => {
    const routes = clients
      .map(c => c.route?.trim())
      .filter((r): r is string => !!r);
    return Array.from(new Set(routes)).sort((a, b) => a.localeCompare(b, 'pl'));
  }, [clients]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, provinceFilter, routeFilter, sortBy]);

  let processed = clients.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch =
      (c.companyName ?? '').toLowerCase().includes(q) ||
      (c.contactPerson ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q);
    const matchProvince = provinceFilter === '' ? true : c.address?.province === provinceFilter;
    const matchRoute = routeFilter === '' ? true : (c.route?.trim() || '') === routeFilter;
    return matchSearch && matchProvince && matchRoute;
  });

  processed.sort((a, b) => {
    if (sortBy === 'alpha') return (a.companyName || '').localeCompare(b.companyName || '', 'pl');
    if (sortBy === 'type') return (a.type || '').localeCompare(b.type || '', 'pl');
    if (sortBy === 'route') {
      const ra = a.route || '';
      const rb = b.route || '';
      if (ra === rb) return (a.companyName || '').localeCompare(b.companyName || '', 'pl');
      if (!ra) return 1;
      if (!rb) return -1;
      return ra.localeCompare(rb, 'pl');
    }
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
      {/* FILTRY */}
      <div className="card-padded mb-6 flex flex-col gap-3">
        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            placeholder="Szukaj (nazwa, osoba, e-mail, telefon)..."
            className="input-field flex-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="select-field md:w-56" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="alpha">Alfabetycznie (A–Z)</option>
            <option value="route">Według trasy</option>
            <option value="oldest">Od najstarszego kontaktu</option>
            <option value="type">Według kategorii</option>
          </select>
        </div>

        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
          {/* FILTR TRAS — główny */}
          <div className="flex-1">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="eyebrow text-ink/50 shrink-0">Trasa:</span>
              <button
                type="button"
                onClick={() => setRouteFilter('')}
                className={`px-3 py-1.5 rounded-pill text-body-sm font-medium transition-colors border ${
                  routeFilter === ''
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-canvas text-ink border-hairline hover:bg-surface-soft'
                }`}
              >
                Wszystkie
                <span className="ml-1.5 text-caption font-mono opacity-60">({clients.length})</span>
              </button>
              {availableRoutes.map(route => {
                const count = clients.filter(c => c.route?.trim() === route).length;
                return (
                  <button
                    key={route}
                    type="button"
                    onClick={() => setRouteFilter(route === routeFilter ? '' : route)}
                    className={`px-3 py-1.5 rounded-pill text-body-sm font-medium transition-colors border ${
                      routeFilter === route
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-canvas text-ink border-hairline hover:bg-surface-soft'
                    }`}
                  >
                    {route}
                    <span className="ml-1.5 text-caption font-mono opacity-60">({count})</span>
                  </button>
                );
              })}
              {availableRoutes.length === 0 && (
                <span className="text-body-sm text-ink/40 font-light italic">
                  Brak zdefiniowanych tras — przypisz trasę w edycji klienta
                </span>
              )}
            </div>
          </div>

          {/* FILTR WOJEWÓDZTWA */}
          <select
            className="select-field md:w-56 shrink-0"
            value={provinceFilter}
            onChange={(e) => setProvinceFilter(e.target.value)}
          >
            <option value="">Wszystkie województwa</option>
            {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* INFO O AKTYWNYCH FILTRACH */}
        {(routeFilter || provinceFilter || search) && (
          <div className="flex items-center gap-3 pt-1 border-t border-hairline-soft">
            <span className="text-body-sm text-ink/50 font-light">
              Wyniki: <strong className="text-ink">{processed.length}</strong> z {clients.length} klientów
            </span>
            <button
              type="button"
              onClick={() => { setSearch(''); setProvinceFilter(''); setRouteFilter(''); }}
              className="text-body-sm text-ink/50 hover:text-ink underline"
            >
              Wyczyść filtry
            </button>
          </div>
        )}
      </div>

      {/* LISTA KLIENTÓW */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {paginated.map((client) => {
          const bgClass = colorClasses[client.relationshipColor || 'default'] || colorClasses.default;

          return (
            <div key={client.id} className={`card-padded flex flex-col h-full group transition-colors shadow-sm hover:shadow-md ${bgClass}`}>
              <div className="flex justify-between items-start mb-3">
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className={`${typeBadge[client.type] || 'badge-mint'} ${client.relationshipColor !== 'default' ? 'shadow-sm' : ''}`}>
                    {client.type}
                  </span>
                  {client.route && (
                    <span
                      className="badge bg-block-navy text-inverse-ink cursor-pointer hover:opacity-80 transition-opacity"
                      title={`Trasa: ${client.route}`}
                      onClick={() => setRouteFilter(client.route === routeFilter ? '' : (client.route || ''))}
                    >
                      🚚 {client.route}
                    </span>
                  )}
                </div>
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
