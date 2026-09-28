// Kampanie — czyste funkcje (bez Firestore i Gmaila), testowane w campaignRender.test.ts.
// Placeholdery, HTML maila, podział A/B i rozliczanie partii wysyłki.

// ─── Typy ───────────────────────────────────────────────────────────────────

export type Variant = 'A' | 'B';
export type RecipientStatus = 'pending' | 'sent' | 'failed';

export interface CampaignProduct {
  id: string; name: string; code: string; priceNetto: number; imageUrl: string;
}

export interface CampaignRecipient {
  clientId: string;
  companyName: string;
  email: string;
  variant: Variant;
  status: RecipientStatus;
  error: string | null;
  gmailMessageId: string | null;
  gmailThreadId: string | null;
  sentAt: string | null;
}

export interface CampaignCounts {
  total: number;
  sent: number;
  failed: number;
  skippedNoEmail: number;
  skippedNoMarketing: number;
}

export interface VariantContent { subject: string; content: string }
export interface VariantB { subject: string; content: string | null } // content null = wspólna z A

// Dane klienta potrzebne placeholderom
export interface PlaceholderClient {
  salutation?: string;
  companyName?: string;
  contactPerson?: string;
  address?: { city?: string };
}

// ─── Placeholdery ───────────────────────────────────────────────────────────

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const PLACEHOLDER_RE = /\{(zwrot|firma|miasto|imie)(?:\|([^{}]*))?\}/g;

const placeholderValue = (key: string, client: PlaceholderClient | null): string => {
  if (!client) return '';
  switch (key) {
    case 'zwrot':  return (client.salutation ?? '').trim();
    case 'firma':  return (client.companyName ?? '').trim();
    case 'miasto': return (client.address?.city ?? '').trim();
    // {imie} — tylko wewnętrznie (bez ściągi w UI): pierwszy człon osoby kontaktowej
    case 'imie':   return (client.contactPerson ?? '').trim().split(/\s+/)[0] ?? '';
    default:       return '';
  }
};

/**
 * {zwrot}, {firma}, {miasto}; {x|tekst} → tekst, gdy pole puste.
 * Nieznane {cokolwiek} zostaje bez zmian. `html: true` escapuje wstawiane wartości
 * (treść maila to HTML); temat maila to zwykły tekst, więc bez escapowania.
 * client = null → same teksty zastępcze (np. PDF wspólny dla wszystkich).
 */
export const renderPlaceholders = (
  text: string,
  client: PlaceholderClient | null,
  opts: { html: boolean },
): string =>
  text.replace(PLACEHOLDER_RE, (_m, key: string, fallback: string | undefined) => {
    const value = placeholderValue(key, client) || (fallback ?? '').trim();
    return opts.html ? escapeHtml(value) : value;
  });

// ─── HTML maila ─────────────────────────────────────────────────────────────

export const UNSUBSCRIBE_TEXT = 'Nie chcą Państwo otrzymywać ofert? Wystarczy odpisać NIE.';

export const variantContent = (a: VariantContent, b: VariantB | null, variant: Variant): VariantContent =>
  variant === 'B' && b
    ? { subject: b.subject, content: b.content ?? a.content }
    : a;

/**
 * Mail kampanii. `contentHtml` to treść już po placeholderach (HTML — jak w dotychczasowych
 * Promocjach, nowe linie zamieniane na <br>). `products` null/[] = bez tabeli i zdania o PDF.
 */
export const buildCampaignEmailHtml = (opts: {
  title: string;
  contentHtml: string;
  products: CampaignProduct[] | null;
  signatureHtml: string;
}): string => {
  const { title, contentHtml, products, signatureHtml } = opts;
  const hasProducts = !!products && products.length > 0;

  const productRows = hasProducts ? products!.map(p => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-weight:600">${escapeHtml(p.name)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#666">${escapeHtml(p.code || '—')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#1a56db;font-weight:700">${p.priceNetto > 0 ? `${p.priceNetto.toFixed(2)} zł netto` : '—'}</td>
      </tr>`).join('') : '';

  const titleBlock = title.trim() ? `
        <tr><td style="padding:32px 36px 16px">
          <h1 style="margin:0;font-size:22px;color:#111;font-weight:700">${escapeHtml(title)}</h1>
          <div style="width:40px;height:3px;background:#1a56db;margin-top:12px;border-radius:2px"></div>
        </td></tr>` : `
        <tr><td style="padding:16px 36px 0"></td></tr>`;

  const productsBlock = hasProducts ? `
        <tr><td style="padding:0 36px 32px">
          <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#666;margin-bottom:12px">Produkty objęte ofertą</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:6px;overflow:hidden">
            <tr style="background:#f8f9fa">
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;font-weight:600">Nazwa</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;font-weight:600">Kod</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;font-weight:600">Cena</th>
            </tr>
            ${productRows}
          </table>
          <p style="font-size:12px;color:#888;margin-top:8px">Szczegółowa oferta w załączonym pliku PDF.</p>
        </td></tr>` : '';

  return `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">

        <tr><td style="background:#1a56db;padding:28px 36px">
          <div style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px">Antyramy</div>
          <div style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:2px">Ramy i antyramy</div>
        </td></tr>
${titleBlock}

        <tr><td style="padding:0 36px 24px;color:#333;font-size:15px;line-height:1.7">
          ${contentHtml.replace(/\n/g, '<br>')}
        </td></tr>
${productsBlock}

        <tr><td style="background:#f8f9fa;padding:20px 36px;border-top:1px solid #eee">
          <p style="margin:0;font-size:12px;color:#888">
            ${signatureHtml}
          </p>
          <p style="margin:12px 0 0;font-size:11px;color:#aaa">${UNSUBSCRIBE_TEXT}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

/** Temat i HTML dla konkretnego klienta — to samo w podglądzie i w wysyłce. */
export const renderForClient = (opts: {
  variant: VariantContent;
  title: string;
  products: CampaignProduct[] | null;
  signatureHtml: string;
  client: PlaceholderClient | null;
}): { subject: string; html: string; plainContent: string } => {
  const { variant, title, products, signatureHtml, client } = opts;
  return {
    subject: renderPlaceholders(variant.subject, client, { html: false }),
    html: buildCampaignEmailHtml({
      title,
      contentHtml: renderPlaceholders(variant.content, client, { html: true }),
      products,
      signatureHtml,
    }),
    plainContent: renderPlaceholders(variant.content, client, { html: false }),
  };
};

// ─── A/B i partie wysyłki ───────────────────────────────────────────────────

/** Losowo po równo (przy nieparzystej liczbie A ma o jeden więcej). */
export const splitAB = (ids: string[], rng: () => number = Math.random): Record<string, Variant> => {
  const shuffled = [...ids];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const out: Record<string, Variant> = {};
  shuffled.forEach((id, i) => { out[id] = i % 2 === 0 ? 'A' : 'B'; });
  return out;
};

export const BATCH_SIZE = 10;

export const pickPendingBatch = (recipients: CampaignRecipient[], size = BATCH_SIZE): CampaignRecipient[] =>
  recipients.filter(r => r.status === 'pending').slice(0, size);

export interface BatchResult {
  clientId: string;
  ok: boolean;
  error?: string;
  gmailMessageId?: string | null;
  gmailThreadId?: string | null;
  sentAt?: string;
}

/**
 * Nanosi wyniki partii na listę odbiorców (tylko rekordy wciąż `pending` —
 * nigdy nie cofa już rozliczonych) i przelicza liczniki.
 */
export const applyBatchResults = (
  recipients: CampaignRecipient[],
  results: BatchResult[],
  counts: CampaignCounts,
): { recipients: CampaignRecipient[]; counts: CampaignCounts; pending: number } => {
  const byId = new Map(results.map(r => [r.clientId, r]));
  const next = recipients.map(r => {
    const res = byId.get(r.clientId);
    if (!res || r.status !== 'pending') return r;
    return res.ok
      ? { ...r, status: 'sent' as const, error: null, gmailMessageId: res.gmailMessageId ?? null, gmailThreadId: res.gmailThreadId ?? null, sentAt: res.sentAt ?? null }
      : { ...r, status: 'failed' as const, error: res.error || 'Błąd wysyłki' };
  });
  return {
    recipients: next,
    counts: {
      ...counts,
      total: next.length,
      sent: next.filter(r => r.status === 'sent').length,
      failed: next.filter(r => r.status === 'failed').length,
    },
    pending: next.filter(r => r.status === 'pending').length,
  };
};
