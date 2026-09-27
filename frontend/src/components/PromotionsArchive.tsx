import React, { useState } from 'react';
import {
  PromotionSummary, PromotionRecord,
  getPromotion, openPromotionPdf,
} from '../services/api';

interface PromotionsArchiveProps {
  promotions: PromotionSummary[];
  loading: boolean;
  error: string;
  onReuse: (record: PromotionRecord) => void;
}

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// ─── Szczegóły kampanii (modal) ─────────────────────────────────────────────

const PromotionDetails: React.FC<{
  record: PromotionRecord;
  onClose: () => void;
  onReuse: () => void;
}> = ({ record, onClose, onReuse }) => {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState('');

  const sent = record.recipients.filter(r => r.status === 'sent');
  const failed = record.recipients.filter(r => r.status === 'failed');

  const handlePdf = async () => {
    setPdfLoading(true);
    setError('');
    try {
      await openPromotionPdf(record.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in" onClick={onClose}>
      <div className="bg-canvas rounded-lg shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Nagłówek */}
        <div className="flex justify-between items-start gap-4 px-6 py-4 border-b border-hairline-soft">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-ink truncate">{record.title}</h3>
            <p className="text-xs text-ink font-light mt-0.5">
              {record.legacy ? formatDate(record.sentAt) : formatDateTime(record.sentAt)}
              {' · '}Temat: <span className="font-semibold">{record.subject || '—'}</span>
              {record.sentBy ? ` · ${record.sentBy}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-ink font-light hover:text-ink text-2xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Podgląd maila */}
          <div className="lg:col-span-3">
            <p className="text-xs font-semibold text-ink font-light uppercase tracking-wide mb-2">Podgląd maila</p>
            {/* sandbox="" — bez skryptów i formularzy; HTML to tylko treść maila */}
            <iframe
              title="Podgląd maila"
              srcDoc={record.htmlBody}
              sandbox=""
              className="w-full h-[60vh] rounded-lg border border-hairline bg-white"
            />
            {record.legacy && (
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                Oferta odtworzona z historii klientów: temat maila nieznany, ceny produktów aktualne, nie z dnia wysyłki.
              </p>
            )}
          </div>

          {/* Podsumowanie */}
          <div className="lg:col-span-2 space-y-5">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-block-mint rounded-lg py-3">
                <p className="text-2xl font-bold text-ink">{record.sentCount}</p>
                <p className="text-xs text-ink font-light">wysłano</p>
              </div>
              <div className={`rounded-lg py-3 ${record.failedCount > 0 ? 'bg-red-50 dark:bg-red-950/40' : 'bg-surface-soft'}`}>
                <p className="text-2xl font-bold text-ink">{record.failedCount}</p>
                <p className="text-xs text-ink font-light">błędy</p>
              </div>
              <div className="bg-surface-soft rounded-lg py-3">
                <p className="text-2xl font-bold text-ink">{record.skippedNoEmail ?? 0}</p>
                <p className="text-xs text-ink font-light">bez e-maila</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handlePdf}
                disabled={pdfLoading || record.products.length === 0}
                className="px-4 py-2 border border-hairline text-ink text-sm font-medium rounded-lg hover:bg-surface-soft transition-colors disabled:opacity-40"
              >
                {pdfLoading ? 'Generuję...' : 'PDF oferty'}
              </button>
              <button onClick={onReuse} className="btn-primary">
                Użyj ponownie
              </button>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-ink font-light uppercase tracking-wide mb-2">Produkty ({record.products.length})</p>
              <div className="space-y-1">
                {record.products.map(p => (
                  <div key={p.id} className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-surface-soft rounded border border-hairline overflow-hidden shrink-0">
                      {p.imageUrl && <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-ink truncate">{p.name}</p>
                      <p className="text-xs text-ink font-light">
                        {p.code || '—'}{p.priceNetto > 0 ? ` · ${p.priceNetto.toFixed(2)} zł` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-ink font-light uppercase tracking-wide mb-2">
                Odbiorcy ({record.recipients.length})
              </p>
              <div className="border border-hairline rounded-lg divide-y divide-hairline-soft max-h-72 overflow-y-auto">
                {failed.map(r => (
                  <div key={`f-${r.clientId}`} className="px-3 py-2 bg-red-50 dark:bg-red-950/40">
                    <p className="text-sm font-medium text-ink truncate">{r.companyName}</p>
                    <p className="text-xs text-red-700 dark:text-red-300 truncate">{r.email} · {r.error || 'błąd wysyłki'}</p>
                  </div>
                ))}
                {sent.map(r => (
                  <div key={`s-${r.clientId}`} className="px-3 py-2">
                    <p className="text-sm font-medium text-ink truncate">{r.companyName}</p>
                    <p className="text-xs text-ink font-light truncate">{r.email}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Lista kampanii ─────────────────────────────────────────────────────────

const PromotionsArchive: React.FC<PromotionsArchiveProps> = ({ promotions, loading, error, onReuse }) => {
  const [openRecord, setOpenRecord] = useState<PromotionRecord | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState('');

  const handleOpen = async (id: string) => {
    setOpeningId(id);
    setOpenError('');
    try {
      setOpenRecord(await getPromotion(id));
    } catch (e) {
      setOpenError((e as Error).message);
    } finally {
      setOpeningId(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-ink font-light">Wczytywanie archiwum...</div>
  );

  return (
    <div>
      {(error || openError) && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300 mb-4">
          {error || openError}
        </div>
      )}

      {promotions.length === 0 ? (
        <div className="text-center py-16 text-ink font-light">
          <p className="font-medium">Brak wysłanych promocji</p>
          <p className="text-sm mt-1">Po wysyłce oferta pojawi się tutaj z podglądem i liczbą odbiorców.</p>
        </div>
      ) : (
        <div className="bg-canvas border border-hairline rounded-xl overflow-hidden divide-y divide-hairline-soft">
          {promotions.map(p => (
            <button
              key={p.id}
              onClick={() => handleOpen(p.id)}
              disabled={openingId !== null}
              className="w-full text-left flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 hover:bg-surface-soft transition-colors disabled:opacity-60"
            >
              <div className="sm:w-28 shrink-0 text-xs text-ink font-light">
                {formatDate(p.sentAt)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-ink text-sm truncate">
                  {p.title}
                  {p.legacy && (
                    <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-surface-soft text-ink font-light align-middle">odtworzona</span>
                  )}
                </p>
                <p className="text-xs text-ink font-light truncate">
                  {p.subject || 'temat nieznany'} · {p.productCount} {p.productCount === 1 ? 'produkt' : 'produktów'}
                </p>
              </div>
              <div className="shrink-0 text-sm text-ink">
                {openingId === p.id ? (
                  <span className="text-xs font-light">Otwieram...</span>
                ) : (
                  <>
                    Wysłano <strong>{p.sentCount}</strong> z {p.totalCount}
                    {p.failedCount > 0 && (
                      <span className="ml-2 text-xs text-red-700 dark:text-red-300">{p.failedCount} błędów</span>
                    )}
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {openRecord && (
        <PromotionDetails
          record={openRecord}
          onClose={() => setOpenRecord(null)}
          onReuse={() => { onReuse(openRecord); setOpenRecord(null); }}
        />
      )}
    </div>
  );
};

export default PromotionsArchive;
