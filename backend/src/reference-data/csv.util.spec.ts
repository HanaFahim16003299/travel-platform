import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.util.js';

// Tests written by Mohamed Hesham for GEN-12 (reference data seeding).
describe('parseCsv', () => {
  it('turns each row into an object keyed by the header', () => {
    expect(parseCsv('code,name\nEG,Egypt\nDE,Germany')).toEqual([
      { code: 'EG', name: 'Egypt' },
      { code: 'DE', name: 'Germany' },
    ]);
  });

  it('accepts CRLF line endings and a UTF-8 BOM', () => {
    expect(parseCsv('﻿code,name\r\nEG,Egypt\r\n')).toEqual([
      { code: 'EG', name: 'Egypt' },
    ]);
  });

  it('keeps commas and doubled quotes inside quoted fields', () => {
    expect(parseCsv('name\n"Giza, Egypt"\n"The ""Big"" Ben"')).toEqual([
      { name: 'Giza, Egypt' },
      { name: 'The "Big" Ben' },
    ]);
  });

  it('skips blank lines and trims cells', () => {
    expect(parseCsv('code,name\n\n EG , Egypt \n\n')).toEqual([
      { code: 'EG', name: 'Egypt' },
    ]);
  });

  it('returns an empty list for empty input or a header only', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('code,name\n')).toEqual([]);
  });
});
