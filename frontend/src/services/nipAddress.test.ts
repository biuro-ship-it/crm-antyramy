import { describe, it, expect } from 'vitest';
import { parseNipAddress } from './api';

// Biała lista VAT zwraca adres jednym stringiem, w różnych kształtach.
// Ta funkcja rozbija go na pola formularza klienta, więc błąd tutaj oznacza
// ręczne poprawianie adresu przy każdym pobraniu danych po NIP.
describe('parseNipAddress', () => {
  it('rozbija typowy adres z numerem budynku', () => {
    expect(parseNipAddress('ULICA DŁUGA 74, 03-301 WARSZAWA')).toEqual({
      province: '', zipCode: '03-301', city: 'WARSZAWA', street: 'ULICA DŁUGA', number: '74',
    });
  });

  it('obsługuje numer z literą i numerem lokalu', () => {
    expect(parseNipAddress('KWIATOWA 12A/3, 61-001 POZNAŃ')).toMatchObject({
      street: 'KWIATOWA', number: '12A/3', zipCode: '61-001', city: 'POZNAŃ',
    });
  });

  it('radzi sobie z adresem bez przecinka', () => {
    const a = parseNipAddress('POLNA 5 30-001 KRAKÓW');
    expect(a.zipCode).toBe('30-001');
    expect(a.city).toBe('KRAKÓW');
  });

  it('zachowuje wieloczłonową ulicę przed kodem pocztowym', () => {
    expect(parseNipAddress('AL. JANA PAWŁA II 22, 00-133 WARSZAWA')).toMatchObject({
      street: 'AL. JANA PAWŁA II', number: '22', city: 'WARSZAWA',
    });
  });

  it('nie gubi ulicy, gdy brakuje numeru budynku', () => {
    const a = parseNipAddress('RYNEK, 50-101 WROCŁAW');
    expect(a.street).toBe('RYNEK');
    expect(a.number).toBe('');
    expect(a.city).toBe('WROCŁAW');
  });

  it('dla pustego wejścia zwraca same puste pola, bez wyjątku', () => {
    expect(parseNipAddress('')).toEqual({
      province: '', zipCode: '', city: '', street: '', number: '',
    });
  });

  it('województwa nigdy nie wypełnia — MF go nie podaje', () => {
    expect(parseNipAddress('ULICA 1, 00-001 WARSZAWA').province).toBe('');
  });
});
