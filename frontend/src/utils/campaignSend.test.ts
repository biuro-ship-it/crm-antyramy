import { describe, it, expect } from 'vitest';
import type { CampaignDraft } from '../services/api';
import { contentError, recipientsError, contentFingerprint } from './campaignSend';

const mk = (over: Partial<CampaignDraft> = {}): CampaignDraft => ({
  name: 'Kampania',
  pdfTitle: 'Oferta',
  noProducts: true,
  productIds: [],
  variantA: { subject: 'Temat', content: 'Treść' },
  variantB: null,
  recipients: [],
  heroImageUrl: null,
  ...over,
});

describe('walidacja przed wysyłką', () => {
  it('kampania bez produktów i bez kolażu (sam tekst) nie jest błędem', () => {
    expect(contentError(mk())).toBeNull();
  });

  it('sam kolaż, bez produktów — bez błędu', () => {
    expect(contentError(mk({ heroImageUrl: 'https://crm.antyramy.eu/uploads/kolaz-1.jpg' }))).toBeNull();
  });

  it('pusty temat albo treść', () => {
    expect(contentError(mk({ variantA: { subject: ' ', content: 'x' } }))).toMatch(/temat maila/);
    expect(contentError(mk({ variantA: { subject: 'x', content: '\n ' } }))).toMatch(/treść maila/);
  });

  it('test A/B: temat B wymagany, treść B tylko gdy osobna', () => {
    expect(contentError(mk({ variantB: { subject: '', content: null } }))).toMatch(/temat B/);
    expect(contentError(mk({ variantB: { subject: 'B', content: null } }))).toBeNull();
    expect(contentError(mk({ variantB: { subject: 'B', content: '  ' } }))).toMatch(/treść B/);
  });

  it('odbiorcy', () => {
    expect(recipientsError(0)).toMatch(/odbiorców/);
    expect(recipientsError(3)).toBeNull();
  });
});

describe('odcisk treści (czy test dotyczył aktualnej wersji)', () => {
  const base = contentFingerprint(mk());

  it('ta sama treść = ten sam odcisk', () => {
    expect(contentFingerprint(mk())).toBe(base);
  });

  it('nazwa i odbiorcy nie unieważniają testu', () => {
    expect(contentFingerprint(mk({ name: 'Inna nazwa' }))).toBe(base);
    expect(contentFingerprint(mk({ recipients: [{ clientId: 'c1', variant: 'A' }] }))).toBe(base);
  });

  it('każda zmiana widoczna w mailu unieważnia test', () => {
    const changed: Partial<CampaignDraft>[] = [
      { pdfTitle: 'Inny tytuł' },
      { productIds: ['p1'] },
      { variantA: { subject: 'Temat 2', content: 'Treść' } },
      { variantA: { subject: 'Temat', content: 'Treść 2' } },
      { variantB: { subject: 'B', content: null } },
      { heroImageUrl: 'https://crm.antyramy.eu/uploads/kolaz-1.jpg' },
    ];
    for (const over of changed) expect(contentFingerprint(mk(over))).not.toBe(base);
  });

  it('brak pola kolażu i null to to samo', () => {
    const { heroImageUrl: _omit, ...withoutHero } = mk();
    expect(contentFingerprint(withoutHero)).toBe(base);
  });
});
