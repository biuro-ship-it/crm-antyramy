import { PDFDocument, rgb, PDFFont, PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import axios from 'axios';
import { OrderPdfLayout, ORDERING_COMPANY } from './supplierOrders';
import * as fs from 'fs';
import * as path from 'path';

const FONTS_DIR = path.join(__dirname, '..', 'fonts');

export interface ProductForPdf {
  name: string;
  code: string;
  priceNetto: number;
  imageUrl: string;
}

interface TextOptions {
  x: number;
  y: number;
  size: number;
  font: PDFFont;
  color?: ReturnType<typeof rgb>;
  maxWidth?: number;
}

const wrapText = (text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] => {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
};

const drawText = (page: PDFPage, text: string, opts: TextOptions): number => {
  const { x, y, size, font, color = rgb(0.1, 0.1, 0.1), maxWidth } = opts;
  if (!maxWidth) {
    page.drawText(text, { x, y, size, font, color });
    return y - size - 4;
  }

  const lines = wrapText(text, font, size, maxWidth);
  let currentY = y;
  for (const line of lines) {
    page.drawText(line, { x, y: currentY, size, font, color });
    currentY -= size + 4;
  }
  return currentY;
};

/**
 * Zdjęcie produktu pobieramy najpierw z dysku, a dopiero potem HTTP-em.
 *
 * Poprzednia wersja sklejała ścieżkę dwa razy (`path.join(cwd, 'public', localPath)`,
 * gdzie `localPath` był już absolutny), więc gałąź lokalna nigdy nie trafiała
 * w plik — każde zdjęcie leciało zapytaniem HTTP do własnego serwera.
 */
const fetchImageBytes = async (url: string): Promise<Uint8Array | null> => {
  // `/uploads/<plik>` z URL-a albo ścieżki względnej → public_nodejs/public/uploads/<plik>
  const pathname = url.startsWith('/') ? url : (() => {
    try { return new URL(url).pathname; } catch { return ''; }
  })();

  if (pathname.startsWith('/uploads/') && !pathname.includes('..')) {
    const filePath = path.join(process.cwd(), 'public', pathname);
    if (fs.existsSync(filePath)) {
      return new Uint8Array(fs.readFileSync(filePath));
    }
  }

  if (!/^https?:\/\//.test(url)) return null;

  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
    return new Uint8Array(response.data);
  } catch (err) {
    console.error('[pdf] nie udało się pobrać zdjęcia:', url, (err as Error).message);
    return null;
  }
};

const getLogoBytes = (): Uint8Array | null => {
  const candidates = [
    path.join(process.cwd(), 'logo.png'),
    path.join(process.cwd(), 'public', 'logo.png'),
    path.join(process.cwd(), '..', 'icona.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return new Uint8Array(fs.readFileSync(p));
  }
  return null;
};

export const generatePromotionPdf = async (
  title: string,
  content: string,
  products: ProductForPdf[]
): Promise<Buffer> => {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const regularFontBytes = fs.readFileSync(path.join(FONTS_DIR, 'LiberationSans-Regular.ttf'));
  const boldFontBytes = fs.readFileSync(path.join(FONTS_DIR, 'LiberationSans-Bold.ttf'));
  const regularFont = await pdfDoc.embedFont(regularFontBytes);
  const boldFont = await pdfDoc.embedFont(boldFontBytes);

  const PAGE_W = 595;
  const PAGE_H = 842;
  const MARGIN = 48;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  const BRAND_BLUE = rgb(0.09, 0.35, 0.75);
  const DARK = rgb(0.1, 0.1, 0.1);
  const GRAY = rgb(0.45, 0.45, 0.45);
  const LIGHT_GRAY = rgb(0.93, 0.93, 0.93);
  const WHITE = rgb(1, 1, 1);

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);

  // --- HEADER BAR ---
  page.drawRectangle({ x: 0, y: PAGE_H - 80, width: PAGE_W, height: 80, color: BRAND_BLUE });

  // Logo w headerze
  const logoBytes = getLogoBytes();
  if (logoBytes) {
    try {
      const logoImg = await pdfDoc.embedPng(logoBytes).catch(() => pdfDoc.embedJpg(logoBytes));
      const logoDims = logoImg.scaleToFit(120, 50);
      page.drawImage(logoImg, { x: MARGIN, y: PAGE_H - 68, width: logoDims.width, height: logoDims.height });
    } catch { /* logo opcjonalne */ }
  } else {
    page.drawText('ANTYRAMY', { x: MARGIN, y: PAGE_H - 52, size: 22, font: boldFont, color: WHITE });
    page.drawText('Ramy i antyramy', { x: MARGIN, y: PAGE_H - 68, size: 10, font: regularFont, color: rgb(0.8, 0.88, 1) });
  }

  // Data po prawej stronie headera
  const dateStr = new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: 'long', year: 'numeric' });
  const dateW = regularFont.widthOfTextAtSize(dateStr, 10);
  page.drawText(dateStr, { x: PAGE_W - MARGIN - dateW, y: PAGE_H - 52, size: 10, font: regularFont, color: rgb(0.8, 0.88, 1) });

  let cursorY = PAGE_H - 110;

  // --- TYTUŁ ---
  const titleLines = wrapText(title, boldFont, 20, CONTENT_W);
  for (const line of titleLines) {
    page.drawText(line, { x: MARGIN, y: cursorY, size: 20, font: boldFont, color: BRAND_BLUE });
    cursorY -= 26;
  }
  cursorY -= 8;

  // Linia dekoracyjna
  page.drawRectangle({ x: MARGIN, y: cursorY, width: 48, height: 3, color: BRAND_BLUE });
  cursorY -= 18;

  // --- TREŚĆ ---
  const contentLines = content.split('\n');
  for (const line of contentLines) {
    if (line.trim() === '') {
      cursorY -= 8;
      continue;
    }
    const wrapped = wrapText(line, regularFont, 11, CONTENT_W);
    for (const wLine of wrapped) {
      if (cursorY < 80) {
        page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        cursorY = PAGE_H - MARGIN;
      }
      page.drawText(wLine, { x: MARGIN, y: cursorY, size: 11, font: regularFont, color: DARK });
      cursorY -= 16;
    }
  }

  cursorY -= 16;

  // --- PRODUKTY ---
  if (products.length > 0) {
    if (cursorY < 200) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      cursorY = PAGE_H - MARGIN;
    }

    page.drawText('Produkty objęte ofertą', { x: MARGIN, y: cursorY, size: 14, font: boldFont, color: BRAND_BLUE });
    cursorY -= 24;

    const COL = 2;
    const CARD_W = (CONTENT_W - 12) / COL;
    const IMG_H = 90;
    const CARD_PAD = 12;
    const CARD_H = IMG_H + 70;

    for (let i = 0; i < products.length; i++) {
      const col = i % COL;
      const cardX = MARGIN + col * (CARD_W + 12);

      if (col === 0 && i !== 0) {
        cursorY -= CARD_H + 12;
      }

      if (cursorY - CARD_H < 60) {
        page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        cursorY = PAGE_H - MARGIN;
      }

      const cardY = cursorY - CARD_H;

      // Karta produktu
      page.drawRectangle({ x: cardX, y: cardY, width: CARD_W, height: CARD_H, color: LIGHT_GRAY, borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 1 });

      // Zdjęcie produktu
      const product = products[i];
      let imgDrawn = false;
      if (product.imageUrl) {
        const imgBytes = await fetchImageBytes(product.imageUrl);
        if (imgBytes) {
          try {
            const img = product.imageUrl.toLowerCase().includes('.png')
              ? await pdfDoc.embedPng(imgBytes)
              : await pdfDoc.embedJpg(imgBytes);
            const dims = img.scaleToFit(CARD_W - CARD_PAD * 2, IMG_H);
            const imgX = cardX + CARD_PAD + (CARD_W - CARD_PAD * 2 - dims.width) / 2;
            page.drawImage(img, { x: imgX, y: cardY + CARD_H - CARD_PAD - dims.height, width: dims.width, height: dims.height });
            imgDrawn = true;
          } catch { /* pomiń zdjęcie */ }
        }
      }

      if (!imgDrawn) {
        page.drawRectangle({ x: cardX + CARD_PAD, y: cardY + CARD_H - CARD_PAD - IMG_H, width: CARD_W - CARD_PAD * 2, height: IMG_H, color: rgb(0.85, 0.85, 0.85) });
        page.drawText('brak zdjęcia', { x: cardX + CARD_W / 2 - 20, y: cardY + CARD_H - CARD_PAD - IMG_H / 2, size: 9, font: regularFont, color: GRAY });
      }

      // Tekst produktu
      const textY = cardY + CARD_H - IMG_H - CARD_PAD * 2 - 4;
      const nameLines = wrapText(product.name, boldFont, 10, CARD_W - CARD_PAD * 2);
      let ty = textY;
      for (const nl of nameLines.slice(0, 2)) {
        page.drawText(nl, { x: cardX + CARD_PAD, y: ty, size: 10, font: boldFont, color: DARK });
        ty -= 14;
      }

      if (product.code) {
        page.drawText(`Kod: ${product.code}`, { x: cardX + CARD_PAD, y: ty, size: 9, font: regularFont, color: GRAY });
        ty -= 13;
      }

      if (product.priceNetto > 0) {
        const priceStr = `${product.priceNetto.toFixed(2)} zł netto`;
        page.drawText(priceStr, { x: cardX + CARD_PAD, y: ty, size: 10, font: boldFont, color: BRAND_BLUE });
      }
    }

    cursorY -= CARD_H + 12;
  }

  // --- STOPKA ---
  const lastPage = pdfDoc.getPage(pdfDoc.getPageCount() - 1);
  lastPage.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 36, color: BRAND_BLUE });
  lastPage.drawText('antyramy.eu', { x: MARGIN, y: 12, size: 10, font: regularFont, color: WHITE });
  const footerRight = 'biuro@antyramy.eu';
  const frW = regularFont.widthOfTextAtSize(footerRight, 10);
  lastPage.drawText(footerRight, { x: PAGE_W - MARGIN - frW, y: 12, size: 10, font: regularFont, color: WHITE });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
};

// ─── Zamówienie do dostawcy ────────────────────────────────────────────────
// Układ danych (bez cen) buduje orderPdfLayout w supplierOrders.ts; tu tylko rysowanie.

const ORDER_BLUE = rgb(0x1a / 255, 0x56 / 255, 0xdb / 255); // #1a56db

export const generateSupplierOrderPdf = async (layout: OrderPdfLayout): Promise<Buffer> => {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fs.readFileSync(path.join(FONTS_DIR, 'LiberationSans-Regular.ttf')), { subset: true });
  const bold = await pdfDoc.embedFont(fs.readFileSync(path.join(FONTS_DIR, 'LiberationSans-Bold.ttf')), { subset: true });

  const PAGE_W = 595;
  const PAGE_H = 842;
  const MARGIN = 48;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const DARK = rgb(0.1, 0.1, 0.1);
  const ROW_ALT = rgb(0.95, 0.96, 0.99);
  const WHITE = rgb(1, 1, 1);

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const newPage = () => { page = pdfDoc.addPage([PAGE_W, PAGE_H]); return PAGE_H - MARGIN; };

  // Pasek nagłówka
  page.drawRectangle({ x: 0, y: PAGE_H - 70, width: PAGE_W, height: 70, color: ORDER_BLUE });
  page.drawText(layout.title.toUpperCase(), { x: MARGIN, y: PAGE_H - 44, size: 22, font: bold, color: WHITE });
  const dW = font.widthOfTextAtSize(layout.dateLabel, 11);
  page.drawText(layout.dateLabel, { x: PAGE_W - MARGIN - dW, y: PAGE_H - 42, size: 11, font, color: WHITE });

  // Zamawiający | Dostawca
  let y = PAGE_H - 100;
  const colW = (CONTENT_W - 24) / 2;
  const drawParty = (label: string, lines: string[], x: number): number => {
    let yy = y;
    page.drawText(label, { x, y: yy, size: 10, font: bold, color: ORDER_BLUE });
    yy -= 16;
    lines.forEach((line, i) => {
      for (const w of wrapText(line, i === 0 ? bold : font, 10, colW)) {
        page.drawText(w, { x, y: yy, size: 10, font: i === 0 ? bold : font, color: DARK });
        yy -= 14;
      }
    });
    return yy;
  };
  y = Math.min(drawParty('ZAMAWIAJĄCY', layout.buyer, MARGIN), drawParty('DOSTAWCA', layout.supplier, MARGIN + colW + 24)) - 16;

  // Tabela pozycji
  const cols = [
    { title: 'Lp.', w: 36, align: 'left' as const },
    { title: 'Nazwa', w: CONTENT_W - 36 - 80 - 70, align: 'left' as const },
    { title: 'Ilość', w: 80, align: 'right' as const },
    { title: 'Jedn.', w: 70, align: 'left' as const },
  ];
  const drawHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - 6, width: CONTENT_W, height: 22, color: ORDER_BLUE });
    let x = MARGIN;
    for (const c of cols) {
      const tx = c.align === 'right' ? x + c.w - 8 - bold.widthOfTextAtSize(c.title, 10) : x + 8;
      page.drawText(c.title, { x: tx, y, size: 10, font: bold, color: WHITE });
      x += c.w;
    }
    y -= 24;
  };
  drawHeader();
  layout.rows.forEach((row, idx) => {
    const nameLines = wrapText(row[1], font, 10, cols[1].w - 16);
    const rowH = Math.max(1, nameLines.length) * 14 + 8;
    if (y - rowH < 70) { y = newPage(); drawHeader(); }
    if (idx % 2 === 1) page.drawRectangle({ x: MARGIN, y: y - rowH + 14, width: CONTENT_W, height: rowH, color: ROW_ALT });
    let x = MARGIN;
    cols.forEach((c, ci) => {
      const lines = ci === 1 ? nameLines : [row[ci]];
      lines.forEach((line, li) => {
        const tx = c.align === 'right' ? x + c.w - 8 - font.widthOfTextAtSize(line, 10) : x + 8;
        page.drawText(line, { x: tx, y: y - li * 14, size: 10, font, color: DARK });
      });
      x += c.w;
    });
    y -= rowH;
  });
  page.drawRectangle({ x: MARGIN, y: y + 8, width: CONTENT_W, height: 1, color: ORDER_BLUE });
  y -= 16;

  // Uwagi
  if (layout.notes) {
    if (y < 120) y = newPage();
    page.drawText('UWAGI', { x: MARGIN, y, size: 10, font: bold, color: ORDER_BLUE });
    y -= 16;
    for (const para of layout.notes.split(/\r?\n/)) {
      for (const w of wrapText(para, font, 10, CONTENT_W)) {
        if (y < 70) y = newPage();
        page.drawText(w, { x: MARGIN, y, size: 10, font, color: DARK });
        y -= 14;
      }
    }
  }

  // Stopka na każdej stronie
  for (const p of pdfDoc.getPages()) {
    p.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 32, color: ORDER_BLUE });
    p.drawText('antyramy.eu', { x: MARGIN, y: 11, size: 9, font, color: WHITE });
    const right = `${ORDERING_COMPANY.email} · tel. ${ORDERING_COMPANY.phone}`;
    p.drawText(right, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(right, 9), y: 11, size: 9, font, color: WHITE });
  }
  return Buffer.from(await pdfDoc.save());
};
