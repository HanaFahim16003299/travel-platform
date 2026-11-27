import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from './csv.util.js';

export interface CountryRow {
  code: string;
  name: string;
  currency: string;
}
export interface CityRow {
  key: string;
  name: string;
  countryCode: string;
}
export interface AirportRow {
  iataCode: string;
  name: string;
  cityKey: string;
  countryCode: string;
  timeZone: string;
}
export interface AttractionRow {
  key: string;
  name: string;
  cityKey: string;
}
export interface ReferenceDataset {
  countries: CountryRow[];
  cities: CityRow[];
  airports: AirportRow[];
  attractions: AttractionRow[];
}

/** Folder holding Countries/Cities/Airports/Attractions .csv. Override with REFERENCE_DATA_DIR. */
export function referenceDataDir(): string {
  return process.env.REFERENCE_DATA_DIR ?? join(process.cwd(), 'data', 'reference');
}

function readCsv(dir: string, file: string, required: string[]): Record<string, string>[] {
  let text: string;
  try {
    text = readFileSync(join(dir, file), 'utf8');
  } catch {
    throw new Error(`Reference data file not found: ${join(dir, file)}`);
  }
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error(`${file} has no data rows`);
  for (const column of required) {
    if (!(column in rows[0])) throw new Error(`${file} is missing the column "${column}"`);
  }
  rows.forEach((row, index) => {
    for (const column of required) {
      if (!row[column]) throw new Error(`${file} row ${index + 2}: "${column}" is empty`);
    }
  });
  return rows;
}

function assertUnique(file: string, label: string, values: string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`${file}: duplicate ${label} "${value}"`);
    seen.add(value);
  }
}

function assertTimeZone(file: string, zone: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
  } catch {
    throw new Error(`${file}: "${zone}" is not a valid IANA time zone`);
  }
}

/**
 * Reads and validates the four reference datasets (GEN-12).
 * Throws a descriptive Error for a missing file or column, an empty required
 * value, a duplicate key, an unknown country or city, or an invalid time zone.
 */
export function loadReferenceData(dir: string = referenceDataDir()): ReferenceDataset {
  const countries: CountryRow[] = readCsv(dir, 'countries.csv', ['code', 'name', 'currency']).map(
    (r) => ({ code: r.code.toUpperCase(), name: r.name, currency: r.currency.toUpperCase() }),
  );
  const cities: CityRow[] = readCsv(dir, 'cities.csv', ['city_id', 'name', 'country_code']).map(
    (r) => ({ key: r.city_id, name: r.name, countryCode: r.country_code.toUpperCase() }),
  );
  const airports: AirportRow[] = readCsv(dir, 'airports.csv', [
    'iata_code',
    'name',
    'city_id',
    'country_code',
    'time_zone',
  ]).map((r) => ({
    iataCode: r.iata_code.toUpperCase(),
    name: r.name,
    cityKey: r.city_id,
    countryCode: r.country_code.toUpperCase(),
    timeZone: r.time_zone,
  }));
  const attractions: AttractionRow[] = readCsv(dir, 'attractions.csv', [
    'attraction_id',
    'name',
    'city_id',
  ]).map((r) => ({ key: r.attraction_id, name: r.name, cityKey: r.city_id }));

  assertUnique('countries.csv', 'code', countries.map((c) => c.code));
  assertUnique('cities.csv', 'city_id', cities.map((c) => c.key));
  assertUnique('airports.csv', 'iata_code', airports.map((a) => a.iataCode));
  assertUnique('attractions.csv', 'attraction_id', attractions.map((a) => a.key));

  const countryCodes = new Set(countries.map((c) => c.code));
  const cityKeys = new Set(cities.map((c) => c.key));
  for (const city of cities) {
    if (!countryCodes.has(city.countryCode))
      throw new Error(`cities.csv: city "${city.key}" uses unknown country "${city.countryCode}"`);
  }
  for (const airport of airports) {
    if (!cityKeys.has(airport.cityKey))
      throw new Error(`airports.csv: airport "${airport.iataCode}" uses unknown city "${airport.cityKey}"`);
    if (!countryCodes.has(airport.countryCode))
      throw new Error(
        `airports.csv: airport "${airport.iataCode}" uses unknown country "${airport.countryCode}"`,
      );
    assertTimeZone('airports.csv', airport.timeZone);
  }
  for (const attraction of attractions) {
    if (!cityKeys.has(attraction.cityKey))
      throw new Error(
        `attractions.csv: attraction "${attraction.key}" uses unknown city "${attraction.cityKey}"`,
      );
  }

  return { countries, cities, airports, attractions };
}
