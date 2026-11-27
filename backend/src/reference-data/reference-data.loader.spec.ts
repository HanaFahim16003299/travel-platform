import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadReferenceData } from './reference-data.loader.js';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

/** Writes a valid dataset to a temp folder, with optional per-file overrides. */
function dataset(overrides: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'refdata-'));
  dirs.push(dir);
  const files: Record<string, string> = {
    'countries.csv': 'code,name,currency\nEG,Egypt,EGP\nDE,Germany,EUR\n',
    'cities.csv': 'city_id,name,country_code\ncairo,Cairo,EG\nfrankfurt,Frankfurt,DE\n',
    'airports.csv':
      'iata_code,name,city_id,country_code,time_zone\nCAI,Cairo International Airport,cairo,EG,Africa/Cairo\n',
    'attractions.csv': 'attraction_id,name,city_id\natt-1,Giza Pyramids and Sphinx,cairo\n',
    ...overrides,
  };
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

describe('loadReferenceData (the shipped dataset)', () => {
  const data = loadReferenceData();

  it('loads the eight rows of every file', () => {
    expect(data.countries).toHaveLength(8);
    expect(data.cities).toHaveLength(8);
    expect(data.airports).toHaveLength(8);
    expect(data.attractions).toHaveLength(8);
  });

  it('keeps the dataset identifiers and time zones', () => {
    const cairo = data.airports.find((a) => a.iataCode === 'CAI');
    expect(cairo).toMatchObject({ cityKey: 'cairo', countryCode: 'EG', timeZone: 'Africa/Cairo' });
    expect(data.cities.find((c) => c.key === 'new_york')?.countryCode).toBe('US');
    expect(data.attractions.find((a) => a.key === 'att-8')?.name).toBe('Römerberg');
  });
});

describe('loadReferenceData (validation)', () => {
  it('accepts a valid dataset', () => {
    expect(loadReferenceData(dataset()).airports).toHaveLength(1);
  });

  it('rejects a missing file', () => {
    expect(() => loadReferenceData(join(tmpdir(), 'no-such-folder-xyz'))).toThrow(/not found/);
  });

  it('rejects a missing column', () => {
    const dir = dataset({ 'countries.csv': 'code,name\nEG,Egypt\n' });
    expect(() => loadReferenceData(dir)).toThrow(/missing the column "currency"/);
  });

  it('rejects an empty required value', () => {
    const dir = dataset({ 'countries.csv': 'code,name,currency\nEG,Egypt,\n' });
    expect(() => loadReferenceData(dir)).toThrow(/"currency" is empty/);
  });

  it('rejects duplicate keys', () => {
    const dir = dataset({ 'countries.csv': 'code,name,currency\nEG,Egypt,EGP\nEG,Egypt 2,EGP\n' });
    expect(() => loadReferenceData(dir)).toThrow(/duplicate code "EG"/);
  });

  it('rejects a city with an unknown country', () => {
    const dir = dataset({ 'cities.csv': 'city_id,name,country_code\nrome,Rome,IT\n' });
    expect(() => loadReferenceData(dir)).toThrow(/unknown country "IT"/);
  });

  it('rejects an airport with an unknown city', () => {
    const dir = dataset({
      'airports.csv':
        'iata_code,name,city_id,country_code,time_zone\nFCO,Fiumicino,rome,EG,Europe/Rome\n',
    });
    expect(() => loadReferenceData(dir)).toThrow(/unknown city "rome"/);
  });

  it('rejects an invalid time zone', () => {
    const dir = dataset({
      'airports.csv':
        'iata_code,name,city_id,country_code,time_zone\nCAI,Cairo International Airport,cairo,EG,Mars/Olympus\n',
    });
    expect(() => loadReferenceData(dir)).toThrow(/not a valid IANA time zone/);
  });

  it('rejects an attraction with an unknown city', () => {
    const dir = dataset({ 'attractions.csv': 'attraction_id,name,city_id\natt-9,Colosseum,rome\n' });
    expect(() => loadReferenceData(dir)).toThrow(/unknown city "rome"/);
  });
});
