import React, { useEffect, useState } from 'react';
import {
  Campaign, CampaignSummary, Client, Product,
  getCampaigns, getCampaign, getClients, getProductsList, getColorLabels, deleteCampaign,
} from '../services/api';
import CampaignEditor from './CampaignEditor';
import CampaignDetails from './CampaignDetails';

type View =
  | { mode: 'list' }
  | { mode: 'edit'; campaign: Campaign | null }
  | { mode: 'details'; id: string };

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const STATUS: Record<CampaignSummary['status'], { label: string; cls: string }> = {
  draft:   { label: 'szkic', cls: 'bg-surface-soft text-ink' },
  sending: { label: 'przerwana', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
  sent:    { label: 'wysłana', cls: 'badge-mint' },
};

// Zakładka „Kampanie” (następca Promocji): lista → edytor szkicu / szczegóły wysłanej.
const CampaignsPanel: React.FC = () => {
  const [view, setView] = useState<View>({ mode: 'list' });
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [colorLabels, setColorLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);

  const loadList = () => getCampaigns().then(setCampaigns).catch(e => setError((e as Error).message));
  const loadClients = () => getClients().then(setClients).catch(e => setError((e as Error).message));

  useEffect(() => {
    Promise.all([
      loadList(),
      loadClients(),
      getProductsList().then(setProducts),
      getColorLabels().then(l => setColorLabels(l?.clients ?? {})).catch(() => undefined),
    ])
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const backToList = () => { setView({ mode: 'list' }); loadList(); };

  const openCampaign = async (c: CampaignSummary) => {
    if (c.status !== 'draft') { setView({ mode: 'details', id: c.id }); return; }
    setOpeningId(c.id);
    try {
      setView({ mode: 'edit', campaign: await getCampaign(c.id) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOpeningId(null);
    }
  };

  const removeDraft = async (c: CampaignSummary) => {
    if (!window.confirm(`Usunąć szkic „${c.name}”?`)) return;
    try {
      await deleteCampaign(c.id);
      loadList();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-32 text-ink font-light">Wczytywanie...</div>;

  if (view.mode === 'edit') {
    return (
      <CampaignEditor
        key={view.campaign?.id ?? 'new'}
        campaign={view.campaign}
        clients={clients}
        products={products}
        colorLabels={colorLabels}
        onClose={backToList}
        onSent={id => { loadClients(); loadList(); setView({ mode: 'details', id }); }}
      />
    );
  }

  if (view.mode === 'details') {
    return (
      <CampaignDetails
        campaignId={view.id}
        clients={clients}
        onClientsChanged={loadClients}
        onBack={backToList}
        onEdit={c => { loadList(); setView({ mode: 'edit', campaign: c }); }}
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap justify-between items-start gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-ink tracking-tight">Kampanie</h2>
          <p className="text-ink font-light mt-1 text-sm">Oferty mailowe do klientów: szkic → podgląd → wysyłka. Nic nie wychodzi bez kliknięcia „Wyślij”.</p>
        </div>
        <button type="button" onClick={() => setView({ mode: 'edit', campaign: null })} className="btn-primary">+ Nowa kampania</button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300 mb-4">{error}</div>
      )}

      {campaigns.length === 0 ? (
        <div className="text-center py-16 text-ink font-light">
          <p className="font-medium">Brak kampanii</p>
          <p className="text-sm mt-1">Utwórz pierwszą przyciskiem „Nowa kampania”.</p>
        </div>
      ) : (
        <div className="bg-canvas border border-hairline rounded-xl overflow-hidden divide-y divide-hairline-soft">
          {campaigns.map(c => {
            const st = STATUS[c.status];
            return (
              <div key={c.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 hover:bg-surface-soft transition-colors">
                <button type="button" onClick={() => openCampaign(c)} disabled={openingId !== null}
                  className="flex-1 min-w-0 text-left flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 disabled:opacity-60">
                  <span className="sm:w-24 shrink-0 text-xs text-ink font-light">{fmtDate(c.sentAt ?? c.createdAt)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-ink text-sm truncate">{c.name}</span>
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${st.cls}`}>{st.label}</span>
                      {c.subjectB && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 badge-lilac">A/B</span>}
                      {c.legacy && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 bg-surface-soft text-ink font-light">z Promocji</span>}
                    </span>
                    <span className="block text-xs text-ink font-light truncate">
                      {c.subjectA || 'bez tematu'}{c.subjectB ? ` / ${c.subjectB}` : ''}
                      {' · '}{c.noProducts ? 'bez produktów' : `${c.productCount} ${c.productCount === 1 ? 'produkt' : 'produktów'}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-ink">
                    {openingId === c.id ? <span className="text-xs font-light">Otwieram…</span>
                      : c.status === 'draft' ? <span className="text-xs font-light">{c.recipientCount} odbiorców</span>
                      : <>Wysłano <strong>{c.counts?.sent ?? 0}</strong> z {c.counts?.total ?? c.recipientCount}
                        {(c.counts?.failed ?? 0) > 0 && <span className="ml-2 text-xs text-red-700 dark:text-red-300">{c.counts!.failed} błędów</span>}</>}
                  </span>
                </button>
                {c.status === 'draft' && (
                  <button type="button" onClick={() => removeDraft(c)} className="text-xs text-ink font-light hover:text-red-600 shrink-0 self-end sm:self-center" title="Usuń szkic">
                    Usuń
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CampaignsPanel;
