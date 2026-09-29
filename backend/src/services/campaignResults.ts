// Kampanie, Etap 2 — pomiar wyników. Czyste funkcje (bez Firestore i sieci),
// testowane w campaignResults.test.ts: odpowiedzi z Gmaila, prośba o wypis („NIE”),
// przypisanie zamówień do kampanii, liczniki wyników, dni robocze.

// ─── Wiadomości z Gmaila ────────────────────────────────────────────────────

export interface ThreadMessage {
  id: string;
  from: string;      // sam adres, małymi literami
  date: string;      // ISO
  text: string;      // treść (text/plain albo HTML bez tagów)
}

interface GmailPart {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailPart[] | null;
  headers?: Array<{ name?: string | null; value?: string | null }> | null;
}

export interface GmailMessageLike {
  id?: string | null;
  internalDate?: string | null;
  payload?: GmailPart | null;
}

const decodeBase64Url = (data: string): string =>
  Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');

const findPart = (part: GmailPart | null | undefined, mime: string): string | null => {
  if (!part) return null;
  if (part.mimeType === mime && part.body?.data) return decodeBase64Url(part.body.data);
  for (const p of part.parts ?? []) {
    const found = findPart(p, mime);
    if (found !== null) return found;
  }
  return null;
};

const htmlToText = (html: string): string =>
  html
    .replace(/<(br|\/p|\/div|\/li|\/tr)[^>]*>/gi, '\n')
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '\n')   // cytat w HTML
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n');

/** Adres e-mail z nagłówka „Imię Nazwisko <adres@x.pl>” (małymi literami). */
export const emailFromHeader = (value: string): string => {
  const m = value.match(/<([^>]+)>/);
  return (m ? m[1] : value).trim().toLowerCase();
};

export const parseGmailMessage = (msg: GmailMessageLike): ThreadMessage => {
  const headers = msg.payload?.headers ?? [];
  const header = (name: string) => headers.find(h => h.name?.toLowerCase() === name)?.value ?? '';
  const plain = findPart(msg.payload, 'text/plain');
  const html = plain === null ? findPart(msg.payload, 'text/html') : null;
  const ms = Number(msg.internalDate);
  return {
    id: msg.id ?? '',
    from: emailFromHeader(header('from')),
    date: Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : '',
    text: plain ?? (html !== null ? htmlToText(html) : ''),
  };
};

// ─── Odpowiedzi ─────────────────────────────────────────────────────────────

// Początek cytowanej wiadomości w odpowiedzi (Gmail PL/EN, Outlook, Apple Mail)
const QUOTE_HEADERS = [
  /^W dniu .+ napisał(\(a\)|a)?:?\s*$/i,          // Gmail PL: „napisał(a):”
  /^On .+ wrote:\s*$/i,
  /^-{2,}\s*(Original Message|Wiadomość oryginalna|Oryginalna wiadomość)\s*-{2,}/i,
  /^(Od|From):\s.+/i,
  /^_{10,}\s*$/,                                  // separator Outlooka
  /^Wysłane z (mojego )?(iPhone|iPada|Androida|telefonu)/i,
  /^Sent from my /i,
];

/** Sama odpowiedź: bez cytatu (linie „>”, nagłówki cytatu) i bez podpisu („-- ”). */
export const extractReplyText = (body: string): string => {
  const out: string[] = [];
  for (const raw of body.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (line === '--' || line === '-- ') break;                      // standardowy separator podpisu
    if (QUOTE_HEADERS.some(re => re.test(line.trim()))) break;
    if (line.trim().startsWith('>')) continue;
    out.push(line);
  }
  return out.join('\n').trim();
};

/** „NIE” / „nie.” / „NIE!” albo tekst zaczynający się od „NIE” krótszy niż 30 znaków. */
export const isUnsubscribeReply = (text: string): boolean => {
  const t = text.trim();
  if (!t) return false;
  if (/^nie[\s.!,;:]*$/i.test(t)) return true;
  // Bez \b — granica słowa w JS nie zna polskich liter („Nieźle” to nie „NIE”)
  return /^nie(?!\p{L})/iu.test(t) && t.length < 30;
};

const SYSTEM_SENDERS = /^(mailer-daemon|postmaster|no-?reply|noreply)@/i;

/** Pierwsza wiadomość od odbiorcy po wysyłce (pomija nasze własne i komunikaty systemowe). */
export const findReply = (
  messages: ThreadMessage[],
  recipientEmail: string,
  sentAt: string,
): ThreadMessage | null => {
  const addr = recipientEmail.trim().toLowerCase();
  return [...messages]
    .sort((a, b) => a.date.localeCompare(b.date))
    .find(m => m.from === addr && !SYSTEM_SENDERS.test(m.from) && (!sentAt || m.date > sentAt)) ?? null;
};

// ─── Zamówienia ─────────────────────────────────────────────────────────────

export type AttributionStatus = 'auto' | 'confirmed' | 'rejected';

export interface AttributedOrder {
  orderId: string;
  amount: number;
  date: string;             // YYYY-MM-DD
  status: AttributionStatus;
}

export interface ClientOrder { id: string; amount: number; date: string }

export interface AttributionRecipient {
  clientId: string;
  status?: string;          // 'sent' | 'failed' | 'pending'
  sentAt?: string | null;
  orders?: AttributedOrder[];
}

export interface AttributionCampaign {
  id: string;
  sentAt: string | null;
  recipients: AttributionRecipient[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const dayOf = (iso: string) => iso.slice(0, 10);

/**
 * Zamówienie klienta z dnia D przypisujemy do OSTATNIEJ kampanii wysłanej mu
 * w dniach [D − windowDays, D] (każde zamówienie liczone raz). Ręczne decyzje
 * (`confirmed`/`rejected`) zostają, dopóki zamówienie istnieje; `auto` jest
 * przeliczane od nowa. Zwraca nową listę zamówień per kampania i klient.
 */
export const attributeOrders = (
  campaigns: AttributionCampaign[],
  ordersByClient: Map<string, ClientOrder[]>,
  windowDays: number,
): Map<string, Map<string, AttributedOrder[]>> => {
  // Wysyłki per klient: [kampania, dzień wysyłki]
  const sends = new Map<string, Array<{ campaignId: string; day: string }>>();
  for (const c of campaigns) {
    for (const r of c.recipients) {
      if (r.status !== 'sent') continue;
      const when = r.sentAt || c.sentAt;
      if (!when) continue;
      const list = sends.get(r.clientId) ?? [];
      list.push({ campaignId: c.id, day: dayOf(when) });
      sends.set(r.clientId, list);
    }
  }

  // Dotychczasowe ręczne decyzje: klucz clientId|orderId → [kampania, status]
  const manual = new Map<string, { campaignId: string; status: AttributionStatus }>();
  for (const c of campaigns) {
    for (const r of c.recipients) {
      for (const o of r.orders ?? []) {
        if (o.status !== 'auto') manual.set(`${r.clientId}|${o.orderId}`, { campaignId: c.id, status: o.status });
      }
    }
  }

  const result = new Map<string, Map<string, AttributedOrder[]>>();
  const push = (campaignId: string, clientId: string, o: AttributedOrder) => {
    const byClient = result.get(campaignId) ?? new Map<string, AttributedOrder[]>();
    byClient.set(clientId, [...(byClient.get(clientId) ?? []), o]);
    result.set(campaignId, byClient);
  };

  for (const [clientId, clientSends] of sends) {
    for (const order of ordersByClient.get(clientId) ?? []) {
      if (!(order.amount > 0) || !order.date) continue;
      const decided = manual.get(`${clientId}|${order.id}`);
      if (decided) {
        push(decided.campaignId, clientId, { orderId: order.id, amount: order.amount, date: order.date, status: decided.status });
        continue;
      }
      const orderMs = new Date(`${order.date}T00:00:00Z`).getTime();
      const candidates = clientSends.filter(s => {
        const sendMs = new Date(`${s.day}T00:00:00Z`).getTime();
        return orderMs >= sendMs && orderMs - sendMs <= windowDays * DAY_MS;
      });
      if (!candidates.length) continue;
      const last = candidates.reduce((a, b) => (b.day > a.day ? b : a));
      push(last.campaignId, clientId, { orderId: order.id, amount: order.amount, date: order.date, status: 'auto' });
    }
  }
  return result;
};

// ─── Wyniki ─────────────────────────────────────────────────────────────────

export type CallOutcome = 'ordered' | 'callback' | 'not_now' | 'no_answer';

export interface ResultsRecipient {
  variant: 'A' | 'B';
  status?: string;
  replied?: boolean;
  unsubscribeRequest?: boolean;
  orders?: AttributedOrder[];
  callOutcome?: CallOutcome | null;
}

export interface CampaignResultsFull {
  repliesA: number;
  repliesB: number;
  unsubscribeRequests: number;
  orders: number;
  orderValueNet: number;
  ordersFromMail: number;
  ordersFromPhone: number;
  byPhone: number;
}

/**
 * Liczniki raportu. Zamówienia `rejected` się nie liczą. Zamówienie odbiorcy,
 * z którym rozmowa zakończyła się „zamówił”, liczy się jako „po telefonie”,
 * pozostałe jako „z maila”. `byPhone` = liczba rozmów „zamówił” (także gdy
 * zamówienia jeszcze nie ma w CRM).
 */
export const computeResults = (recipients: ResultsRecipient[]): CampaignResultsFull => {
  const r: CampaignResultsFull = {
    repliesA: 0, repliesB: 0, unsubscribeRequests: 0,
    orders: 0, orderValueNet: 0, ordersFromMail: 0, ordersFromPhone: 0, byPhone: 0,
  };
  for (const x of recipients) {
    if (x.unsubscribeRequest) r.unsubscribeRequests++;
    else if (x.replied) { if (x.variant === 'B') r.repliesB++; else r.repliesA++; }
    if (x.callOutcome === 'ordered') r.byPhone++;
    const counted = (x.orders ?? []).filter(o => o.status !== 'rejected');
    r.orders += counted.length;
    r.orderValueNet += counted.reduce((s, o) => s + o.amount, 0);
    if (x.callOutcome === 'ordered') r.ordersFromPhone += counted.length;
    else r.ordersFromMail += counted.length;
  }
  r.orderValueNet = Math.round(r.orderValueNet * 100) / 100;
  return r;
};

// ─── Dni robocze ────────────────────────────────────────────────────────────

/** YYYY-MM-DD + n dni roboczych (bez sobót i niedziel; święta nieuwzględnione). */
export const addWorkingDays = (date: string, n: number): string => {
  const d = new Date(`${date}T12:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
};
