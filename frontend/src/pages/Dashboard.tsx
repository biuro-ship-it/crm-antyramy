import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useClients } from '../hooks/useClients';
import ClientForm from '../components/ClientForm';
import ClientList from '../components/ClientList';
import ClientCard from '../components/ClientCard';
import ProductsPanel from '../components/ProductsPanel';
import PromotionsPanel from '../components/PromotionsPanel';
import EmailTemplatesPanel from '../components/EmailTemplatesPanel';
import NotesPanel from '../components/NotesPanel';
import SuppliersPanel from '../components/SuppliersPanel';
import ArchivePanel from '../components/ArchivePanel';
import CalendarPanel from '../components/CalendarPanel';
import KanbanPanel from '../components/KanbanPanel';
import MobileNav from '../components/MobileNav';
import AdminPanel from '../components/AdminPanel';
import { Client, ClientFormData, FollowUp, getFollowUpSummary, updateFollowUpStatus } from '../services/api';
import { User } from 'firebase/auth';

// DODANE: 'suppliers' do dostępnych zakładek
type ActiveTab = 'clients' | 'calendar' | 'kanban' | 'products' | 'promotions' | 'email-templates' | 'notes' | 'suppliers' | 'archive' | 'admin';

interface DashboardProps {
  user: User;
  onSignOut: () => void;
}

const TABS: { id: ActiveTab; label: string }[] = [
  { id: 'clients', label: 'Klienci' },
  { id: 'calendar', label: 'Kalendarz' },
  { id: 'kanban', label: 'Kanban' },
  { id: 'products', label: 'Produkty' },
  { id: 'promotions', label: 'Promocje' },
  { id: 'email-templates', label: 'Szablony maili' },
  { id: 'notes', label: 'Notatki' },
  { id: 'suppliers', label: 'Dostawcy' }, // DODANE: Zakładka w nawigacji
  { id: 'archive', label: 'Archiwum' },
  { id: 'admin', label: 'Administracja' },
];

const Dashboard: React.FC<DashboardProps> = ({ user, onSignOut }) => {
  const { clients, loading, error, fetchClients, createClient, updateClient, removeClient } = useClients();
  const [activeTab, setActiveTab] = useState<ActiveTab>('clients');
  const [showForm, setShowForm] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [viewClient, setViewClient] = useState<Client | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<FollowUp[]>([]);

  const loadTasks = useCallback(async () => {
    try {
      const summary = await getFollowUpSummary();
      setTasks(summary);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchClients();
    loadTasks();
  }, [fetchClients, loadTasks]);

  const switchTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setShowForm(false);
    setViewClient(null);
    setDrawerOpen(false);
  };


  const handleAddClick = () => { setEditClient(null); setViewClient(null); setShowForm(true); };
  const handleEditClick = (client: Client) => { setEditClient(client); setViewClient(null); setShowForm(true); };
  const handleViewClick = (client: Client) => { setShowForm(false); setViewClient(client); };

  const handleSubmit = async (data: ClientFormData) => {
    setSubmitError(null);
    try {
      if (editClient) {
        const updated = await updateClient(editClient.id, data);
        if (viewClient?.id === updated.id) setViewClient(updated);
      } else {
        await createClient(data);
      }
      setShowForm(false);
      setEditClient(null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Błąd zapisu. Spróbuj ponownie.');
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      await updateFollowUpStatus(taskId, 'zrealizowane');
      loadTasks();
    } catch {
      alert('Błąd podczas kończenia zadania.');
    }
  };

  const isOverdue = (dateStr: string) => new Date().toISOString().split('T')[0] > dateStr;

  const activeThisMonth = clients.filter(c => {
    const dateToUse = c.lastContactAt || c.createdAt;
    if (!dateToUse) return false;
    return Math.floor((new Date().getTime() - new Date(dateToUse).getTime()) / 86400000) <= 30;
  }).length;

  // Unikalne trasy dla autocomplete w formularzu
  const existingRoutes = useMemo(() =>
    Array.from(new Set(clients.map(c => c.route?.trim()).filter((r): r is string => !!r))).sort((a, b) => a.localeCompare(b, 'pl')),
    [clients]
  );

  const handleDeleteClient = async (id: string) => {
    try {
      await removeClient(id);
      setShowForm(false);
      setEditClient(null);
      alert('Klient został pomyślnie usunięty.');
    } catch (err) {
      alert('Wystąpił błąd podczas usuwania klienta.');
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <nav className="sticky top-0 z-20 h-14 bg-canvas border-b border-hairline px-4 md:px-6 flex justify-between items-center gap-4">
        <div className="flex items-center gap-4 md:gap-8 min-w-0">
          <button
            type="button"
            onClick={() => switchTab('clients')}
            className="flex items-center gap-2 shrink-0 hover:opacity-70 transition-opacity"
          >
            <img src="/icona.png" alt="CRM Antyramy" className="h-6 w-6" />
            <h1 className="text-body-sm font-semibold text-ink hidden sm:block">CRM Antyramy</h1>
          </button>
          {/* Tabs — tylko na desktop */}
          <div className="hidden md:flex items-center gap-1 bg-surface-soft rounded-pill p-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => switchTab(tab.id)}
                className={activeTab === tab.id ? 'nav-tab-active' : 'nav-tab-inactive'}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-body-sm font-light text-ink hidden lg:block max-w-[200px] truncate">{user?.email}</span>
          <button type="button" onClick={onSignOut} className="btn-tertiary hidden md:block">
            Wyloguj
          </button>
          {/* Hamburger — tylko mobile */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="md:hidden p-2 rounded-lg hover:bg-surface-soft transition text-ink text-xl leading-none"
            aria-label="Menu"
          >
            ☰
          </button>
        </div>
      </nav>

      {/* Drawer — mobile */}
      {drawerOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="md:hidden fixed inset-y-0 right-0 z-50 w-72 bg-canvas shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-hairline">
              <span className="font-semibold text-ink">Menu</span>
              <button onClick={() => setDrawerOpen(false)} className="text-ink text-xl leading-none p-1">✕</button>
            </div>
            <div className="flex flex-col p-3 gap-1 overflow-y-auto flex-1">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => switchTab(tab.id)}
                  className={`text-left px-4 py-3 rounded-xl text-sm font-medium transition ${
                    activeTab === tab.id
                      ? 'bg-ink text-canvas'
                      : 'text-ink hover:bg-surface-soft'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="p-4 border-t border-hairline">
              <p className="text-xs text-ink opacity-50 mb-3 truncate">{user?.email}</p>
              <button onClick={onSignOut} className="btn-secondary w-full text-sm">
                Wyloguj
              </button>
            </div>
          </div>
        </>
      )}

      <main className="max-w-content mx-auto p-6 md:px-8 pb-32 md:pb-8">
        {activeTab === 'clients' && !viewClient && !showForm && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-section">
            <div className="color-block-lime flex items-center gap-4">
              <span className="text-3xl" aria-hidden>🏢</span>
              <div>
                <p className="eyebrow">Baza firm</p>
                <p className="text-card-title">{clients.length}</p>
              </div>
            </div>
            <div className="color-block-lilac flex items-center gap-4">
              <span className="text-3xl" aria-hidden>⏰</span>
              <div>
                <p className="eyebrow">Zadania</p>
                <p className="text-card-title">{tasks.length}</p>
              </div>
            </div>
            <div className="color-block-cream flex items-center gap-4">
              <span className="text-3xl" aria-hidden>📈</span>
              <div>
                <p className="eyebrow">Aktywni (30 dni)</p>
                <p className="text-card-title">{activeThisMonth}</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'clients' && !viewClient && !showForm && tasks.length > 0 && (
          <section className="mb-section">
            <h2 className="section-title mb-6">Do wykonania na dziś</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tasks.map(task => (
                <div
                  key={task.id}
                  className={`card-padded flex flex-col justify-between ${isOverdue(task.dueDate) ? 'color-block-pink' : 'color-block-coral'}`}
                >
                  <div>
                    <span className={`badge ${isOverdue(task.dueDate) ? 'badge-coral' : 'badge-cream'}`}>
                      {isOverdue(task.dueDate) ? 'Zaległe' : 'Dziś'} · {task.dueDate}
                    </span>
                    <h3 className="text-card-title mt-3">{task.clientName}</h3>
                    <p className="text-body-sm font-light mt-2">{task.reminderText}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCompleteTask(task.id!)}
                    className="btn-secondary w-full mt-4"
                  >
                    Oznacz jako zrobione
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'clients' && (
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-8">
            <div>
              <h2 className="page-title">
                {viewClient ? 'Karta klienta' : showForm ? (editClient ? 'Edycja klienta' : 'Nowy klient') : 'Twoi klienci'}
              </h2>
              <p className="text-body-sm font-light mt-2">
                {viewClient ? viewClient.companyName : showForm ? 'Wypełnij formularz poniżej' : 'Zarządzaj bazą relacji biznesowych'}
              </p>
            </div>
            {viewClient ? (
              <button type="button" onClick={() => { setViewClient(null); loadTasks(); }} className="btn-secondary">
                ← Wróć do listy
              </button>
            ) : (
              <button type="button" onClick={showForm ? () => setShowForm(false) : handleAddClick} className="btn-primary">
                {showForm ? 'Zamknij formularz' : '＋ Dodaj klienta'}
              </button>
            )}
          </div>
        )}

        {activeTab === 'calendar' ? (
          <CalendarPanel />
        ) : activeTab === 'kanban' ? (
          <KanbanPanel />
        ) : activeTab === 'products' ? (
          <ProductsPanel />
        ) : activeTab === 'promotions' ? (
          <PromotionsPanel />
        ) : activeTab === 'email-templates' ? (
          <EmailTemplatesPanel />
        ) : activeTab === 'notes' ? (
          <NotesPanel />
        ) : activeTab === 'suppliers' ? ( // DODANE: Logika ładowania Panelu Dostawców
          <SuppliersPanel />
        ) : activeTab === 'archive' ? (
          <ArchivePanel />
        ) : activeTab === 'admin' ? (
          <AdminPanel />
        ) : (
          <>
            {error && <div className="alert-error mb-6">⚠️ {error}</div>}
            {submitError && <div className="alert-error mb-6">⚠️ {submitError}</div>}
            {loading ? (
              <p className="text-center text-body font-light py-10">Ładowanie danych z bazy...</p>
            ) : showForm ? (
              <div className="max-w-3xl mx-auto">
                {/* Podpięcie funkcji usuwania, o której pisaliśmy wcześniej */}
                <ClientForm
                  onSubmit={handleSubmit}
                  onCancel={() => setShowForm(false)}
                  initial={editClient}
                  onDelete={handleDeleteClient}
                  existingRoutes={existingRoutes}
                />
              </div>
            ) : viewClient ? (
              <ClientCard client={viewClient} onClose={() => { setViewClient(null); loadTasks(); }} />
            ) : (
              <ClientList clients={clients} onEdit={handleEditClick} onDelete={handleDeleteClient} onView={handleViewClick} />
            )}
          </>
        )}
      </main>

      <MobileNav
        activeTab={activeTab}
        onTabChange={switchTab}
      />
    </div>
  );
};

export default Dashboard;