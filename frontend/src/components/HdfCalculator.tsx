import { useState } from 'react';

interface CalcRow {
  id: number;
  width: string;
  height: string;
  qty: string;
}

interface Prices {
  pricePerM2: string;
  cutPerM: string;
}

const num = (v: string) => parseFloat(v.replace(',', '.')) || 0;

const calcRow = (row: CalcRow, prices: Prices) => {
  const w = num(row.width) / 100;
  const h = num(row.height) / 100;
  const qty = Math.max(1, Math.round(num(row.qty) || 1));
  const area = w * h;
  const perim = 2 * (w + h);
  const unitCost = area * num(prices.pricePerM2) + perim * num(prices.cutPerM);
  return { area, perim, unitCost, totalCost: unitCost * qty, qty };
};

let nextId = 1;
const emptyRow = (): CalcRow => ({ id: nextId++, width: '', height: '', qty: '1' });

interface Props {
  onClose: () => void;
}

export default function HdfCalculator({ onClose }: Props) {
  const [prices, setPrices] = useState<Prices>({ pricePerM2: '', cutPerM: '' });
  const [rows, setRows] = useState<CalcRow[]>([emptyRow()]);

  const updateRow = (id: number, field: keyof Omit<CalcRow, 'id'>, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const addRow = () => setRows(prev => [...prev, emptyRow()]);
  const removeRow = (id: number) => setRows(prev => prev.filter(r => r.id !== id));

  const pricesSet = num(prices.pricePerM2) > 0 && num(prices.cutPerM) > 0;

  const totals = rows.reduce(
    (acc, row) => {
      if (!num(row.width) || !num(row.height)) return acc;
      const r = calcRow(row, prices);
      return { area: acc.area + r.area * r.qty, cost: acc.cost + r.totalCost };
    },
    { area: 0, cost: 0 }
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex justify-center items-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-canvas w-full max-w-2xl rounded-xl shadow-xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Nagłówek */}
        <div className="p-5 border-b border-hairline-soft flex justify-between items-center bg-surface-soft rounded-t-xl">
          <div>
            <h2 className="text-lg font-semibold text-ink">Kalkulator HDF / Formatki</h2>
            <p className="text-xs text-ink opacity-60 mt-0.5">
              Koszt = pole powierzchni × cena/m² + obwód × koszt cięcia/mb
            </p>
          </div>
          <button onClick={onClose} className="text-ink font-bold text-xl leading-none">✕</button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {/* Stawki */}
          <div className="bg-surface-soft rounded-xl p-4 border border-hairline">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink opacity-60 mb-3">
              Stawki dostawcy
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Cena materiału (zł/m²)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="np. 28,50"
                    value={prices.pricePerM2}
                    onChange={e => setPrices(p => ({ ...p, pricePerM2: e.target.value }))}
                    className="w-full border border-hairline rounded-lg px-3 py-2 pr-10 outline-none focus:ring-2 focus:ring-ink bg-canvas text-sm"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink opacity-40">zł/m²</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Koszt cięcia (zł/mb obwodu)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="np. 1,20"
                    value={prices.cutPerM}
                    onChange={e => setPrices(p => ({ ...p, cutPerM: e.target.value }))}
                    className="w-full border border-hairline rounded-lg px-3 py-2 pr-10 outline-none focus:ring-2 focus:ring-ink bg-canvas text-sm"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink opacity-40">zł/mb</span>
                </div>
              </div>
            </div>
          </div>

          {/* Formatki */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink opacity-60">
                Formatki
              </h3>
              <button onClick={addRow} className="btn-tertiary text-xs py-1 px-3">
                + Dodaj format
              </button>
            </div>

            {/* Nagłówki kolumn */}
            <div className="grid grid-cols-[1fr_1fr_80px_auto_auto] gap-2 px-1 mb-1">
              {['Szer. (cm)', 'Wys. (cm)', 'Szt.', 'Koszt/szt.', ''].map(h => (
                <div key={h} className="text-[10px] font-semibold uppercase text-ink opacity-50">{h}</div>
              ))}
            </div>

            <div className="space-y-2">
              {rows.map(row => {
                const valid = num(row.width) > 0 && num(row.height) > 0;
                const r = valid ? calcRow(row, prices) : null;
                return (
                  <div key={row.id} className="grid grid-cols-[1fr_1fr_80px_auto_auto] gap-2 items-center">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="np. 30"
                      value={row.width}
                      onChange={e => updateRow(row.id, 'width', e.target.value)}
                      className="border border-hairline rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ink text-sm bg-canvas"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="np. 40"
                      value={row.height}
                      onChange={e => updateRow(row.id, 'height', e.target.value)}
                      className="border border-hairline rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ink text-sm bg-canvas"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="1"
                      value={row.qty}
                      onChange={e => updateRow(row.id, 'qty', e.target.value)}
                      className="border border-hairline rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ink text-sm bg-canvas"
                    />
                    <div className="text-sm font-semibold text-ink min-w-[80px] text-right">
                      {r && pricesSet ? (
                        <span>
                          {(r.totalCost).toFixed(2)}{' '}
                          <span className="text-xs font-normal opacity-60">zł</span>
                          {num(row.qty) > 1 && (
                            <div className="text-[10px] text-ink opacity-50 font-normal">
                              {r.unitCost.toFixed(2)} zł/szt.
                            </div>
                          )}
                        </span>
                      ) : valid ? (
                        <span className="text-xs text-ink opacity-40">wpisz stawki</span>
                      ) : (
                        <span className="text-ink opacity-20">—</span>
                      )}
                    </div>
                    <button
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length === 1}
                      className="text-ink opacity-30 hover:opacity-70 hover:text-red-500 transition disabled:opacity-10 text-lg leading-none px-1"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Szczegóły obliczeń dla pierwszej/ostatniej formatki z wartościami */}
            {(() => {
              const firstValid = rows.find(r => num(r.width) > 0 && num(r.height) > 0);
              if (!firstValid || !pricesSet) return null;
              const r = calcRow(firstValid, prices);
              return (
                <div className="mt-3 p-3 bg-surface-soft rounded-lg border border-hairline text-xs text-ink opacity-70 space-y-1">
                  <p className="font-semibold opacity-100 text-ink mb-1">
                    Rozkład kosztu dla {num(firstValid.width)}×{num(firstValid.height)} cm:
                  </p>
                  <div className="grid grid-cols-2 gap-x-4">
                    <span>Pole: {(r.area * 10000).toFixed(0)} cm² = {r.area.toFixed(4)} m²</span>
                    <span>Koszt materiału: {(r.area * num(prices.pricePerM2)).toFixed(2)} zł</span>
                    <span>Obwód: {(r.perim * 100).toFixed(0)} cm = {r.perim.toFixed(3)} mb</span>
                    <span>Koszt cięcia: {(r.perim * num(prices.cutPerM)).toFixed(2)} zł</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Stopka z sumą */}
        <div className="p-5 border-t border-hairline-soft bg-surface-soft rounded-b-xl flex justify-between items-center gap-4">
          <div className="text-sm text-ink opacity-60">
            {totals.area > 0 && (
              <span>Łączne pole: <strong className="text-ink opacity-100">{totals.area.toFixed(4)} m²</strong></span>
            )}
          </div>
          {pricesSet && totals.cost > 0 ? (
            <div className="text-right">
              <div className="text-xs text-ink opacity-50 mb-0.5">Łączny koszt</div>
              <div className="text-2xl font-bold text-ink">{totals.cost.toFixed(2)} zł</div>
            </div>
          ) : (
            <div className="text-sm text-ink opacity-40">Uzupełnij stawki i wymiary</div>
          )}
        </div>
      </div>
    </div>
  );
}
