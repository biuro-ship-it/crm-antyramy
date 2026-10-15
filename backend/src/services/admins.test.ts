import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseEmailList, isAdminEmail } from './admins';

describe('administratorzy — ADMIN_EMAILS', () => {
  it('lista z .env: przecinki, spacje, wielkość liter', () => {
    assert.deepEqual(parseEmailList(' Biuro@Antyramy.eu , x@y.pl,,', 'd@d.pl'), ['biuro@antyramy.eu', 'x@y.pl']);
  });
  it('brak lub pusta zmienna → lista domyślna', () => {
    assert.deepEqual(parseEmailList(undefined, 'biuro@antyramy.eu'), ['biuro@antyramy.eu']);
    assert.deepEqual(parseEmailList('   ', 'biuro@antyramy.eu'), ['biuro@antyramy.eu']);
  });
  it('sprawdzenie konta bez względu na wielkość liter', () => {
    const admins = ['biuro@antyramy.eu'];
    assert.equal(isAdminEmail('BIURO@antyramy.eu', admins), true);
    assert.equal(isAdminEmail('krzysiekgodek@gmail.com', admins), false);
    assert.equal(isAdminEmail(undefined, admins), false);
  });
});
