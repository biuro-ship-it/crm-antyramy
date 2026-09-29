import React, { useEffect, useMemo, useState } from 'react';
import {
  Campaign, CampaignRecipient, CampaignVariant, Client, AttributionStatus, CallOutcome,
  getCampaign, previewSavedCampaign, openCampaignPdf, duplicateCampaign,
  checkCampaignReplies, recomputeCampaignOrders, setCampaignOrderStatus, updateClientMarketing,
} from '../services/api';
import CampaignSendRunner from './CampaignSendRunner';
import { zl } from '../utils/sales';

interface CampaignDetailsProps {
  campaignId: string;
  clients: Client[];                      // do stanu wypisu (noMarketing)
  onClientsChanged: () => void;
  onBack: () => void;
  onEdit: (c: Campaign) => void;          // duplikat otwiera się w edytorze
}

const fmt = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const fmtDay = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
};
const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : '—');

export const CALL_OUTCOME_LABEL: Record<CallOutcome, string> = {
  ordered: 'zamówił',
  callback: 'oddzwonić',
  not_now: 'nie teraz',
  no_answer: 'nie odebrał',
};

const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'ok' | 'bad' | 'plain' }> = ({ label, value, sub, tone = 'plain' }) => (
  <div className={`rounded-lg py-3 px-2 text-center ${tone === 'ok' ? 'bg-block-mint' : tone === 'bad' ? 'bg-red-50 dark:bg-red-950/40' : 'bg-surface-soft'}`}>
    <p className="text-2xl font-bold text-ink">{value}</p>
    <p className="text-xs text-ink font-light">{label}</p>
    {sub && <p className="text-[11px] text-ink font-light opacity-70 mt-0.5">{sub}</p>}
  </div>
);

type RecipientFilter = 'all' | 'replied' | 'unsubscribe' | 'orders' | 'failed';

// Raport kampanii: wysyłka, wyniki (odpowiedzi A/B, prośby o wypis, zamówienia,
// z maila / po telefonie), podgląd, PDF, odbiorcy z decyzjami, „Duplikuj”, „Wznów wysyłkę”.
const CampaignDetails: React.FC<CampaignDetailsProps> = ({ campaignId, clients, onClientsChanged, onBack, onEdit }) => {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [previewFor, setPreviewFor] = useState<{ clientId: string; variant: CampaignVariant } | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [busy, setBusy] = useState<'' | 'pdf' | 'dup' | 'replies' | 'orders'>('');
  const [resuming, setResuming] = useState(false);
  const [filter, setFilter] = useState<RecipientFilter>('all');

  const clientsById = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);

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
    // Podgląd tylko przy zmianie kampanii lub odbiorcy — nie po każdym przeliczeniu wyników
  }, [campaign?.id, campaign?.htmlBody, previewFor]);

  const run = async (kind: typeof busy, fn: () => Promise<void>) => {
    setBusy(kind);
    setError('');
    setInfo('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };

  const handlePdf = () => run('pdf', () => openCampaignPdf(campaignId));
  const handleDuplicate = () => run('dup', async () => onEdit(await duplicateCampaign(campaignId)));
  const handleCheckReplies = () => run('replies', async () => {
    const { replies } = await checkCampaignReplies(campaignId);
    const parts = [`nowe odpowiedzi: ${replies.newReplies}`, `prośby o wypis: ${replies.newUnsubscribeRequests}`];
    if (replies.noThread) parts.push(`${replies.noThread} bez wątku Gmail (wysłane przed Kampaniami — nie da się sprawdzić)`);
    if (replies.errors) parts.push(`błędy odczytu: ${replies.errors}`);
    setInfo(`Sprawdzono ${replies.checked} wątków — ${parts.join(', ')}. Zamówienia przeliczone.`);
    load();
  });
  const handleRecompute = () => run('orders', async () => {
    const r = await recomputeCampaignOrders();
    setInfo(`Zamówienia przeliczone (zmiany w ${r.changed} z ${r.campaigns} kampanii).`);
    load();
  });
  const handleOrderStatus = (clientId: string, orderId: string, status: AttributionStatus) =>
    run('orders', async () => setCampaign(await setCampaignOrderStatus(campaignId, clientId, orderId, status)));
  const handleMarkUnsubscribed = (r: CampaignRecipient) => {
    if (!window.confirm(`Oznaczyć „${r.companyName}” jako wypisanego? Kampanie będą go pomijać.`)) return;
    run('orders', async () => {
      await updateClientMarketing(r.clientId, { noMarketing: true });
      onClientsChanged();
      setInfo(`${r.companyName} — oznaczony jako wypisany.`);
    });
  };

  if (!campaign) {
    return <div className="text-center py-24 text-ink font-light">{error || 'Wczytywanie…'}</div>;
  }

  const c = campaign;
  const counts = c.counts;
  const res = c.results;
  const pending = c.recipients.filter(r => r.status === 'pending').length;
  const hasB = !!c.variantB;
  const sentA = c.recipients.filter(r => r.status === 'sent' && r.variant === 'A').length;
  const sentB = c.recipients.filter(r => r.status === 'sent' && r.variant === 'B').length;
  const products = c.productsSnapshot ?? [];
  const isSentLike = c.status !== 'draft';

  const visibleRecipients = c.recipients.filter(r => {
    switch (filter) {
      case 'replied': return !!r.replied;
      case 'unsubscribe': return !!r.unsubscribeRequest;
      case 'orders': return (r.orders ?? []).some(o => o.status !== 'rejected');
      case 'failed': return r.status === 'failed';
      default: return true;
    }
  });
  const FILTERS: { id: RecipientFilter; label: string; n: number }[] = [
    { id: 'all', label: 'Wszyscy', n: c.recipients.length },
    { id: 'replied', label: 'Odpowiedzieli', n: c.recipients.filter(r => r.replied).length },
    { id: 'unsubscribe', label: 'Wypis', n: c.recipients.filter(r => r.unsubscribeRequest).length },
    { id: 'orders', label: 'Z zamówieniem', n: c.recipients.filter(r => (r.orders ?? []).some(o => o.status !== 'rejected')).length },
    { id: 'failed', label: 'Błędy', n: c.recipients.filter(r => r.status === 'failed').length },
  ];

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
      {info && (
        <div className="bg-block-lilac border border-hairline rounded-lg px-4 py-3 text-sm text-ink mb-4 flex justify-between gap-3">
          <span>{info}</span>
          <button type="button" onClick={() => setInfo('')} className="leading-none shrink-0">✕</button>
        </div>
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

      {/* Wysyłka */}
      <p className="eyebrow mb-2">Wysyłka</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        <Stat label="wysłano" value={counts?.sent ?? 0} tone="ok" />
        <Stat label="błędy" value={counts?.failed ?? 0} tone={(counts?.failed ?? 0) > 0 ? 'bad' : 'plain'} />
        <Stat label="bez e-maila" value={counts?.skippedNoEmail ?? 0} />
        <Stat label="wypisani (pominięci)" value={counts?.skippedNoMarketing ?? 0} />
      </div>

      {/* Wyniki */}
      {isSentLike && (
        <>
          <div className="flex flex-wrap justify-between items-end gap-3 mb-2">
            <p className="eyebrow">Wyniki</p>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-ink font-light">
                Odpowiedzi sprawdzone: {fmt(c.repliesCheckedAt)} · zamówienia: {fmt(c.ordersComputedAt)}
              </span>
              <button type="button" onClick={handleCheckReplies} disabled={!!busy} className="btn-secondary text-sm disabled:opacity-50">
                {busy === 'replies' ? 'Sprawdzam…' : '📬 Sprawdź odpowiedzi'}
              </button>
              <button type="button" onClick={handleRecompute} disabled={!!busy} className="btn-secondary text-sm disabled:opacity-50">
                {busy === 'orders' ? 'Liczę…' : 'Przelicz zamówienia'}
              </button>
            </div>
          </div>
          <div className={`grid grid-cols-2 ${hasB ? 'sm:grid-cols-6' : 'sm:grid-cols-5'} gap-2 mb-6`}>
            <Stat label={hasB ? 'odpowiedzi A' : 'odpowiedzi'} value={res.repliesA} sub={`${pct(res.repliesA, sentA)} z ${sentA}`} tone={res.repliesA > 0 ? 'ok' : 'plain'} />
            {hasB && <Stat label="odpowiedzi B" value={res.repliesB} sub={`${pct(res.repliesB, sentB)} z ${sentB}`} tone={res.repliesB > 0 ? 'ok' : 'plain'} />}
            <Stat label="prośby o wypis" value={res.unsubscribeRequests ?? 0} tone={(res.unsubscribeRequests ?? 0) > 0 ? 'bad' : 'plain'} />
            <Stat label="zamówienia" value={res.orders} tone={res.orders > 0 ? 'ok' : 'plain'} />
            <Stat label="wartość netto" value={<span className="text-lg">{zl(res.orderValueNet)}</span>} />
            <Stat label="z maila / po telefonie" value={`${res.ordersFromMail ?? 0} / ${res.ordersFromPhone ?? 0}`} sub={`rozmowy „zamówił”: ${res.byPhone}`} />
          </div>
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Podgląd */}
        <div className="lg:col-span-2 space-y-3 order-2 lg:order-1">
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
                  Podgląd dla: <strong>{c.recipients.find(r => r.clientId === previewFor.clientId)?.companyName}</strong> (wariant {previewFor.variant}) — z aktualnym podpisem.
                </p>
              )}
              <iframe title="Podgląd maila" srcDoc={preview.html} sandbox="" className="w-full h-[34rem] rounded-lg border border-hairline bg-white" />
            </>
          )}
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
        </div>

        {/* Odbiorcy */}
        <div className="lg:col-span-3 order-1 lg:order-2">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {FILTERS.filter(f => f.id === 'all' || f.n > 0).map(f => (
              <button key={f.id} type="button" onClick={() => setFilter(f.id)}
                className={`text-xs px-2.5 py-1 rounded-full border ${filter === f.id ? 'bg-primary text-on-primary border-transparent' : 'border-hairline text-ink hover:bg-surface-soft'}`}>
                {f.label} ({f.n})
              </button>
            ))}
          </div>
          <div className="border border-hairline rounded-lg divide-y divide-hairline-soft max-h-[44rem] overflow-y-auto">
            {visibleRecipients.length === 0 && <p className="text-sm text-ink font-light px-3 py-4">Brak odbiorców w tym widoku.</p>}
            {visibleRecipients.map(r => {
              const active = previewFor?.clientId === r.clientId;
              const client = clientsById.get(r.clientId);
              const orders = r.orders ?? [];
              return (
                <div key={r.clientId} className={`px-3 py-2 ${r.status === 'failed' ? 'bg-red-50 dark:bg-red-950/40' : active ? 'bg-block-lilac' : ''}`}>
                  <button type="button" onClick={() => setPreviewFor({ clientId: r.clientId, variant: r.variant })} className="w-full text-left flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{r.companyName}</p>
                      <p className={`text-xs truncate ${r.status === 'failed' ? 'text-red-700 dark:text-red-300' : 'text-ink font-light'}`}>
                        {r.email}{r.status === 'failed' ? ` · ${r.error || 'błąd wysyłki'}` : ''}
                      </p>
                    </div>
                    {hasB && <span className="text-xs font-bold text-ink w-5 text-center">{r.variant}</span>}
                    <span className="text-xs shrink-0" title={r.status === 'sent' ? 'wysłano' : r.status === 'failed' ? 'błąd' : 'w kolejce'}>
                      {r.status === 'sent' ? '✓' : r.status === 'failed' ? '✕' : '…'}
                    </span>
                  </button>

                  {(r.replied || r.unsubscribeRequest || r.callOutcome || orders.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
                      {r.replied && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full badge-mint" title={r.replySnippet || ''}>
                          💬 odpowiedź {fmtDay(r.repliedAt)}{r.replySnippet ? `: „${r.replySnippet.slice(0, 40)}${r.replySnippet.length > 40 ? '…' : ''}”` : ''}
                        </span>
                      )}
                      {r.unsubscribeRequest && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 inline-flex items-center gap-1.5" title={r.replySnippet || ''}>
                          🚫 prośba o wypis {fmtDay(r.repliedAt)}
                          {client?.noMarketing ? (
                            <span className="font-semibold">· wypisany ✓</span>
                          ) : (
                            <button type="button" onClick={() => handleMarkUnsubscribed(r)} disabled={!!busy} className="font-semibold underline">
                              Oznacz jako wypisany
                            </button>
                          )}
                        </span>
                      )}
                      {r.callOutcome && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-soft text-ink" title={r.callNote || ''}>
                          📞 {CALL_OUTCOME_LABEL[r.callOutcome]}{r.calledAt ? ` ${fmtDay(r.calledAt)}` : ''}
                        </span>
                      )}
                      {orders.map(o => (
                        <span key={o.orderId}
                          className={`text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 ${
                            o.status === 'rejected' ? 'bg-surface-soft text-ink opacity-60 line-through'
                            : o.status === 'confirmed' ? 'badge-mint'
                            : 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                          }`}>
                          🧾 {zl(o.amount)} · {fmtDay(o.date)}
                          {o.status === 'auto' && <span className="font-semibold">do potwierdzenia</span>}
                          {o.status !== 'confirmed' && (
                            <button type="button" title="Potwierdź — zamówienie z kampanii" disabled={!!busy}
                              onClick={() => handleOrderStatus(r.clientId, o.orderId, 'confirmed')} className="font-bold no-underline">✓</button>
                          )}
                          {o.status !== 'rejected' && (
                            <button type="button" title="Odrzuć — nie z kampanii" disabled={!!busy}
                              onClick={() => handleOrderStatus(r.clientId, o.orderId, 'rejected')} className="font-bold">✕</button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-ink font-light mt-2">
            Zamówienie klienta w ciągu okna po wysyłce (ustawienie w Administracji) przypisuje się automatycznie do ostatniej kampanii — potwierdź ✓ albo odrzuć ✕.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CampaignDetails;
