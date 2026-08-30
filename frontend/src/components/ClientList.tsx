import React, { useMemo } from 'react';
import { Client } from '../services/api';
import { clientTotal, clientYearTotal, clientMonthTotal, zl } from '../utils/sales';

// Stan widoku listy (filtry + strona) mieszka w Dashboardzie, bo ClientList jest
// odmontowywany na czas karty klienta — trzymany lokalnie resetowalby sie do strony 1.
export interface ClientListView {
  search: string;
  provinceFilter: string;
  routeFilter: string;
  sortBy: string;
  currentPage: number;
}

export const emptyClientListView = (): ClientListView => ({
  search: '',
  provinceFilter: '',
  routeFilter: '',
  sortBy: 'alpha',
  currentPage: 1,
});

interface ClientListProps {
  clients: Client[];
  onEdit: (client: Client) => void;
  onDelete?: (id: string) => void;
  onView: (client: Client) => void;
  view: ClientListView;
  onViewChange: (next: ClientListView) => void;
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
  pink: 'bg-block-gray',
  mint: 'bg-block-mint',
};

const ClientList: React.FC<ClientListProps> = ({ clients, onEdit, onView, view, onViewChange }) => {
  const { search, provinceFilter, routeFilter, sortBy, currentPage } = view;

  // Zmiana filtra/sortowania cofa na pierwszą stronę; samo przewijanie stron jej nie rusza.
  const setFilters = (patch: Partial<ClientListView>) =>
    onViewChange({ ...view, ...patch, currentPage: 1 });
  const goToPage = (page: number) => onViewChange({ ...view, currentPage: page });

  // Unikalne trasy z listy klientów (tylko niepuste)
  const availableRoutes = useMemo(() => {
    const routes = clients
      .map(c => c.route?.trim())
      .filter((r): r is string => !!r);
    return Array.from(new Set(routes)).sort((a, b) => a.localeCompare(b, 'pl'));
  }, [clients]);

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
  // Gdy lista sie skurczy (usuniety klient, wezszy filtr), zapamietana strona moze
  // wypasc poza zakres — pokazujemy wtedy ostatnia istniejaca zamiast pustki.
  const page = Math.min(Math.max(currentPage, 1), totalPages);
  const paginated = processed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Sumy sprzedaży dla aktualnie przefiltrowanej listy
  const salesSummary = useMemo(() => {
    let all = 0, year = 0, month = 0;
    for (const c of processed) {
      all += clientTotal(c);
      year += clientYearTotal(c);
      month += clientMonthTotal(c);
    }
    return { all, year, month };
  }, [processed]);

  const hasSales = salesSummary.all > 0;

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
            onChange={(e) => setFilters({ search: e.target.value })}
          />
          <select className="select-field md:w-56" value={sortBy} onChange={(e) => setFilters({ sortBy: e.target.value })}>
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
                onClick={() => setFilters({ routeFilter: '' })}
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
                    onClick={() => setFilters({ routeFilter: route === routeFilter ? '' : route })}
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
            onChange={(e) => setFilters({ provinceFilter: e.target.value })}
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
              onClick={() => setFilters({ search: '', provinceFilter: '', routeFilter: '' })}
              className="text-body-sm text-ink/50 hover:text-ink underline"
            >
              Wyczyść filtry
            </button>
          </div>
        )}
      </div>

      {/* PODSUMOWANIE SPRZEDAŻY */}
      {hasSales && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="color-block-lime flex flex-col py-4 px-5 rounded-xl">
            <span className="eyebrow text-ink/60">Cała sprzedaż</span>
            <span className="text-card-title mt-1">{zl(salesSummary.all)}</span>
          </div>
          <div className="color-block-lilac flex flex-col py-4 px-5 rounded-xl">
            <span className="eyebrow text-ink/60">Ten rok ({new Date().getFullYear()})</span>
            <span className="text-card-title mt-1">{zl(salesSummary.year)}</span>
          </div>
          <div className="color-block-cream flex flex-col py-4 px-5 rounded-xl">
            <span className="eyebrow text-ink/60">Ten miesiąc</span>
            <span className="text-card-title mt-1">{zl(salesSummary.month)}</span>
          </div>
        </div>
      )}

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
                      className="badge bg-block-navy text-white cursor-pointer hover:opacity-80 transition-opacity"
                      title={`Trasa: ${client.route}`}
                      onClick={() => setFilters({ routeFilter: client.route === routeFilter ? '' : (client.route || '') })}
                    >
                      🚚 {client.route}
                    </span>
                  )}
                </div>
                <button type="button" onClick={() => onEdit(client)} className="btn-tertiary text-body-sm py-1 bg-white/40 hover:bg-white/80 dark:bg-white/10 dark:hover:bg-white/20">
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
                {clientTotal(client) > 0 && (
                  <p className="font-semibold text-ink pt-1">
                    💰 {zl(clientTotal(client))}
                    <span className="font-light text-ink/50 text-caption ml-2">
                      (rok: {zl(clientYearTotal(client))})
                    </span>
                  </p>
                )}
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
            disabled={page === 1}
            onClick={() => goToPage(page - 1)}
            className="btn-tertiary disabled:opacity-30"
          >
            ← Poprzednia
          </button>
          <span className="text-body-sm font-medium px-3 py-1 bg-surface-soft rounded-md">
            Strona {page} z {totalPages}
          </span>
          <button
            type="button"
            disabled={page === totalPages}
            onClick={() => goToPage(page + 1)}
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
