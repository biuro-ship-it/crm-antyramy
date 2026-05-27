import { PDFDocument, rgb, PDFFont, PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import axios from 'axios';
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

const fetchImageBytes = async (url: string): Promise<Uint8Array | null> => {
  try {
    if (url.startsWith('/') || url.startsWith('http://localhost') || url.startsWith('https://api.crm')) {
      const localPath = url.startsWith('/')
        ? path.join(process.cwd(), 'public', url)
        : url.replace(/https?:\/\/[^/]+/, '');

      const filePath = path.join(process.cwd(), 'public', localPath);
      if (fs.existsSync(filePath)) {
        return new Uint8Array(fs.readFileSync(filePath));
      }
    }
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
    return new Uint8Array(response.data);
  } catch {
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
