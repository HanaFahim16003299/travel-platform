import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.util.js';

describe('parseCsv', () => {
  it('maps each row to the header names', () => {
    expect(parseCsv('code,name\nEG,Egypt\nAE,United Arab Emirates\n')).toEqual([
      { code: 'EG', name: 'Egypt' },
      { code: 'AE', name: 'United Arab Emirates' },
    ]);
  });

  it('handles a BOM, Windows line endings and blank lines', () => {
    const rows = parseCsv('﻿code,name\r\nEG,Egypt\r\n\r\nFR,France\r\n');
    expect(rows).toEqual([
      { code: 'EG', name: 'Egypt' },
      { code: 'FR', name: 'France' },
    ]);
  });

  it('handles quoted fields with commas and doubled quotes', () => {
    const rows = parseCsv('id,name\n1,"Hotel, The ""Best"""\n');
    expect(rows).toEqual([{ id: '1', name: 'Hotel, The "Best"' }]);
  });

  it('trims spaces and fills missing trailing cells with an empty string', () => {
    expect(parseCsv('a,b\n x , y \nonly\n')).toEqual([
      { a: 'x', b: 'y' },
      { a: 'only', b: '' },
    ]);
  });

  it('returns an empty list for empty input or a header only', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('code,name\n')).toEqual([]);
  });

  it('keeps non-ASCII characters', () => {
    expect(parseCsv('id,name\natt-8,Römerberg\n')[0].name).toBe('Römerberg');
  });
});
