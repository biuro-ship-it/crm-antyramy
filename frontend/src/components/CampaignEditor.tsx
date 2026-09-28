import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Campaign, CampaignDraft, CampaignVariant, Client, Product,
  createCampaign, updateCampaign, previewCampaignDraft, openCampaignDraftPdf, startCampaign,
} from '../services/api';
import RecipientFilters from './RecipientFilters';
import CampaignSendRunner from './CampaignSendRunner';
import {
  EMPTY_FILTER, RecipientFilter, matchesFilter, canReceive, recentlyCampaigned, salutationPreview,
} from '../utils/campaignFilters';
import { endsWithSignature, SIGNATURE_WARNING } from '../utils/signatureCheck';
import { parseCampaignJson } from '../utils/campaignImport';

interface CampaignEditorProps {
  campaign: Campaign | null;              // null = nowa kampania
  clients: Client[];
  products: Product[];
  colorLabels: Record<string, string>;
  onClose: () => void;                    // powrót do listy (lista się odświeża)
  onSent: (id: string) => void;           // wysyłka zakończona → szczegóły
}

type Step = 1 | 2 | 3 | 4;

const PLACEHOLDERS = [
  { token: '{zwrot|Dzień dobry}', hint: 'zwrot z karty klienta, np. „Panie Marku”; bez zwrotu: „Dzień dobry”' },
  { token: '{firma}', hint: 'nazwa firmy' },
  { token: '{miasto}', hint: 'miasto klienta' },
];

const inputCls = 'w-full border border-hairline rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ink bg-canvas';
const labelCls = 'block text-xs font-semibold text-ink font-light uppercase tracking-wide mb-1.5';

const Alert: React.FC<{ tone: 'error' | 'warn' | 'info'; children: React.ReactNode }> = ({ tone, children }) => (
  <div className={`rounded-lg px-4 py-3 text-sm ${
    tone === 'error' ? 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300'
    : tone === 'warn' ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300'
    : 'bg-block-lilac border border-hairline text-ink'
  }`}>{children}</div>
);

const CampaignEditor: React.FC<CampaignEditorProps> = ({ campaign, clients, products, colorLabels, onClose, onSent }) => {
  const [campaignId, setCampaignId] = useState<string | null>(campaign?.id ?? null);
  const [step, setStep] = useState<Step>(1);

  // Treść
  const [name, setName] = useState(campaign?.name ?? '');
  const [pdfTitle, setPdfTitle] = useState(campaign?.pdfTitle ?? '');
  const [noProducts, setNoProducts] = useState(campaign?.noProducts ?? false);
  const [productIds, setProductIds] = useState<string[]>(campaign?.productIds ?? []);
  const [subjectA, setSubjectA] = useState(campaign?.variantA.subject ?? 'Nowa oferta — Antyramy');
  const [contentA, setContentA] = useState(campaign?.variantA.content ?? '{zwrot|Dzień dobry},\n\n');
  const [abTest, setAbTest] = useState(!!campaign?.variantB);
  const [subjectB, setSubjectB] = useState(campaign?.variantB?.subject ?? '');
  const [separateB, setSeparateB] = useState(campaign?.variantB?.content != null);
  const [contentB, setContentB] = useState(campaign?.variantB?.content ?? '');

  // Odbiorcy: zaznaczeni + przypisany wariant
  const [selected, setSelected] = useState<Set<string>>(new Set((campaign?.recipients ?? []).map(r => r.clientId)));
  const [variants, setVariants] = useState<Record<string, CampaignVariant>>(
    Object.fromEntries((campaign?.recipients ?? []).map(r => [r.clientId, r.variant])),
  );
  const [filter, setFilter] = useState<RecipientFilter>(EMPTY_FILTER);

  // Stan UI
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [dirty, setDirty] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonWarnings, setJsonWarnings] = useState<string[]>([]);
  const [sending, setSending] = useState<{ total: number } | null>(null);

  // Podgląd
  const [previewClientId, setPreviewClientId] = useState<string>('');
  const [previewVariant, setPreviewVariant] = useState<CampaignVariant>('A');
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Każda zmiana pól = niezapisane zmiany
  const touch = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true); };

  const visible = useMemo(() => clients.filter(c => matchesFilter(c, filter)), [clients, filter]);
  const selectedClients = useMemo(() => clients.filter(c => selected.has(c.id)), [clients, selected]);
  const sendable = selectedClients.filter(canReceive);
  const recent = useMemo(() => recentlyCampaigned(sendable, 7), [sendable]);
  const hiddenSelected = selectedClients.filter(c => !matchesFilter(c, filter)).length;
  const countB = abTest ? sendable.filter(c => variants[c.id] === 'B').length : 0;

  const draft = (): CampaignDraft => ({
    name: name.trim() || 'Kampania bez nazwy',
    pdfTitle,
    noProducts,
    productIds: noProducts ? [] : productIds,
    variantA: { subject: subjectA, content: contentA },
    variantB: abTest ? { subject: subjectB, content: separateB ? contentB : null } : null,
    recipients: [...selected].map(id => ({ clientId: id, variant: abTest ? (variants[id] ?? 'A') : 'A' })),
  });

  const save = async (): Promise<string | null> => {
    setSaving(true);
    setError('');
    try {
      const d = draft();
      const saved = campaignId ? await updateCampaign(campaignId, d) : await createCampaign(d);
      setCampaignId(saved.id);
      if (!name.trim()) setName(d.name);
      setDirty(false);
      return saved.id;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClick = async () => {
    if (await save()) { setInfo('Szkic zapisany.'); setTimeout(() => setInfo(''), 2500); }
  };

  const handleClose = () => {
    if (dirty && !window.confirm('Masz niezapisane zmiany. Wyjść bez zapisu?')) return;
    onClose();
  };

  // ─── Odbiorcy ──
  const toggleClient = (c: Client) => {
    if (!canReceive(c)) return;
    setSelected(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; });
    setDirty(true);
  };
  const visibleSendable = visible.filter(canReceive);
  const allVisibleSelected = visibleSendable.length > 0 && visibleSendable.every(c => selected.has(c.id));
  const toggleAllVisible = () => {
    setSelected(prev => {
      const n = new Set(prev);
      visibleSendable.forEach(c => (allVisibleSelected ? n.delete(c.id) : n.add(c.id)));
      return n;
    });
    setDirty(true);
  };
  const splitAB = () => {
    const ids = sendable.map(c => c.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setVariants(Object.fromEntries(ids.map((id, i) => [id, i % 2 === 0 ? 'A' : 'B'])));
    if (!abTest) setAbTest(true);
    setDirty(true);
  };
  const unselectRecent = () => {
    setSelected(prev => { const n = new Set(prev); recent.forEach(c => n.delete(c.id)); return n; });
    setDirty(true);
  };

  // ─── Placeholdery w treści ──
  const insertPlaceholder = (token: string) => {
    const el = contentRef.current;
    if (!el) { setContentA(c => c + token); setDirty(true); return; }
    const start = el.selectionStart ?? contentA.length;
    const end = el.selectionEnd ?? contentA.length;
    const next = contentA.slice(0, start) + token + contentA.slice(end);
    setContentA(next);
    setDirty(true);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
  };

  // ─── Podgląd (z opóźnieniem, żeby nie strzelać przy każdym znaku) ──
  const previewClient = previewClientId || sendable[0]?.id || '';
  const pv = previewVariant === 'B' && abTest
    ? { subject: subjectB, content: separateB ? contentB : contentA }
    : { subject: subjectA, content: contentA };
  useEffect(() => {
    if (step !== 3) return;
    const t = setTimeout(() => {
      previewCampaignDraft({
        clientId: previewClient || null, pdfTitle, noProducts, productIds, subject: pv.subject, content: pv.content,
      })
        .then(p => { setPreview(p); setPreviewError(''); })
        .catch(e => setPreviewError((e as Error).message));
    }, 500);
    return () => clearTimeout(t);
  }, [step, previewClient, pdfTitle, noProducts, productIds, pv.subject, pv.content]);

  const handlePdf = async () => {
    setPdfLoading(true);
    setError('');
    try {
      await openCampaignDraftPdf({ clientId: null, pdfTitle, noProducts, productIds, subject: subjectA, content: contentA });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPdfLoading(false);
    }
  };

  // ─── Import JSON ──
  const applyJson = () => {
    try {
      const r = parseCampaignJson(jsonText, products, clients, colorLabels);
      if (r.pdfTitle !== null) setPdfTitle(r.pdfTitle);
      if (r.subjectA !== null) setSubjectA(r.subjectA);
      if (r.content !== null) setContentA(r.content);
      if (r.subjectB) { setAbTest(true); setSubjectB(r.subjectB); }
      if (r.productIds !== null) { setProductIds(r.productIds); setNoProducts(r.productIds.length === 0 ? noProducts : false); }
      if (r.filter) { setFilter(r.filter); setSelected(new Set(r.recipientIds)); }
      if (!name.trim() && r.pdfTitle) setName(r.pdfTitle);
      setJsonWarnings(r.warnings);
      setDirty(true);
      setShowJson(false);
      setJsonText('');
      setInfo(`Zaimportowano z JSON${r.filter ? ` — zaznaczono ${r.recipientIds.length} odbiorców` : ''}. Nic nie zostało wysłane.`);
    } catch (e) {
      setJsonWarnings([(e as Error).message]);
    }
  };

  // ─── Wysyłka ──
  const validation = (): string | null => {
    if (!noProducts && productIds.length === 0) return 'Wybierz produkty albo zaznacz „bez tabeli i PDF” (krok 1).';
    if (!subjectA.trim()) return 'Uzupełnij temat maila (krok 3).';
    if (!contentA.trim()) return 'Uzupełnij treść maila (krok 3).';
    if (abTest && !subjectB.trim()) return 'Uzupełnij temat B albo wyłącz test A/B (krok 3).';
    if (abTest && separateB && !contentB.trim()) return 'Uzupełnij treść B albo użyj wspólnej (krok 3).';
    if (sendable.length === 0) return 'Wybierz odbiorców (krok 2).';
    return null;
  };

  const handleSend = async () => {
    const v = validation();
    if (v) { setError(v); return; }
    const abInfo = abTest ? ` (A: ${sendable.length - countB}, B: ${countB})` : '';
    if (!window.confirm(`Wysłać kampanię „${name.trim() || 'bez nazwy'}” do ${sendable.length} odbiorców${abInfo}?`)) return;
    const id = await save();
    if (!id) return;
    try {
      const res = await startCampaign(id);
      setSending({ total: res.pending });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const signatureWarn = endsWithSignature(contentA) || (abTest && separateB && endsWithSignature(contentB));

  // ─── Widok wysyłki ──
  if (sending && campaignId) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <h2 className="text-2xl font-bold text-ink tracking-tight">Wysyłka: {name}</h2>
        <CampaignSendRunner
          campaignId={campaignId}
          initialCounts={null}
          initialPending={sending.total}
          onDone={() => onSent(campaignId)}
        />
        <button type="button" onClick={onClose} className="btn-secondary">Wróć do listy</button>
      </div>
    );
  }

  const steps = [
    { n: 1 as Step, label: 'Produkty', sub: noProducts ? 'bez produktów' : `${productIds.length} wybranych` },
    { n: 2 as Step, label: 'Odbiorcy', sub: `${sendable.length} z e-mailem` },
    { n: 3 as Step, label: 'Treść', sub: abTest ? 'test A/B' : '' },
    { n: 4 as Step, label: 'Wysyłka', sub: '' },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      {/* Nagłówek */}
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div className="min-w-0 flex-1">
          <button type="button" onClick={handleClose} className="text-sm text-ink font-light hover:underline mb-2">← Kampanie</button>
          <input
            type="text"
            value={name}
            onChange={e => touch(setName)(e.target.value)}
            placeholder="Nazwa kampanii, np. Listwa dębowa — wrzesień"
            className="w-full text-2xl font-bold text-ink tracking-tight bg-transparent outline-none border-b border-transparent focus:border-hairline"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => setShowJson(s => !s)} className="btn-secondary text-sm">Wklej z JSON</button>
          <button type="button" onClick={handleSaveClick} disabled={saving} className="btn-secondary text-sm disabled:opacity-50">
            {saving ? 'Zapisuję…' : dirty ? 'Zapisz szkic •' : 'Zapisz szkic'}
          </button>
        </div>
      </div>

      {showJson && (
        <div className="bg-surface-soft border border-hairline rounded-xl p-4 mb-6 space-y-3">
          <p className="text-sm text-ink">Wklej JSON kampanii. Import wypełni formularz i zaznaczy odbiorców — <strong>nic nie wyśle</strong>.</p>
          <textarea
            rows={8}
            value={jsonText}
            onChange={e => setJsonText(e.target.value)}
            placeholder={'{ "tytul_pdf": "", "temat": "", "temat_b": "", "tresc": "",\n  "kody_produktow": [], "filtr": { "typ": [], "kolor_relacji": [], "trasa": [], "tagi": [] } }'}
            className={`${inputCls} font-mono text-xs`}
          />
          <div className="flex gap-2">
            <button type="button" onClick={applyJson} disabled={!jsonText.trim()} className="btn-primary text-sm disabled:opacity-50">Importuj</button>
            <button type="button" onClick={() => { setShowJson(false); setJsonWarnings([]); }} className="btn-secondary text-sm">Anuluj</button>
          </div>
        </div>
      )}

      <div className="space-y-3 mb-6">
        {error && <Alert tone="error">{error}</Alert>}
        {info && <Alert tone="info">{info}</Alert>}
        {jsonWarnings.length > 0 && (
          <Alert tone="warn">
            <div className="flex justify-between gap-3">
              <ul className="list-disc pl-4 space-y-0.5">{jsonWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              <button type="button" onClick={() => setJsonWarnings([])} className="leading-none shrink-0">✕</button>
            </div>
          </Alert>
        )}
      </div>

      {/* Kroki */}
      <div className="flex items-center gap-0 mb-8 bg-surface-soft rounded-xl p-1">
        {steps.map(({ n, label, sub }) => (
          <button
            key={n}
            type="button"
            onClick={() => setStep(n)}
            className={`flex-1 flex flex-col items-center py-3 px-2 rounded-lg transition-all text-sm font-medium ${
              step === n ? 'bg-canvas shadow-sm text-ink' : 'text-ink font-light hover:text-ink'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${
                step === n ? 'bg-primary text-on-primary' : 'bg-hairline text-ink font-light'
              }`}>{n}</span>
              {label}
            </span>
            {sub && <span className="text-xs text-ink font-light mt-0.5">{sub}</span>}
          </button>
        ))}
      </div>

      {/* ===== KROK 1 — PRODUKTY ===== */}
      {step === 1 && (
        <div className="space-y-6">
          <label className="flex items-center gap-3 cursor-pointer w-fit">
            <input type="checkbox" checked={noProducts} onChange={e => touch(setNoProducts)(e.target.checked)} className="rounded border-hairline" />
            <span className="text-sm text-ink font-semibold">Bez tabeli i PDF</span>
            <span className="text-xs text-ink font-light">(sam tekst maila)</span>
          </label>

          <div>
            <label className={labelCls}>Tytuł oferty (nagłówek maila i PDF)</label>
            <input type="text" value={pdfTitle} onChange={e => touch(setPdfTitle)(e.target.value)} placeholder="np. Nowa listwa dębowa" className={inputCls} />
          </div>

          {!noProducts && (products.length === 0 ? (
            <p className="text-center py-12 text-ink font-light">Brak produktów w katalogu — dodaj je w zakładce Produkty.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map(p => {
                const sel = productIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => touch(setProductIds)(sel ? productIds.filter(x => x !== p.id) : [...productIds, p.id])}
                    className={`text-left rounded-xl border-2 overflow-hidden transition-all ${sel ? 'border-ink' : 'border-hairline'}`}
                  >
                    <div className="aspect-square bg-surface-soft overflow-hidden relative">
                      {p.imageUrl
                        ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-ink font-light opacity-50 text-xs">brak zdjęcia</div>}
                      {sel && <div className="absolute top-2 right-2 w-6 h-6 bg-primary text-on-primary rounded-full flex items-center justify-center text-xs">✓</div>}
                    </div>
                    <div className="p-3">
                      <p className="font-semibold text-ink text-sm leading-tight line-clamp-2">{p.name}</p>
                      {p.code && <p className="text-xs text-ink font-light mt-0.5">{p.code}</p>}
                      {p.priceNetto > 0 && <p className="text-sm font-bold text-ink mt-1">{p.priceNetto.toFixed(2)} zł</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}

          <div className="flex justify-end">
            <button type="button" onClick={() => setStep(2)} className="btn-primary">Dalej: odbiorcy</button>
          </div>
        </div>
      )}

      {/* ===== KROK 2 — ODBIORCY ===== */}
      {step === 2 && (
        <div>
          <RecipientFilters filter={filter} onChange={setFilter} clients={clients} colorLabels={colorLabels} />

          <div className="flex flex-wrap gap-2 items-center mb-3">
            <button type="button" onClick={splitAB} disabled={sendable.length < 2} className="btn-secondary text-sm disabled:opacity-40">
              🎲 Podziel losowo na A i B
            </button>
            {selected.size > 0 && (
              <button type="button" onClick={() => { setSelected(new Set()); setDirty(true); }} className="text-sm text-ink font-light hover:underline">
                Odznacz wszystkich
              </button>
            )}
            <span className="text-sm text-ink font-light ml-auto">
              Zaznaczono <strong>{sendable.length}</strong>{abTest ? ` (A: ${sendable.length - countB}, B: ${countB})` : ''}
              {hiddenSelected > 0 && ` · ${hiddenSelected} poza bieżącym filtrem`}
            </span>
          </div>

          <div className="bg-canvas border border-hairline rounded-xl overflow-hidden mb-6">
            <div className="flex items-center gap-3 px-4 py-3 bg-surface-soft border-b border-hairline text-xs font-semibold text-ink uppercase tracking-wide">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} className="rounded border-hairline" />
              <span className="flex-1">{visible.length} klientów{visible.length !== clients.length ? ' (przefiltrowanych)' : ''}</span>
              <span className="hidden sm:block w-40">Zwrot w mailu</span>
              {abTest && <span className="w-8 text-center">War.</span>}
            </div>
            <div className="divide-y divide-hairline-soft max-h-[28rem] overflow-y-auto">
              {visible.length === 0 ? (
                <p className="text-sm text-ink font-light px-4 py-6">Brak klientów dla tych filtrów.</p>
              ) : visible.map(c => {
                const ok = canReceive(c);
                const sel = selected.has(c.id);
                const sal = salutationPreview(c);
                return (
                  <label
                    key={c.id}
                    className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                      !ok ? 'opacity-50 cursor-not-allowed' : sel ? 'bg-block-lilac cursor-pointer' : 'hover:bg-surface-soft cursor-pointer'
                    }`}
                  >
                    <input type="checkbox" checked={sel && ok} disabled={!ok} onChange={() => toggleClient(c)} className="rounded border-hairline shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-ink text-sm truncate">{c.companyName}</p>
                      <p className="text-xs text-ink font-light truncate">
                        {c.type}{c.address?.city ? ` · ${c.address.city}` : ''}{c.email ? ` · ${c.email}` : ''}
                        {(c.tags ?? []).length > 0 && ` · ${(c.tags ?? []).join(', ')}`}
                      </p>
                    </div>
                    {c.noMarketing ? (
                      <span className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-full shrink-0">wypisany</span>
                    ) : !c.email ? (
                      <span className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full shrink-0">brak e-maila</span>
                    ) : (
                      <span className={`hidden sm:block w-40 text-xs truncate ${sal.missing ? 'text-amber-700 dark:text-amber-400 italic' : 'text-ink'}`} title={sal.missing ? 'Brak zwrotu — uzupełnij na karcie klienta' : ''}>
                        {sal.text}{sal.missing ? ' ⚠' : ''}
                      </span>
                    )}
                    {abTest && (
                      <span className="w-8 text-center text-xs font-bold text-ink">{ok && sel ? (variants[c.id] ?? 'A') : ''}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-between">
            <button type="button" onClick={() => setStep(1)} className="btn-secondary">Wstecz</button>
            <button type="button" onClick={() => setStep(3)} className="btn-primary">Dalej: treść</button>
          </div>
        </div>
      )}

      {/* ===== KROK 3 — TREŚĆ ===== */}
      {step === 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-5">
            <div>
              <label className={labelCls}>Temat maila {abTest && '(A)'}</label>
              <input type="text" value={subjectA} onChange={e => touch(setSubjectA)(e.target.value)} className={inputCls} />
            </div>

            <label className="flex items-center gap-3 cursor-pointer w-fit">
              <input type="checkbox" checked={abTest} onChange={e => touch(setAbTest)(e.target.checked)} className="rounded border-hairline" />
              <span className="text-sm text-ink font-semibold">Test A/B (drugi temat)</span>
            </label>

            {abTest && (
              <div className="space-y-3 pl-4 border-l-2 border-hairline">
                <div>
                  <label className={labelCls}>Temat maila (B)</label>
                  <input type="text" value={subjectB} onChange={e => touch(setSubjectB)(e.target.value)} className={inputCls} />
                </div>
                <label className="flex items-center gap-3 cursor-pointer w-fit">
                  <input type="checkbox" checked={separateB} onChange={e => touch(setSeparateB)(e.target.checked)} className="rounded border-hairline" />
                  <span className="text-sm text-ink">Osobna treść dla B</span>
                </label>
                {countB === 0 && sendable.length > 1 && (
                  <Alert tone="warn">
                    Odbiorcy nie są podzieleni — wszyscy dostaną wariant A.{' '}
                    <button type="button" onClick={splitAB} className="font-semibold underline">Podziel losowo</button>
                  </Alert>
                )}
              </div>
            )}

            <div>
              <label className={labelCls}>Treść maila {abTest && separateB && '(A)'}</label>
              <textarea
                ref={contentRef}
                rows={11}
                value={contentA}
                onChange={e => touch(setContentA)(e.target.value)}
                className={`${inputCls} resize-y font-sans`}
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {PLACEHOLDERS.map(p => (
                  <button key={p.token} type="button" onClick={() => insertPlaceholder(p.token)} title={p.hint}
                    className="text-xs px-2 py-0.5 rounded-md border border-hairline font-mono text-ink hover:bg-surface-soft">
                    {p.token}
                  </button>
                ))}
              </div>
              <p className="text-xs text-ink font-light mt-1">Kliknij, żeby wstawić w miejscu kursora. Działają też w temacie. Podpis i tekst wypisu dodają się automatycznie.</p>
            </div>

            {abTest && separateB && (
              <div>
                <label className={labelCls}>Treść maila (B)</label>
                <textarea rows={8} value={contentB} onChange={e => touch(setContentB)(e.target.value)} className={`${inputCls} resize-y font-sans`} />
              </div>
            )}

            {signatureWarn && <Alert tone="warn">{SIGNATURE_WARNING}</Alert>}

            <div className="flex justify-between">
              <button type="button" onClick={() => setStep(2)} className="btn-secondary">Wstecz</button>
              <button type="button" onClick={() => setStep(4)} className="btn-primary">Dalej: wysyłka</button>
            </div>
          </div>

          {/* Podgląd */}
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={previewClient}
                onChange={e => setPreviewClientId(e.target.value)}
                className="flex-1 min-w-0 border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ink bg-canvas"
              >
                {sendable.length === 0 && <option value="">(bez odbiorcy — teksty zastępcze)</option>}
                {sendable.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
              </select>
              {abTest && (
                <div className="flex rounded-lg border border-hairline overflow-hidden text-sm">
                  {(['A', 'B'] as const).map(v => (
                    <button key={v} type="button" onClick={() => setPreviewVariant(v)}
                      className={`px-3 py-2 ${previewVariant === v ? 'bg-primary text-on-primary' : 'text-ink hover:bg-surface-soft'}`}>{v}</button>
                  ))}
                </div>
              )}
              {!noProducts && (
                <button type="button" onClick={handlePdf} disabled={pdfLoading || productIds.length === 0} className="btn-secondary text-sm disabled:opacity-40">
                  {pdfLoading ? 'Generuję…' : 'Podgląd PDF'}
                </button>
              )}
            </div>
            {previewError && <Alert tone="error">{previewError}</Alert>}
            {preview && (
              <>
                <p className="text-sm text-ink"><span className="font-light">Temat:</span> <strong>{preview.subject || '—'}</strong></p>
                <iframe title="Podgląd maila" srcDoc={preview.html} sandbox="" className="w-full h-[36rem] rounded-lg border border-hairline bg-white" />
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== KROK 4 — WYSYŁKA ===== */}
      {step === 4 && (
        <div className="max-w-3xl space-y-5">
          <div className="bg-surface-soft rounded-xl border border-hairline p-5 space-y-2 text-sm text-ink">
            <p><span className="font-light">Kampania:</span> <strong>{name || '—'}</strong></p>
            <p><span className="font-light">Temat:</span> <strong>{subjectA || '—'}</strong>{abTest && <> · <span className="font-light">B:</span> <strong>{subjectB || '—'}</strong></>}</p>
            <p><span className="font-light">Produkty:</span> {noProducts ? 'bez tabeli i PDF' : `${productIds.length} (tabela w mailu + PDF)`}</p>
            <p><span className="font-light">Odbiorcy:</span> <strong>{sendable.length}</strong>{abTest && ` (A: ${sendable.length - countB}, B: ${countB})`}</p>
            {selectedClients.length !== sendable.length && (
              <p className="text-amber-700 dark:text-amber-400">{selectedClients.length - sendable.length} zaznaczonych bez e-maila lub wypisanych — zostaną pominięci.</p>
            )}
          </div>

          {recent.length > 0 && (
            <Alert tone="warn">
              <p><strong>{recent.length}</strong> {recent.length === 1 ? 'odbiorca dostał' : 'odbiorców dostało'} kampanię w ostatnich 7 dniach: {recent.slice(0, 8).map(c => c.companyName).join(', ')}{recent.length > 8 ? '…' : ''}</p>
              <button type="button" onClick={unselectRecent} className="mt-2 font-semibold underline">Odznacz ich</button>
            </Alert>
          )}

          {signatureWarn && <Alert tone="warn">{SIGNATURE_WARNING}</Alert>}
          {validation() && <Alert tone="warn">{validation()}</Alert>}

          <div className="flex justify-between">
            <button type="button" onClick={() => setStep(3)} className="btn-secondary">Wstecz</button>
            <button
              type="button"
              onClick={handleSend}
              disabled={saving || !!validation()}
              className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-colors"
            >
              Wyślij do {sendable.length} odbiorców
            </button>
          </div>
          <p className="text-xs text-ink font-light">Przed wysyłką sprawdź podgląd w kroku 3. Maile wychodzą partiami po 10 z Gmaila biuro@antyramy.eu.</p>
        </div>
      )}

    </div>
  );
};

export default CampaignEditor;
