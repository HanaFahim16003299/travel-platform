import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadReferenceData,
  referenceDataDir,
} from './reference-data.loader.js';

// Tests written by Mohamed Hesham for GEN-12 (reference data seeding).
const VALID = {
  'countries.csv': 'code,name,currency\nEG,Egypt,EGP\nDE,Germany,EUR',
  'cities.csv':
    'city_id,name,country_code\ncairo,Cairo,EG\nfrankfurt,Frankfurt,DE',
  'airports.csv':
    'iata_code,name,city_id,country_code,time_zone\nCAI,Cairo International Airport,cairo,EG,Africa/Cairo',
  'attractions.csv': 'attraction_id,name,city_id\natt-1,Giza Pyramids,cairo',
};

function datasetDir(
  overrides: Partial<Record<keyof typeof VALID, string>> = {},
): string {
  const dir = mkdtempSync(join(tmpdir(), 'reference-data-'));
  const files = { ...VALID, ...overrides };
  for (const [name, text] of Object.entries(files))
    writeFileSync(join(dir, name), text);
  return dir;
}

describe('loadReferenceData', () => {
  it('loads the official datasets shipped with the project', () => {
    const data = loadReferenceData(referenceDataDir());

    expect(data.countries).toHaveLength(8);
    expect(data.cities).toHaveLength(8);
    expect(data.airports).toHaveLength(8);
    expect(data.attractions).toHaveLength(8);
  });

  it('upper-cases country codes, IATA codes and currencies', () => {
    const dir = datasetDir({
      'countries.csv': 'code,name,currency\neg,Egypt,egp',
      'cities.csv': 'city_id,name,country_code\ncairo,Cairo,eg',
      'airports.csv':
        'iata_code,name,city_id,country_code,time_zone\ncai,Cairo International,cairo,eg,Africa/Cairo',
    });

    const data = loadReferenceData(dir);

    expect(data.countries[0]).toEqual({
      code: 'EG',
      name: 'Egypt',
      currency: 'EGP',
    });
    expect(data.airports[0].iataCode).toBe('CAI');
    expect(data.airports[0].countryCode).toBe('EG');
  });

  describe('rejects bad data with a clear message', () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'reference-data-empty-'));
      mkdirSync(dir, { recursive: true });
    });

    it('a missing file', () => {
      expect(() => loadReferenceData(dir)).toThrow(/countries\.csv/);
    });

    it('a missing column', () => {
      const bad = datasetDir({ 'countries.csv': 'code,name\nEG,Egypt' });
      expect(() => loadReferenceData(bad)).toThrow(
        'missing the column "currency"',
      );
    });

    it('an empty required value', () => {
      const bad = datasetDir({
        'countries.csv': 'code,name,currency\nEG,,EGP',
      });
      expect(() => loadReferenceData(bad)).toThrow('"name" is empty');
    });

    it('a duplicate key', () => {
      const bad = datasetDir({
        'countries.csv': 'code,name,currency\nEG,Egypt,EGP\nEG,Egypt again,EGP',
      });
      expect(() => loadReferenceData(bad)).toThrow('duplicate code "EG"');
    });

    it('a city that uses an unknown country', () => {
      const bad = datasetDir({
        'cities.csv': 'city_id,name,country_code\ncairo,Cairo,XX',
      });
      expect(() => loadReferenceData(bad)).toThrow('unknown country "XX"');
    });

    it('an airport that uses an unknown city', () => {
      const bad = datasetDir({
        'airports.csv':
          'iata_code,name,city_id,country_code,time_zone\nCAI,Cairo International,nowhere,EG,Africa/Cairo',
      });
      expect(() => loadReferenceData(bad)).toThrow('unknown city "nowhere"');
    });

    it('an airport with an invalid time zone', () => {
      const bad = datasetDir({
        'airports.csv':
          'iata_code,name,city_id,country_code,time_zone\nCAI,Cairo International,cairo,EG,Mars/Base',
      });
      expect(() => loadReferenceData(bad)).toThrow(
        'not a valid IANA time zone',
      );
    });

    it('an attraction that uses an unknown city', () => {
      const bad = datasetDir({
        'attractions.csv':
          'attraction_id,name,city_id\natt-1,Giza Pyramids,nowhere',
      });
      expect(() => loadReferenceData(bad)).toThrow('unknown city "nowhere"');
    });
  });
});
