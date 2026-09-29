import React, { useMemo, useState } from 'react';
import { CampaignSummary } from '../services/api';
import { zl } from '../utils/sales';

interface CampaignRankingProps {
  campaigns: CampaignSummary[];
  onOpen: (id: string) => void;
}

type SortKey = 'date' | 'replyRate' | 'orders' | 'value';

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : '—');

// Odpowiedzi da się mierzyć tylko w kampaniach wysłanych modułem Kampanie (mają wątki Gmail)
const replyRate = (c: CampaignSummary): number | null => {
  const sent = c.sentA + c.sentB;
  if (c.legacy || sent === 0) return null;
  return (c.results.repliesA + c.results.repliesB) / sent;
};

const MIN_PER_VARIANT = 10; // poniżej — „za mało danych” w porównaniu A/B

// ─── Wykres: wartość zamówień per kampania ──────────────────────────────────

const niceStep = (max: number) => {
  const raw = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / pow;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * pow;
};

const ValueChart: React.FC<{ data: CampaignSummary[]; onOpen: (id: string) => void }> = ({ data, onOpen }) => {
  const [hover, setHover] = useState<number | null>(null);
  const values = data.map(c => c.results.orderValueNet);
  const max = Math.max(...values, 0);
  if (max <= 0) {
    return (
      <p className="text-sm text-ink font-light py-8 text-center">
        Brak przypisanych zamówień. W raporcie kampanii kliknij „Przelicz zamówienia” (po „hurtowej aktualizacji z Fakturowni”).
      </p>
    );
  }

  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);

  // Przy kilku kampaniach szersze sloty (wykres nie ściska się w lewym rogu); słupek zawsze 24px
  const H = 220, PAD_T = 24, PAD_B = 40, PAD_L = 64, BAR = 24;
  const SLOT = Math.max(56, Math.min(120, Math.floor(720 / Math.max(data.length, 1))));
  const W = PAD_L + data.length * SLOT + 8;
  const plotH = H - PAD_T - PAD_B;
  const y = (v: number) => PAD_T + plotH - (v / top) * plotH;
  const maxIdx = values.indexOf(max);

  // Kolumna: zaokrąglony wierzchołek 4px, płaska podstawa
  const colPath = (x: number, v: number) => {
    const yTop = y(v), yBase = y(0), r = Math.min(4, yBase - yTop);
    return `M${x},${yBase} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + BAR - r} Q${x + BAR},${yTop} ${x + BAR},${yTop + r} V${yBase} Z`;
  };

  return (
    <div className="relative overflow-x-auto">
      <svg width={W} height={H} role="img" aria-label="Wartość zamówień netto per kampania" className="block">
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD_L} x2={W} y1={y(t)} y2={y(t)} className="stroke-hairline" strokeWidth={1} />
            <text x={PAD_L - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink text-[11px] opacity-60">
              {t.toLocaleString('pl-PL')}
            </text>
          </g>
        ))}
        {data.map((c, i) => {
          const slotX = PAD_L + i * SLOT;
          const x = slotX + (SLOT - BAR) / 2;
          const v = c.results.orderValueNet;
          return (
            <g key={c.id}>
              {v > 0 && (
                <path d={colPath(x, v)}
                  className={`fill-[#2a78d6] dark:fill-[#3987e5] transition-opacity ${hover !== null && hover !== i ? 'opacity-40' : ''}`} />
              )}
              {i === maxIdx && (
                <text x={x + BAR / 2} y={y(v) - 6} textAnchor="middle" className="fill-ink text-[11px] font-semibold">{zl(v)}</text>
              )}
              <text x={slotX + SLOT / 2} y={H - PAD_B + 16} textAnchor="middle" className="fill-ink text-[10px] opacity-60">
                {c.sentAt ? new Date(c.sentAt).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }) : ''}
              </text>
              {/* Pole najechania większe niż słupek */}
              <rect x={slotX} y={PAD_T} width={SLOT} height={plotH + 24} fill="transparent" className="cursor-pointer"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onOpen(c.id)} />
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="absolute pointer-events-none bg-canvas border border-hairline rounded-lg shadow-md px-3 py-2 text-xs text-ink whitespace-nowrap"
          style={{ left: Math.min(PAD_L + hover * SLOT + SLOT, W - 180), top: 4 }}>
          <p className="font-semibold">{data[hover].name}</p>
          <p className="font-light">{fmtDate(data[hover].sentAt)}</p>
          <p>{zl(data[hover].results.orderValueNet)} · zamówień: {data[hover].results.orders}</p>
        </div>
      )}
    </div>
  );
};

// ─── Ranking ────────────────────────────────────────────────────────────────

const CampaignRanking: React.FC<CampaignRankingProps> = ({ campaigns, onOpen }) => {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });

  const sent = useMemo(() => campaigns.filter(c => c.status !== 'draft'), [campaigns]);
  const chronological = useMemo(
    () => [...sent].sort((a, b) => (a.sentAt ?? a.createdAt).localeCompare(b.sentAt ?? b.createdAt)),
    [sent],
  );

  const rows = useMemo(() => {
    const val = (c: CampaignSummary): number => {
      switch (sort.key) {
        case 'replyRate': return replyRate(c) ?? -1;
        case 'orders': return c.results.orders;
        case 'value': return c.results.orderValueNet;
        default: return new Date(c.sentAt ?? c.createdAt).getTime();
      }
    };
    return [...sent].sort((a, b) => (val(a) - val(b)) * sort.dir);
  }, [sent, sort]);

  const abTests = chronological.filter(c => c.subjectB).reverse();
  const totalValue = sent.reduce((s, c) => s + c.results.orderValueNet, 0);
  const totalOrders = sent.reduce((s, c) => s + c.results.orders, 0);

  const header = (key: SortKey, label: string, align = 'text-right') => (
    <th className={`px-3 py-2 font-semibold ${align}`}>
      <button type="button" onClick={() => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}
        className="hover:underline inline-flex items-center gap-1">
        {label}{sort.key === key && <span aria-hidden>{sort.dir === -1 ? '▼' : '▲'}</span>}
      </button>
    </th>
  );

  if (sent.length === 0) {
    return <p className="text-center py-16 text-ink font-light">Ranking pojawi się po wysłaniu pierwszej kampanii.</p>;
  }

  return (
    <div className="space-y-8">
      {/* Wykres */}
      <section className="card-padded">
        <div className="flex flex-wrap justify-between items-baseline gap-2 mb-3">
          <h3 className="section-title">Wartość zamówień netto per kampania</h3>
          <p className="text-sm text-ink font-light">Razem: <strong>{zl(totalValue)}</strong> · {totalOrders} zamówień</p>
        </div>
        <ValueChart data={chronological} onOpen={onOpen} />
      </section>

      {/* Tabela */}
      <section className="bg-canvas border border-hairline rounded-xl overflow-x-auto">
        <table className="w-full text-sm text-ink">
          <thead className="bg-surface-soft text-xs uppercase tracking-wide">
            <tr>
              {header('date', 'Data', 'text-left')}
              <th className="px-3 py-2 font-semibold text-left">Kampania / produkt</th>
              <th className="px-3 py-2 font-semibold text-left">Temat A / B</th>
              {header('replyRate', '% odpowiedzi')}
              {header('orders', 'Zamówienia')}
              {header('value', 'Wartość netto')}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {rows.map(c => {
              const rate = replyRate(c);
              return (
                <tr key={c.id} onClick={() => onOpen(c.id)} className="hover:bg-surface-soft cursor-pointer align-top">
                  <td className="px-3 py-2.5 whitespace-nowrap font-light">{fmtDate(c.sentAt)}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs font-light">{c.noProducts ? 'bez produktów' : c.productNames.join(', ') || '—'}</p>
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    <p>{c.subjectA || '—'}</p>
                    {c.subjectB && <p className="font-light">B: {c.subjectB}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums" title={rate === null ? 'Kampania sprzed modułu Kampanie — odpowiedzi nie są mierzone' : ''}>
                    {rate === null ? '—' : `${Math.round(rate * 100)}%`}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.results.orders}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{zl(c.results.orderValueNet)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Porównanie A/B */}
      <section>
        <h3 className="section-title mb-3">Który temat wygrał</h3>
        {abTests.length === 0 ? (
          <p className="text-sm text-ink font-light">Brak kampanii z testem A/B.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {abTests.map(c => {
              const rA = c.sentA ? c.results.repliesA / c.sentA : 0;
              const rB = c.sentB ? c.results.repliesB / c.sentB : 0;
              const tooFew = c.sentA < MIN_PER_VARIANT || c.sentB < MIN_PER_VARIANT;
              const winner = tooFew ? null : rA === rB ? 'tie' : rA > rB ? 'A' : 'B';
              const verdict = tooFew ? `Za mało danych (min. ${MIN_PER_VARIANT} maili na wariant)` : winner === 'tie' ? 'Remis' : `Wygrał temat ${winner}`;
              const Row = ({ v, subject, n, replies }: { v: 'A' | 'B'; subject: string; n: number; replies: number }) => (
                <div className={`flex items-start gap-3 px-3 py-2 rounded-lg ${winner === v ? 'bg-block-mint' : 'bg-surface-soft'}`}>
                  <span className="font-bold w-4 shrink-0">{v}</span>
                  <span className="flex-1 min-w-0 text-sm">{subject}</span>
                  <span className="text-sm text-right shrink-0 tabular-nums">
                    <strong>{pct(replies, n)}</strong>
                    <span className="block text-[11px] font-light">{replies} z {n}</span>
                  </span>
                </div>
              );
              return (
                <button key={c.id} type="button" onClick={() => onOpen(c.id)} className="card-padded text-left space-y-2 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-baseline gap-2">
                    <p className="font-semibold text-ink truncate">{c.name}</p>
                    <p className="text-xs text-ink font-light shrink-0">{fmtDate(c.sentAt)}</p>
                  </div>
                  <Row v="A" subject={c.subjectA} n={c.sentA} replies={c.results.repliesA} />
                  <Row v="B" subject={c.subjectB!} n={c.sentB} replies={c.results.repliesB} />
                  <p className={`text-sm font-semibold ${winner && winner !== 'tie' ? 'text-ink' : 'text-ink opacity-60'}`}>
                    {winner && winner !== 'tie' ? '🏆 ' : ''}{verdict}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default CampaignRanking;
