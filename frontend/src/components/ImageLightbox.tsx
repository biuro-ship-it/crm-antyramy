import { RefObject, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ImageLightboxProps {
  src: string;
  label: string; // np. „Zdjęcie: Szkło 3 mm” — aria-label okna i alt obrazu
  onClose: () => void;
  // Gdzie wrócić fokusem po zamknięciu (miniaturka). Safari nie ustawia fokusu na przycisku po kliknięciu,
  // więc samo document.activeElement nie wystarcza.
  returnFocusRef?: RefObject<HTMLElement>;
}

// Powiększenie zdjęcia. Zamykanie: ✕, kliknięcie w tło, Esc. Tło się nie przewija,
// po zamknięciu fokus wraca na miniaturkę, która otworzyła okno.
export default function ImageLightbox({ src, label, onClose, returnFocusRef }: ImageLightboxProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const opener = returnFocusRef?.current ?? (document.activeElement as HTMLElement | null);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Jedyny przycisk w oknie — Tab nie ucieka do strony pod spodem
      if (e.key === 'Tab') { e.preventDefault(); closeRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [onClose, returnFocusRef]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-3 sm:p-8 overscroll-contain animate-in fade-in"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Zamknij powiększenie"
        className="absolute top-3 right-3 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl leading-none flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-accent-magenta"
      >
        ✕
      </button>
      {failed ? (
        <p className="text-white/80 text-body-sm" onClick={e => e.stopPropagation()}>Nie udało się wczytać zdjęcia.</p>
      ) : (
        <img
          src={src}
          alt={label}
          referrerPolicy="no-referrer"
          onClick={e => e.stopPropagation()}
          onError={() => setFailed(true)}
          // vh dla starszych przeglądarek (iOS < 15.4), dvh tam, gdzie jest — pasek adresu nie zasłania zdjęcia
          className="max-w-full max-h-[calc(100vh-6rem)] supports-[height:100dvh]:max-h-[calc(100dvh-6rem)] object-contain rounded-lg shadow-2xl bg-white"
        />
      )}
    </div>,
    document.body,
  );
}
