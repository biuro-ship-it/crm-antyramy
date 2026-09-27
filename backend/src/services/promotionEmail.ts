import { EMAIL_SIGNATURE_HTML } from './emailSignature';

// HTML maila promocyjnego. Wydzielony z routes/promotions.ts, bo korzysta z niego
// też skrypt odtwarzający archiwum (scripts/backfill-promotions.ts) — stare
// kampanie nie mają zapisanego HTML, więc składamy go ponownie tym samym kodem.

export interface PromotionEmailProduct {
  name: string;
  code: string;
  priceNetto: number;
}

export const buildPromotionEmailHtml = (
  title: string,
  content: string,
  products: PromotionEmailProduct[],
): string => {
  const productListHtml = products.map(p => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-weight:600">${p.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#666">${p.code || '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#1a56db;font-weight:700">${p.priceNetto > 0 ? `${p.priceNetto.toFixed(2)} zł netto` : '—'}</td>
      </tr>`).join('');

  const contentHtml = content.replace(/\n/g, '<br>');

  return `
<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">

        <!-- Header -->
        <tr><td style="background:#1a56db;padding:28px 36px">
          <div style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px">Antyramy</div>
          <div style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:2px">Ramy i antyramy</div>
        </td></tr>

        <!-- Tytuł -->
        <tr><td style="padding:32px 36px 16px">
          <h1 style="margin:0;font-size:22px;color:#111;font-weight:700">${title}</h1>
          <div style="width:40px;height:3px;background:#1a56db;margin-top:12px;border-radius:2px"></div>
        </td></tr>

        <!-- Treść -->
        <tr><td style="padding:0 36px 24px;color:#333;font-size:15px;line-height:1.7">
          ${contentHtml}
        </td></tr>

        <!-- Tabela produktów -->
        <tr><td style="padding:0 36px 32px">
          <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#666;margin-bottom:12px">Produkty objęte ofertą</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:6px;overflow:hidden">
            <tr style="background:#f8f9fa">
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;font-weight:600">Nazwa</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;font-weight:600">Kod</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;font-weight:600">Cena</th>
            </tr>
            ${productListHtml}
          </table>
          <p style="font-size:12px;color:#888;margin-top:8px">Szczegółowa oferta w załączonym pliku PDF.</p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8f9fa;padding:20px 36px;border-top:1px solid #eee">
          <p style="margin:0;font-size:12px;color:#888">
            ${EMAIL_SIGNATURE_HTML}
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
};
