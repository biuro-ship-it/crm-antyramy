import { useCallback, useState } from 'react';
import { SupplierMaterialImage } from '../services/api';
import { thumbSrc } from '../utils/materialImage';
import ImageLightbox from './ImageLightbox';

interface MaterialThumbProps {
  image?: SupplierMaterialImage;
  name: string;
  size?: 'sm' | 'lg'; // sm = lista towarów (44 px), lg = podgląd w edycji
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
export default function MaterialThumb({ image, name, size = 'sm' }: MaterialThumbProps) {
  const src = thumbSrc(image);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  if (!image || !src || failedSrc === src) return <Placeholder size={size} />;

  return (
    <>
      <button
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
          onError={() => setFailedSrc(src)}
          className="w-full h-full object-cover"
        />
      </button>
      {open && <ImageLightbox src={image.url} label={`Zdjęcie: ${name}`} onClose={close} />}
    </>
  );
}
