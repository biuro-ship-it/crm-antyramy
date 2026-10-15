import { useState } from 'react';
import { SupplierOrder } from '../services/api';
import { openFile } from '../utils/files';
import { formatOrderDateTime, positionsLabel } from '../utils/supplierOrders';

interface SupplierOrderHistoryProps {
  orders: SupplierOrder[];   // od najnowszych
  loading: boolean;
  error: string | null;
}

const zl = (n: number) =>
  new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// Historia wysłanych zamówień — tylko do odczytu (wpisy są niezmienne, patrz SPEC.md).
export default function SupplierOrderHistory({ orders, loading, error }: SupplierOrderHistoryProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="bg-white/70 dark:bg-white/5 rounded-xl p-4 sm:p-5 border border-hairline-soft shadow-sm mb-6">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="text-xs font-bold text-ink uppercase tracking-wider">🧾 Historia zamówień</h3>
        {orders.length > 0 && (
          <span className="text-[11px] font-bold bg-accent-magenta text-white px-2 py-0.5 rounded-pill">{orders.length}</span>
        )}
      </div>

      {error && (
        <div className="bg-block-pink border border-hairline text-ink text-body-sm rounded-md p-3 mb-3">⚠️ {error}</div>
      )}

      {loading ? (
        <p className="text-xs text-ink/50 italic py-4 text-center">Wczytuję historię zamówień...</p>
      ) : orders.length === 0 ? (
        <p className="text-xs text-ink/50 text-center py-6 italic border border-dashed border-hairline rounded-xl">
          Brak wysłanych zamówień
        </p>
      ) : (
        <ul className="space-y-2">
          {orders.map(o => {
            const open = openId === o.id;
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
                    <span className="block text-body-sm font-bold text-ink">{formatOrderDateTime(o.sentAt)}</span>
                    <span className="block text-xs text-ink/60 truncate">{o.subject}</span>
                    <span className="block text-xs text-ink/50">{positionsLabel(o.items.length)} · do {o.to}</span>
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

                    <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
                      <dt className="font-bold text-ink/60">Do:</dt><dd className="break-all">{o.to}</dd>
                      <dt className="font-bold text-ink/60">Temat:</dt><dd>{o.subject}</dd>
                      <dt className="font-bold text-ink/60">Wysłał:</dt><dd className="break-all">{o.sentBy}</dd>
                      {o.estimatedTotalNet !== null && (
                        <><dt className="font-bold text-ink/60">Wartość:</dt><dd>{zl(o.estimatedTotalNet)} zł netto <span className="text-ink/40">(wg cennika CRM, nie w mailu)</span></dd></>
                      )}
                      <dt className="font-bold text-ink/60">Gmail ID:</dt><dd className="break-all font-mono text-[11px]">{o.gmailMessageId ?? '—'}</dd>
                    </dl>

                    <details className="text-xs">
                      <summary className="cursor-pointer font-bold text-ink/60">Treść wysłanego maila</summary>
                      <pre className="whitespace-pre-wrap font-mono text-[11px] bg-surface-soft rounded-lg p-3 mt-2 text-ink">{o.body}</pre>
                    </details>

                    <button
                      type="button"
                      onClick={() => openFile(o.pdfUrl)}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-accent-magenta text-white font-bold text-sm px-4 py-2.5 rounded-lg shadow-sm hover:opacity-90 min-h-[44px]"
                    >
                      ⬇️ Pobierz PDF
                    </button>
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
