import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getGmailClient } from './gmail';

describe('getGmailClient — smoke test konfiguracji', () => {
  const saved: Partial<Record<string, string>> = {};
  const vars = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'] as const;

  beforeEach(() => {
    vars.forEach(k => { saved[k] = process.env[k]; });
  });

  afterEach(() => {
    vars.forEach(k => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });

  it('rzuca błąd gdy brakuje GMAIL_CLIENT_ID', () => {
    delete process.env.GMAIL_CLIENT_ID;
    process.env.GMAIL_CLIENT_SECRET = 'secret';
    process.env.GMAIL_REFRESH_TOKEN = 'token';
    assert.throws(() => getGmailClient(), /Brak konfiguracji Gmail API w \.env/);
  });

  it('rzuca błąd gdy brakuje GMAIL_CLIENT_SECRET', () => {
    process.env.GMAIL_CLIENT_ID = 'id';
    delete process.env.GMAIL_CLIENT_SECRET;
    process.env.GMAIL_REFRESH_TOKEN = 'token';
    assert.throws(() => getGmailClient(), /Brak konfiguracji Gmail API w \.env/);
  });

  it('rzuca błąd gdy brakuje GMAIL_REFRESH_TOKEN', () => {
    process.env.GMAIL_CLIENT_ID = 'id';
    process.env.GMAIL_CLIENT_SECRET = 'secret';
    delete process.env.GMAIL_REFRESH_TOKEN;
    assert.throws(() => getGmailClient(), /Brak konfiguracji Gmail API w \.env/);
  });

  it('zwraca klienta gdy wszystkie zmienne są ustawione', () => {
    process.env.GMAIL_CLIENT_ID = 'test-client-id';
    process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
    process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';
    assert.doesNotThrow(() => getGmailClient());
  });
});
