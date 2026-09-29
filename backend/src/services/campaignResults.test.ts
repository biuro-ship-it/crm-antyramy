import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGmailMessage, emailFromHeader, extractReplyText, isUnsubscribeReply, findReply,
  attributeOrders, computeResults, addWorkingDays, ThreadMessage, AttributionCampaign, ClientOrder,
} from './campaignResults';

const b64 = (s: string) => Buffer.from(s, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

// ─── Gmail ───

test('parseGmailMessage: nadawca, data, text/plain z multipart', () => {
  const m = parseGmailMessage({
    id: 'm1',
    internalDate: String(Date.parse('2026-09-29T10:00:00Z')),
    payload: {
      mimeType: 'multipart/alternative',
      headers: [{ name: 'From', value: 'Jan Kowalski <Jan@Foto.PL>' }],
      parts: [
        { mimeType: 'text/plain', body: { data: b64('Poproszę 10 sztuk — żółte') } },
        { mimeType: 'text/html', body: { data: b64('<p>x</p>') } },
      ],
    },
  });
  assert.equal(m.from, 'jan@foto.pl');
  assert.equal(m.date, '2026-09-29T10:00:00.000Z');
  assert.equal(m.text, 'Poproszę 10 sztuk — żółte');
});

test('parseGmailMessage: sam HTML → tekst bez tagów i bez cytatu', () => {
  const m = parseGmailMessage({
    payload: {
      mimeType: 'text/html',
      headers: [{ name: 'From', value: 'a@b.pl' }],
      body: { data: b64('<div>Tak, dzwońcie</div><blockquote>stara treść</blockquote>') },
    },
  });
  assert.equal(m.text.trim(), 'Tak, dzwońcie');
});

test('emailFromHeader', () => {
  assert.equal(emailFromHeader('"Foto" <x@y.pl>'), 'x@y.pl');
  assert.equal(emailFromHeader(' X@Y.PL '), 'x@y.pl');
});

// ─── Odpowiedzi ───

test('extractReplyText: ucina cytat Gmaila PL/EN, Outlooka i podpis', () => {
  assert.equal(extractReplyText('NIE\n\nW dniu pon., 28 wrz 2026 o 10:00 Antyramy <biuro@antyramy.eu> napisał(a):\n> oferta'), 'NIE');
  assert.equal(extractReplyText('Interested\nOn Mon, Sep 28, 2026 at 10:00 AM Antyramy wrote:\n> offer'), 'Interested');
  assert.equal(extractReplyText('Proszę o cennik\n\n-----Original Message-----\nFrom: biuro'), 'Proszę o cennik');
  assert.equal(extractReplyText('Ok\n-- \nJan Kowalski\ntel. 600'), 'Ok');
  assert.equal(extractReplyText('Tak\n> cytat\n> cytat'), 'Tak');
  assert.equal(extractReplyText('nie\n\nWysłane z mojego iPhone'), 'nie');
});

test('isUnsubscribeReply: NIE vs zwykła odpowiedź', () => {
  for (const t of ['NIE', 'nie', 'Nie.', 'NIE!', ' nie ', 'NIE dziękuję', 'Nie, dziękujemy']) {
    assert.equal(isUnsubscribeReply(t), true, t);
  }
  for (const t of ['', 'Nie mam teraz czasu, ale proszę o kontakt w listopadzie', 'Niestety brak', 'Tak, poproszę', 'Nieźle!']) {
    assert.equal(isUnsubscribeReply(t), false, t);
  }
});

const msg = (from: string, date: string, text = 'x'): ThreadMessage => ({ id: date, from, date, text });

test('findReply: pierwsza od odbiorcy po wysyłce, bez naszych i mailer-daemon', () => {
  const thread = [
    msg('biuro@antyramy.eu', '2026-09-28T10:00:00Z'),
    msg('mailer-daemon@googlemail.com', '2026-09-28T10:01:00Z'),
    msg('jan@foto.pl', '2026-09-29T08:00:00Z', 'Tak'),
    msg('jan@foto.pl', '2026-09-30T08:00:00Z', 'Jeszcze raz'),
  ];
  assert.equal(findReply(thread, 'Jan@Foto.pl', '2026-09-28T10:00:00Z')?.text, 'Tak');
  assert.equal(findReply(thread, 'inny@x.pl', '2026-09-28T10:00:00Z'), null);
  assert.equal(findReply([msg('jan@foto.pl', '2026-09-27T08:00:00Z')], 'jan@foto.pl', '2026-09-28T10:00:00Z'), null);
});

// ─── Zamówienia ───

const camp = (id: string, sentAt: string, clientIds: string[], extra: Partial<AttributionCampaign['recipients'][0]> = {}): AttributionCampaign => ({
  id, sentAt, recipients: clientIds.map(clientId => ({ clientId, status: 'sent', sentAt, ...extra })),
});

test('attributeOrders: okno N dni, ostatnia kampania przed zamówieniem, każde raz', () => {
  const campaigns = [camp('k1', '2026-09-01T10:00:00Z', ['c1', 'c2']), camp('k2', '2026-09-08T10:00:00Z', ['c1'])];
  const orders = new Map<string, ClientOrder[]>([
    ['c1', [
      { id: 'o-before', amount: 100, date: '2026-08-30' },   // przed kampanią
      { id: 'o-k1', amount: 200, date: '2026-09-05' },       // tylko okno k1
      { id: 'o-both', amount: 300, date: '2026-09-10' },     // okno k1 i k2 → k2
      { id: 'o-late', amount: 400, date: '2026-09-30' },     // poza oknem 14 dni
      { id: 'o-zero', amount: 0, date: '2026-09-09' },       // bez kwoty
    ]],
    ['c2', [{ id: 'o-c2', amount: 50, date: '2026-09-15' }]], // dokładnie 14 dni → liczy się
  ]);
  const out = attributeOrders(campaigns, orders, 14);
  assert.deepEqual(out.get('k1')?.get('c1')?.map(o => o.orderId), ['o-k1']);
  assert.deepEqual(out.get('k2')?.get('c1')?.map(o => o.orderId), ['o-both']);
  assert.deepEqual(out.get('k1')?.get('c2')?.map(o => [o.orderId, o.status]), [['o-c2', 'auto']]);
});

test('attributeOrders: ręczne decyzje zostają, znikają razem z zamówieniem; nieudana wysyłka się nie liczy', () => {
  const campaigns = [
    camp('k1', '2026-09-01T10:00:00Z', ['c1'], {
      orders: [
        { orderId: 'o1', amount: 100, date: '2026-09-03', status: 'rejected' },
        { orderId: 'o-deleted', amount: 10, date: '2026-09-03', status: 'confirmed' },
      ],
    }),
    camp('k2', '2026-09-02T10:00:00Z', ['c3'], { status: 'failed' }),
  ];
  const orders = new Map<string, ClientOrder[]>([
    ['c1', [{ id: 'o1', amount: 100, date: '2026-09-03' }]],
    ['c3', [{ id: 'o3', amount: 70, date: '2026-09-04' }]],
  ]);
  const out = attributeOrders(campaigns, orders, 14);
  assert.deepEqual(out.get('k1')?.get('c1'), [{ orderId: 'o1', amount: 100, date: '2026-09-03', status: 'rejected' }]);
  assert.equal(out.get('k2'), undefined);
});

// ─── Wyniki ───

test('computeResults: odpowiedzi A/B bez NIE, zamówienia bez odrzuconych, mail vs telefon', () => {
  const r = computeResults([
    { variant: 'A', replied: true },
    { variant: 'B', replied: true },
    { variant: 'B', replied: true, unsubscribeRequest: true },
    { variant: 'A', orders: [{ orderId: '1', amount: 100.1, date: '', status: 'auto' }, { orderId: '2', amount: 50, date: '', status: 'rejected' }] },
    { variant: 'A', callOutcome: 'ordered', orders: [{ orderId: '3', amount: 200.2, date: '', status: 'confirmed' }] },
    { variant: 'B', callOutcome: 'ordered' },
  ]);
  assert.deepEqual(r, {
    repliesA: 1, repliesB: 1, unsubscribeRequests: 1,
    orders: 2, orderValueNet: 300.3, ordersFromMail: 1, ordersFromPhone: 1, byPhone: 2,
  });
});

test('addWorkingDays: pomija weekend', () => {
  assert.equal(addWorkingDays('2026-10-02', 2), '2026-10-06'); // piątek → wtorek
  assert.equal(addWorkingDays('2026-09-29', 2), '2026-10-01'); // wtorek → czwartek
  assert.equal(addWorkingDays('2026-10-03', 1), '2026-10-05'); // sobota → poniedziałek
});
