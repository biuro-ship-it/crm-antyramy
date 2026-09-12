/**
 * Otwiera plik z naszego serwera w zewnętrznej przeglądarce.
 *
 * W trybie standalone PWA `<a target="_blank">` prowadzący na tę samą domenę jest
 * przechwytywany przez scope aplikacji i nie otwiera nic. `window.open` z jawnym
 * `noopener,noreferrer` wychodzi poza scope i działa zarówno w PWA, jak i w karcie.
 */
export const openFile = (url: string): void => {
  window.open(url, '_blank', 'noopener,noreferrer');
};
