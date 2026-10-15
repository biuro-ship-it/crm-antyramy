import { useState } from 'react';
import { SupplierOrder } from '../services/api';
import { openFile } from '../utils/files';
import { formatOrderDateTime, positionsLabel } from '../utils/supplierOrders';
import { zl } from '../utils/sales';

interface SupplierOrderHistoryProps {
  orders: SupplierOrder[];   // od najnowszych
  loading: boolean;
  error: string | null;
  isAdmin: boolean;          // tylko administrator widzi „Usuń wpis”
  onDelete: (order: SupplierOrder) => Promise<void>;
}

// Historia wysłanych zamówień — wpisy są niezmienne; błędny wpis usuwa tylko administrator (SPEC.md).
export default function SupplierOrderHistory({ orders, loading, error, isAdmin, onDelete }: SupplierOrderHistoryProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Błąd usuwania pokazujemy przy wpisie, którego dotyczy
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);

  const handleDelete = async (o: SupplierOrder) => {
    const label = `${formatOrderDateTime(o.sentAt)} (${positionsLabel(o.items.length)})`;
    if (!window.confirm(`Usunąć wpis zamówienia z ${label}?\n\nZniknie też jego kopia PDF i wpis w historii kontaktów. Tego nie da się cofnąć.`)) return;
    setDeletingId(o.id);
    setDeleteError(null);
    try {
      await onDelete(o);
      setOpenId(null);
    } catch (err) {
      setDeleteError({ id: o.id, message: err instanceof Error ? err.message : 'Nie udało się usunąć wpisu.' });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="bg-white/70 dark:bg-white/5 rounded-xl p-4 sm:p-5 border border-hairline-soft shadow-sm mb-6">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="text-xs font-bold text-ink uppercase tracking-wider">🧾 Historia zamówień</h3>
        {orders.length > 0 && (
          <span className="text-[11px] font-bold bg-block-pink text-ink border border-accent-magenta px-2 py-0.5 rounded-pill">{orders.length}</span>
        )}
      </div>

      {error && (
        <div role="alert" className="bg-block-pink border border-hairline text-ink text-body-sm rounded-md p-3 mb-3">⚠️ {error}</div>
      )}

      {loading ? (
        <p className="text-xs text-ink/50 italic py-4 text-center">Wczytuję historię zamówień…</p>
      ) : error ? null : orders.length === 0 ? (
        <p className="text-xs text-ink/50 text-center py-6 italic border border-dashed border-hairline rounded-xl">
          Brak wysłanych zamówień
        </p>
      ) : (
        <ul className="space-y-2">
          {orders.map(o => {
            const open = openId === o.id;
            const manual = o.method === 'manual';
            return (
              <li key={o.id} className={`rounded-xl border bg-canvas transition-colors ${open ? 'border-accent-magenta' : 'border-hairline-soft'}`}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : o.id)}
                  aria-expanded={open}
                  className="w-full text-left p-3 flex items-start gap-3 min-h-[44px]"
                >
                  <span className="text-lg leading-none mt-0.5" aria-hidden>📦</span>
                  <span className="flex-1 min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-body-sm font-bold text-ink">{formatOrderDateTime(o.sentAt)}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-pill border ${manual ? 'border-accent-magenta text-ink' : 'border-hairline text-ink/60'}`}>
                        {manual ? 'poza CRM' : 'Gmail z CRM'}
                      </span>
                    </span>
                    {o.subject && <span className="block text-xs text-ink/60 truncate">{o.subject}</span>}
                    <span className="block text-xs text-ink/50">{positionsLabel(o.items.length)}{o.to && !manual ? ` · do ${o.to}` : ''}</span>
                  </span>
                  <span className={`text-ink/50 text-sm transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden>▾</span>
                </button>

                {open && (
                  <div className="px-3 pb-3 border-t border-hairline-soft pt-3 space-y-3 text-body-sm text-ink">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-ink/50 text-left">
                          <th className="font-bold py-1 pr-2">Pozycja</th>
                          <th className="font-bold py-1 px-2 text-right">Ilość</th>
                          <th className="font-bold py-1 pl-2">Jedn.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {o.items.map((i, idx) => (
                          <tr key={idx} className="border-t border-hairline-soft">
                            <td className="py-1 pr-2">{i.name}</td>
                            <td className="py-1 px-2 text-right font-bold">{i.quantity}</td>
                            <td className="py-1 pl-2">{i.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {o.notes && <p className="text-xs"><span className="font-bold text-ink/60">Uwagi:</span> {o.notes}</p>}
                    {o.note && <p className="text-xs"><span className="font-bold text-ink/60">Notatka:</span> {o.note}</p>}

                    <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
                      <dt className="font-bold text-ink/60">Wysłane:</dt>
                      <dd>{formatOrderDateTime(o.sentAt)} · {manual ? 'poza CRM (oznaczone ręcznie)' : 'mailem z CRM (Gmail)'}</dd>
                      <dt className="font-bold text-ink/60">Zapisane:</dt>
                      <dd className="break-all">{formatOrderDateTime(o.recordedAt ?? o.sentAt)} · {o.recordedBy ?? o.sentBy}</dd>
                      {/* Przy wysyłce poza CRM adresat nie jest znany (w bazie jest tylko adres z karty dostawcy) */}
                      {o.to && !manual && <><dt className="font-bold text-ink/60">Do:</dt><dd className="break-all">{o.to}</dd></>}
                      {o.subject && <><dt className="font-bold text-ink/60">Temat:</dt><dd>{o.subject}</dd></>}
                      {o.estimatedTotalNet !== null && (
                        <><dt className="font-bold text-ink/60">Wartość:</dt><dd>{zl(o.estimatedTotalNet)} netto <span className="text-ink/40">(wg cennika CRM, nie w mailu)</span></dd></>
                      )}
                      {!manual && (
                        <><dt className="font-bold text-ink/60">Gmail ID:</dt><dd className="break-all font-mono text-[11px]">{o.gmailMessageId ?? '—'}</dd></>
                      )}
                    </dl>

                    {o.body && (
                      <details className="text-xs">
                        <summary className="cursor-pointer font-bold text-ink/60">Treść wysłanego maila</summary>
                        <pre className="whitespace-pre-wrap font-mono text-[11px] bg-surface-soft rounded-lg p-3 mt-2 text-ink">{o.body}</pre>
                      </details>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={() => openFile(o.pdfUrl)}
                        className="btn-secondary w-full sm:w-auto text-sm"
                      >
                        ⬇️ Pobierz PDF
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDelete(o)}
                          disabled={deletingId === o.id}
                          className="w-full sm:w-auto sm:ml-auto text-xs font-bold text-red-500 hover:underline px-3 py-2 min-h-[44px] disabled:opacity-60"
                        >
                          {deletingId === o.id ? 'Usuwam…' : '🗑 Usuń błędny wpis (admin)'}
                        </button>
                      )}
                    </div>
                    {deleteError?.id === o.id && (
                      <div role="alert" className="bg-block-pink border border-hairline text-ink text-body-sm rounded-md p-3">⚠️ {deleteError.message}</div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
