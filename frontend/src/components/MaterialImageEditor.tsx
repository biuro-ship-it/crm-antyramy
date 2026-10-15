import { useEffect, useRef, useState } from 'react';
import {
  Supplier, SupplierMaterial,
  uploadSupplierMaterialImage, setSupplierMaterialImageLink, deleteSupplierMaterialImage,
} from '../services/api';
import { prepareMaterialImage, sourceFileError, imageLinkError, SOURCE_ACCEPT } from '../utils/materialImage';
import MaterialThumb from './MaterialThumb';

interface MaterialImageEditorProps {
  supplierId: string;
  material: SupplierMaterial;
  onSupplierUpdated: (s: Supplier) => void;
  // Rodzic blokuje „Zapisz”/„Anuluj” edycji towaru, dopóki zdjęcie się zapisuje
  onBusyChange?: (busy: boolean) => void;
}

type Busy = null | 'upload' | 'link' | 'delete';

const hostOf = (url: string) => { try { return new URL(url).hostname; } catch { return url; } };

// Sekcja „Zdjęcie” w edycji towaru. Każda zmiana zapisuje się od razu (osobne trasy …/image),
// niezależnie od przycisku „Zapisz” nazwy i ceny. Nowe zdjęcie zastępuje poprzednie.
export default function MaterialImageEditor({ supplierId, material, onSupplierUpdated, onBusyChange }: MaterialImageEditorProps) {
  const image = material.image;
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [broken, setBroken] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => { onBusyChange?.(busy !== null); }, [busy, onBusyChange]);

  const showControls = !image || changing;

  const run = async (kind: Exclude<Busy, null>, action: () => Promise<Supplier>) => {
    setBusy(kind);
    setError(null);
    try {
      onSupplierUpdated(await action());
      setChanging(false);
      setLink('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Coś poszło nie tak — spróbuj ponownie.');
    } finally {
      setBusy(null);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // ten sam plik można wybrać ponownie
    if (!file) return;
    const fileError = sourceFileError(file);
    if (fileError) { setError(fileError); return; }
    await run('upload', async () => {
      const { image: big, thumb } = await prepareMaterialImage(file);
      return uploadSupplierMaterialImage(supplierId, material.id, big, thumb);
    });
  };

  const handleLink = async () => {
    const linkError = imageLinkError(link);
    if (linkError) { setError(linkError); return; }
    await run('link', () => setSupplierMaterialImageLink(supplierId, material.id, link.trim()));
  };

  const handleDelete = async () => {
    if (!window.confirm(`Usunąć zdjęcie towaru „${material.name}”?`)) return;
    await run('delete', () => deleteSupplierMaterialImage(supplierId, material.id));
  };

  const busyText = busy === 'upload' ? 'Przygotowuję i wgrywam zdjęcie…' : busy === 'link' ? 'Zapisuję link…' : busy === 'delete' ? 'Usuwam zdjęcie…' : '';

  return (
    <section className="mt-3 pt-3 border-t border-hairline-soft" aria-label="Zdjęcie towaru">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-xs font-bold text-ink/60 uppercase tracking-wider">Zdjęcie</h4>
        <span className="text-xs text-ink/40">zapisuje się od razu</span>
      </div>

      {error && (
        <div role="alert" className="bg-block-pink border border-hairline text-ink text-body-sm rounded-md pl-3 mb-3 flex items-center justify-between gap-2">
          <span className="py-2">⚠️ {error}</span>
          <button type="button" onClick={() => setError(null)} className="w-11 h-11 shrink-0 text-ink/60 font-bold" aria-label="Zamknij komunikat">✕</button>
        </div>
      )}

      {image && !changing && (
        <div className="flex items-center gap-3">
          <MaterialThumb image={image} name={material.name} size="lg" onBrokenChange={setBroken} />
          <div className="min-w-0 flex-1">
            <p className="text-body-sm text-ink truncate">
              {image.source === 'upload' ? 'Wgrane zdjęcie' : <>Link: <span className="text-ink/60">{hostOf(image.url)}</span></>}
            </p>
            {broken && <p className="text-xs text-ink/60">⚠️ Zdjęcie się nie wczytuje — zmień je albo usuń.</p>}
            <div className="flex flex-wrap gap-2 mt-2">
              <button type="button" onClick={() => { setChanging(true); setError(null); }} disabled={!!busy} className="btn-secondary px-4 py-1.5 text-xs">Zmień</button>
              <button type="button" onClick={handleDelete} disabled={!!busy} className="px-4 py-1.5 min-h-[44px] text-xs font-bold rounded-pill border border-hairline text-red-500 hover:bg-block-pink disabled:opacity-40">
                {busy === 'delete' ? 'Usuwam…' : 'Usuń'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showControls && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input ref={fileRef} type="file" accept={SOURCE_ACCEPT} onChange={handleFile} className="hidden" />
            {/* Na telefonie osobno aparat (capture) — „Wgraj zdjęcie” otwiera galerię/pliki */}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} className="btn-accent text-sm">
              {busy === 'upload' ? 'Wgrywam…' : '⬆️ Wgraj zdjęcie'}
            </button>
            <button type="button" onClick={() => cameraRef.current?.click()} disabled={!!busy} className="btn-secondary text-sm sm:hidden">
              📷 Zrób zdjęcie
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <label className="sr-only" htmlFor={`img-link-${material.id}`}>Link do zdjęcia</label>
            <input
              id={`img-link-${material.id}`}
              type="url"
              inputMode="url"
              value={link}
              onChange={e => setLink(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleLink(); } }}
              placeholder="Link do zdjęcia (https://…)"
              disabled={!!busy}
              className="flex-1 bg-canvas border border-hairline rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ink text-body-sm disabled:opacity-60"
            />
            <button type="button" onClick={handleLink} disabled={!!busy || !link.trim()} className="btn-secondary text-sm">
              {busy === 'link' ? 'Zapisuję…' : 'Zapisz link'}
            </button>
          </div>

          <p className="text-xs text-ink/40">
            JPG, PNG lub WebP — zdjęcie zmniejszy się automatycznie. Link: tylko https://, nie kopiujemy go na serwer.
            {image && ' Nowe zdjęcie zastąpi obecne.'}
          </p>
          {image && changing && (
            <button type="button" onClick={() => { setChanging(false); setError(null); setLink(''); }} disabled={!!busy} className="min-h-[44px] px-2 text-xs font-bold text-ink/60 hover:underline">
              Anuluj zmianę
            </button>
          )}
        </div>
      )}

      {/* Kontener zawsze w DOM — czytnik ekranu odczyta zmianę tekstu */}
      <p className={busyText ? 'text-xs text-ink/60 italic mt-2' : 'sr-only'} aria-live="polite">{busyText}</p>
    </section>
  );
}
