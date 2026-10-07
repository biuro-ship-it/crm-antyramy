import React, { useEffect, useRef, useState } from 'react';
import { uploadImage } from '../services/api';
import {
  ACCEPTED_IMAGE_TYPES, COLLAGE_HEIGHT, COLLAGE_WIDTH, CollageResult,
  assertSupportedImage, createCollage, isCollageAborted,
} from '../utils/collage';

interface CollageDialogProps {
  onClose: () => void;
  onSave: (imageUrl: string) => void | Promise<void>; // editor: heroImageUrl + zapis szkicu
}

interface Slot { file: File; url: string } // url = podgląd miniatury (object URL)

const SLOT_LABELS = ['Duże (lewa strona)', 'Małe — góra', 'Małe — dół'];
const PREVIEW_DELAY_MS = 350;

// Kolaż z 3 zdjęć do kampanii. Podgląd to dokładnie ten plik, który zostanie zapisany:
// oba korzystają z jednego wyniku createCollage().
const CollageDialog: React.FC<CollageDialogProps> = ({ onClose, onSave }) => {
  const [slots, setSlots] = useState<(Slot | null)[]>([null, null, null]);
  const [pickError, setPickError] = useState('');
  const [result, setResult] = useState<CollageResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [dragOver, setDragOver] = useState<number | null>(null);

  // Sprzątanie miniatur przy zamknięciu okna
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  useEffect(() => () => slotsRef.current.forEach(s => s && URL.revokeObjectURL(s.url)), []);

  const complete = slots.every(Boolean);

  // Podgląd: z opóźnieniem po zmianie zdjęć / kolejności; poprzednie generowanie przerywane.
  // Stary podgląd zostaje widoczny do czasu nowego — bez migotania.
  useEffect(() => {
    if (!complete) {
      setResult(null);
      setGenerating(false);
      return;
    }
    const files = slots.map(s => s!.file) as [File, File, File];
    const ctrl = new AbortController();
    setGenerating(true);
    setGenError('');
    const timer = setTimeout(() => {
      createCollage(files, { signal: ctrl.signal })
        .then(r => { if (!ctrl.signal.aborted) { setResult(r); setGenerating(false); } })
        .catch(e => {
          if (ctrl.signal.aborted || isCollageAborted(e)) return;
          setResult(null);
          setGenError((e as Error).message);
          setGenerating(false);
        });
    }, PREVIEW_DELAY_MS);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [slots, complete]);

  // Object URL podglądu żyje tyle, co wynik
  useEffect(() => {
    if (!result) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(result.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result]);

  // Esc zamyka (poza zapisem)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  // Wstawia pliki od wskazanego pola (pojedynczy wybór) albo w wolne pola (wybór kilku naraz)
  const placeFiles = (files: File[], startAt: number | null) => {
    setPickError('');
    const ok: File[] = [];
    for (const f of files) {
      try { assertSupportedImage(f); ok.push(f); }
      catch (e) { setPickError(`„${f.name}” — ${(e as Error).message}`); }
    }
    if (ok.length === 0) return;
    setSlots(prev => {
      const next = [...prev];
      const targets = startAt !== null
        ? [0, 1, 2].filter(i => i >= startAt)
        : [...[0, 1, 2].filter(i => !next[i]), ...[0, 1, 2].filter(i => next[i])];
      ok.slice(0, targets.length).forEach((file, k) => {
        const i = targets[k];
        if (next[i]) URL.revokeObjectURL(next[i]!.url);
        next[i] = { file, url: URL.createObjectURL(file) };
      });
      return next;
    });
  };

  const removeSlot = (i: number) => {
    setSlots(prev => {
      const next = [...prev];
      if (next[i]) URL.revokeObjectURL(next[i]!.url);
      next[i] = null;
      return next;
    });
  };

  const makeBig = (i: number) => {
    setSlots(prev => {
      const next = [...prev];
      [next[0], next[i]] = [next[i], next[0]];
      return next;
    });
  };

  const handleSave = async () => {
    if (!result || generating) return;
    setSaving(true);
    setSaveError('');
    try {
      const file = new File([result.blob], 'kolaz.jpg', { type: 'image/jpeg' });
      const url = await uploadImage(file, 'kolaz');
      await onSave(url);
    } catch (e) {
      setSaveError((e as Error).message);
      setSaving(false);
    }
  };

  const filled = slots.filter(Boolean).length;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="collage-title"
        className="bg-canvas w-full sm:max-w-3xl max-h-[94vh] overflow-y-auto rounded-t-xl sm:rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Nagłówek */}
        <div className="sticky top-0 z-10 bg-canvas border-b border-hairline px-5 py-4 flex justify-between items-start gap-3">
          <div className="min-w-0">
            <h3 id="collage-title" className="text-lg font-bold text-ink">Utwórz kolaż</h3>
            <p className="text-xs text-ink font-light">
              3 zdjęcia → jeden obraz {COLLAGE_WIDTH}×{COLLAGE_HEIGHT} nad treścią maila, z plakietką „Oferta tygodnia”.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Zamknij"
            className="text-ink font-light text-2xl leading-none disabled:opacity-40">✕</button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Wybór kilku naraz — wygodne na telefonie (galeria) */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="btn-secondary text-sm cursor-pointer">
              📷 Wybierz zdjęcia
              <input
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                multiple
                className="sr-only"
                onChange={e => { placeFiles(Array.from(e.target.files ?? []), null); e.target.value = ''; }}
              />
            </label>
            <span className="text-xs text-ink font-light">
              {filled}/3 · JPG lub PNG · możesz też przeciągnąć zdjęcie na pole
            </span>
          </div>

          {pickError && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {pickError}
            </div>
          )}

          {/* 3 pola */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {slots.map((slot, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 min-h-[22px]">
                  <span className="text-xs font-semibold text-ink uppercase tracking-wide">{SLOT_LABELS[i]}</span>
                  {i === 0 && slot && (
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-accent-magenta text-white px-2 py-0.5 rounded-pill">duże</span>
                  )}
                </div>
                <label
                  onDragOver={e => { e.preventDefault(); setDragOver(i); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragOver(null);
                    placeFiles(Array.from(e.dataTransfer.files), i);
                  }}
                  className={`relative block aspect-[16/9] sm:aspect-[4/3] rounded-lg overflow-hidden cursor-pointer transition-all ${
                    slot
                      ? `border-2 ${i === 0 ? 'border-accent-magenta' : 'border-hairline'}`
                      : `border-2 border-dashed ${dragOver === i ? 'border-accent-magenta bg-block-pink' : 'border-hairline bg-surface-soft hover:bg-hairline-soft'}`
                  }`}
                >
                  {slot ? (
                    <img src={slot.url} alt={slot.file.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-ink font-light text-sm">
                      <span className="text-2xl">＋</span>
                      Dodaj zdjęcie
                    </span>
                  )}
                  <input
                    type="file"
                    accept={ACCEPTED_IMAGE_TYPES.join(',')}
                    className="sr-only"
                    onChange={e => { placeFiles(Array.from(e.target.files ?? []).slice(0, 1), i); e.target.value = ''; }}
                  />
                </label>
                {slot && (
                  <div className="flex items-center gap-1">
                    {i > 0 && (
                      <button type="button" onClick={() => makeBig(i)} className="btn-tertiary text-xs px-2 py-1">
                        ⤢ Ustaw jako duże
                      </button>
                    )}
                    <button type="button" onClick={() => removeSlot(i)} className="btn-tertiary text-xs px-2 py-1 ml-auto">
                      Usuń
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Podgląd — ten sam plik, który zostanie zapisany */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-ink uppercase tracking-wide">Podgląd</span>
            {/* Bez zaokrągleń — plik ma ostre rogi, a plakietka leży w samym rogu */}
            <div className="relative aspect-[3/2] overflow-hidden border border-hairline bg-surface-soft shadow-soft">
              {previewUrl ? (
                <img src={previewUrl} alt="Podgląd kolażu" className={`w-full h-full object-contain bg-white transition-opacity ${generating ? 'opacity-60' : ''}`} />
              ) : !generating && (
                <span className="absolute inset-0 flex items-center justify-center text-sm text-ink font-light px-6 text-center">
                  {complete ? 'Nie udało się utworzyć podglądu.' : 'Podgląd pojawi się po dodaniu 3 zdjęć.'}
                </span>
              )}
              {generating && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex items-center gap-2 bg-canvas/90 text-ink text-sm px-3 py-1.5 rounded-pill shadow-soft">
                    <span className="w-4 h-4 border-2 border-hairline border-t-accent-magenta rounded-full animate-spin" />
                    Tworzę kolaż…
                  </span>
                </span>
              )}
            </div>
            {result && (
              <p className="text-xs text-ink font-light">
                {COLLAGE_WIDTH}×{COLLAGE_HEIGHT} px · <strong className="font-semibold">{result.sizeKB} KB</strong> · jakość JPG {Math.round(result.quality * 100)}%
              </p>
            )}
            {result?.overLimit && (
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-lg px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                Plik ma {result.sizeKB} KB — więcej niż zalecane 250 KB nawet przy najniższej jakości. Można zapisać, ale mail będzie się dłużej ładował.
              </div>
            )}
            {genError && (
              <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-300">
                {genError}
              </div>
            )}
          </div>

          {saveError && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {saveError}
            </div>
          )}
        </div>

        {/* Stopka */}
        <div className="sticky bottom-0 bg-canvas border-t border-hairline px-5 py-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">Anuluj</button>
          <button type="button" onClick={handleSave} disabled={!result || generating || saving} className="btn-primary">
            {saving ? 'Zapisuję…' : 'Zapisz kolaż'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CollageDialog;
