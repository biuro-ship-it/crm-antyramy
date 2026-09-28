import React, { useEffect, useState } from 'react';
import {
  Campaign, CampaignVariant, getCampaign, previewSavedCampaign, openCampaignPdf, duplicateCampaign,
} from '../services/api';
import CampaignSendRunner from './CampaignSendRunner';

interface CampaignDetailsProps {
  campaignId: string;
  onBack: () => void;
  onEdit: (c: Campaign) => void;          // duplikat otwiera się w edytorze
}

const fmt = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: 'ok' | 'bad' | 'plain' }> = ({ label, value, tone = 'plain' }) => (
  <div className={`rounded-lg py-3 px-2 text-center ${tone === 'ok' ? 'bg-block-mint' : tone === 'bad' ? 'bg-red-50 dark:bg-red-950/40' : 'bg-surface-soft'}`}>
    <p className="text-2xl font-bold text-ink">{value}</p>
    <p className="text-xs text-ink font-light">{label}</p>
  </div>
);

// Szczegóły kampanii: liczniki, podgląd maila dla odbiorcy, PDF, lista odbiorców,
// „Duplikuj” i „Wznów wysyłkę”. Raport wyników (odpowiedzi, zamówienia) — Etap 2.
const CampaignDetails: React.FC<CampaignDetailsProps> = ({ campaignId, onBack, onEdit }) => {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [error, setError] = useState('');
  const [previewFor, setPreviewFor] = useState<{ clientId: string; variant: CampaignVariant } | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [busy, setBusy] = useState<'' | 'pdf' | 'dup'>('');
  const [resuming, setResuming] = useState(false);

  const load = () => {
    getCampaign(campaignId)
      .then(c => {
        setCampaign(c);
        const first = c.recipients.find(r => r.status === 'sent') ?? c.recipients[0];
        if (first) setPreviewFor(p => p ?? { clientId: first.clientId, variant: first.variant });
      })
      .catch(e => setError((e as Error).message));
  };
  useEffect(load, [campaignId]);

  useEffect(() => {
    if (!campaign) return;
    // Kampanie przeniesione z Promocji mają zapisany HTML dokładnie taki, jaki poszedł
    if (campaign.htmlBody) { setPreview({ subject: campaign.variantA.subject, html: campaign.htmlBody }); return; }
    if (!previewFor) return;
    previewSavedCampaign(campaign.id, previewFor.clientId, previewFor.variant)
      .then(setPreview)
      .catch(e => setError((e as Error).message));
  }, [campaign, previewFor]);

  const handlePdf = async () => {
    setBusy('pdf');
    try { await openCampaignPdf(campaignId); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const handleDuplicate = async () => {
    setBusy('dup');
    try { onEdit(await duplicateCampaign(campaignId)); } catch (e) { setError((e as Error).message); setBusy(''); }
  };

  if (!campaign) {
    return <div className="text-center py-24 text-ink font-light">{error || 'Wczytywanie…'}</div>;
  }

  const c = campaign;
  const counts = c.counts;
  const pending = c.recipients.filter(r => r.status === 'pending').length;
  const hasB = !!c.variantB;
  const sentA = c.recipients.filter(r => r.status === 'sent' && r.variant === 'A').length;
  const sentB = c.recipients.filter(r => r.status === 'sent' && r.variant === 'B').length;
  const products = c.productsSnapshot ?? [];

  return (
    <div className="max-w-6xl mx-auto">
      <button type="button" onClick={onBack} className="text-sm text-ink font-light hover:underline mb-2">← Kampanie</button>
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-ink tracking-tight">
            {c.name}
            {c.legacy && <span className="ml-2 text-xs font-bold uppercase px-1.5 py-0.5 rounded bg-surface-soft text-ink font-light align-middle">z Promocji</span>}
          </h2>
          <p className="text-sm text-ink font-light mt-1">
            {c.status === 'sent' ? `Wysłana ${fmt(c.sentAt)}` : c.status === 'sending' ? 'Wysyłka przerwana — do wznowienia' : 'Szkic'}
            {c.sentBy ? ` · ${c.sentBy}` : ''}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!c.noProducts && products.length > 0 && (
            <button type="button" onClick={handlePdf} disabled={!!busy} className="btn-secondary text-sm disabled:opacity-50">
              {busy === 'pdf' ? 'Generuję…' : 'PDF oferty'}
            </button>
          )}
          <button type="button" onClick={handleDuplicate} disabled={!!busy} className="btn-primary text-sm disabled:opacity-50">
            {busy === 'dup' ? 'Kopiuję…' : 'Duplikuj kampanię'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300 mb-4">{error}</div>
      )}

      {c.status === 'sending' && (
        <div className="mb-6">
          {resuming ? (
            <CampaignSendRunner
              campaignId={c.id}
              initialCounts={counts}
              initialPending={pending}
              onDone={() => { setResuming(false); load(); }}
            />
          ) : (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-lg px-4 py-3 text-sm text-amber-800 dark:text-amber-300 flex flex-wrap justify-between items-center gap-3">
              <span>Wysyłka została przerwana. Do wysłania zostało <strong>{pending}</strong> z {counts?.total ?? c.recipients.length}.</span>
              <button type="button" onClick={() => setResuming(true)} className="btn-primary text-sm">Wznów wysyłkę</button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        <Stat label="wysłano" value={counts?.sent ?? 0} tone="ok" />
        <Stat label="błędy" value={counts?.failed ?? 0} tone={(counts?.failed ?? 0) > 0 ? 'bad' : 'plain'} />
        <Stat label="bez e-maila" value={counts?.skippedNoEmail ?? 0} />
        <Stat label="wypisani (pominięci)" value={counts?.skippedNoMarketing ?? 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Podgląd */}
        <div className="lg:col-span-3 space-y-3">
          <div className="bg-surface-soft rounded-xl border border-hairline p-4 text-sm text-ink space-y-1">
            <p><span className="font-light">Temat{hasB ? ' A' : ''}:</span> <strong>{c.variantA.subject || '—'}</strong>{hasB && <span className="font-light"> · wysłano {sentA}</span>}</p>
            {hasB && (
              <p><span className="font-light">Temat B:</span> <strong>{c.variantB!.subject}</strong><span className="font-light"> · wysłano {sentB}{c.variantB!.content !== null ? ' · osobna treść' : ''}</span></p>
            )}
          </div>
          {preview && (
            <>
              {!c.htmlBody && previewFor && (
                <p className="text-xs text-ink font-light">
                  Podgląd dla: <strong>{c.recipients.find(r => r.clientId === previewFor.clientId)?.companyName}</strong> (wariant {previewFor.variant}) — z aktualnym podpisem. Kliknij odbiorcę z listy, żeby zobaczyć jego wersję.
                </p>
              )}
              <iframe title="Podgląd maila" srcDoc={preview.html} sandbox="" className="w-full h-[36rem] rounded-lg border border-hairline bg-white" />
            </>
          )}
        </div>

        {/* Odbiorcy i produkty */}
        <div className="lg:col-span-2 space-y-5">
          {products.length > 0 && (
            <div>
              <p className="eyebrow mb-2">Produkty ({products.length})</p>
              <div className="space-y-1">
                {products.map(p => (
                  <div key={p.id} className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-surface-soft rounded border border-hairline overflow-hidden shrink-0">
                      {p.imageUrl && <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <p className="text-xs text-ink truncate flex-1">{p.name}</p>
                    <p className="text-xs text-ink font-light shrink-0">{p.priceNetto > 0 ? `${p.priceNetto.toFixed(2)} zł` : ''}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="eyebrow mb-2">Odbiorcy ({c.recipients.length})</p>
            <div className="border border-hairline rounded-lg divide-y divide-hairline-soft max-h-[32rem] overflow-y-auto">
              {c.recipients.map(r => {
                const active = previewFor?.clientId === r.clientId;
                return (
                  <button
                    key={r.clientId}
                    type="button"
                    onClick={() => setPreviewFor({ clientId: r.clientId, variant: r.variant })}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                      r.status === 'failed' ? 'bg-red-50 dark:bg-red-950/40' : active ? 'bg-block-lilac' : 'hover:bg-surface-soft'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{r.companyName}</p>
                      <p className={`text-xs truncate ${r.status === 'failed' ? 'text-red-700 dark:text-red-300' : 'text-ink font-light'}`}>
                        {r.email}{r.status === 'failed' ? ` · ${r.error || 'błąd wysyłki'}` : ''}
                      </p>
                    </div>
                    {hasB && <span className="text-xs font-bold text-ink w-5 text-center">{r.variant}</span>}
                    <span className="text-xs shrink-0">
                      {r.status === 'sent' ? '✓' : r.status === 'failed' ? '✕' : '…'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CampaignDetails;
