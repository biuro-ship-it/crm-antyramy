import { useCallback, useEffect, useRef, useState } from 'react';
import { SupplierMaterialImage } from '../services/api';
import { thumbSrc } from '../utils/materialImage';
import ImageLightbox from './ImageLightbox';

interface MaterialThumbProps {
  image?: SupplierMaterialImage;
  name: string;
  size?: 'sm' | 'lg'; // sm = lista towarów (44 px), lg = podgląd w edycji
  onBrokenChange?: (broken: boolean) => void; // zdjęcie (ani miniatura, ani pełne) się nie wczytuje
}

const SIZES = { sm: 'w-11 h-11', lg: 'w-24 h-24' };

// Neutralna ikona: brak zdjęcia albo link, który się nie wczytał.
const Placeholder = ({ size }: { size: 'sm' | 'lg' }) => (
  <div className={`${SIZES[size]} shrink-0 rounded-lg border border-hairline-soft bg-ink/5 text-ink/30 flex items-center justify-center`} aria-hidden="true">
    <svg viewBox="0 0 24 24" className="w-1/2 h-1/2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m21 16-5-5-9 9" />
    </svg>
  </div>
);

// Miniaturka towaru; kliknięcie otwiera powiększenie (pełne zdjęcie, nie miniaturę).
// Gdy nie wczyta się sama miniatura, próbujemy pełnego zdjęcia; dopiero potem ikona.
export default function MaterialThumb({ image, name, size = 'sm', onBrokenChange }: MaterialThumbProps) {
  const candidates = image ? [...new Set([thumbSrc(image), image.url].filter((u): u is string => !!u))] : [];
  const [failed, setFailed] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const src = candidates.find(c => !failed.includes(c)) ?? null;
  const broken = !!image && !src;
  useEffect(() => { onBrokenChange?.(broken); }, [broken, onBrokenChange]);

  if (!image || !src) return <Placeholder size={size} />;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Powiększ zdjęcie: ${name}`}
        className={`${SIZES[size]} shrink-0 rounded-lg overflow-hidden border border-hairline-soft bg-ink/5 focus:outline-none focus:ring-2 focus:ring-accent-magenta hover:opacity-90 transition-opacity`}
      >
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(prev => [...prev, src])}
          className="w-full h-full object-cover"
        />
      </button>
      {open && <ImageLightbox src={image.url} label={`Zdjęcie: ${name}`} onClose={close} returnFocusRef={buttonRef} />}
    </>
  );
}
