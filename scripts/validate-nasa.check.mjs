import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateYears, validatePower, powerUnits } from './validate-nasa.mjs';

const powerBody = () => {
  const parameter = Object.fromEntries(Object.keys(powerUnits).map((name) => [name, {}]));
  for (let year = 2023; year <= 2024; year++) {
    for (let month = 1; month <= 12; month++) {
      const key = `${year}${String(month).padStart(2, '0')}`;
      for (const name of Object.keys(powerUnits)) parameter[name][key] = name === 'T2M' ? -5 : 3;
    }
  }
  return { properties: { parameter }, parameters: Object.fromEntries(Object.entries(powerUnits).map(([name, units]) => [name, { units }])) };
};

test('annual records accept valid negative anomalies and reject empty, duplicate or nonnumeric records', () => {
  assert.doesNotThrow(() => validateYears([{ year: 1880, anomaly: -0.2 }], ['anomaly']));
  for (const years of [[], [{ year: 1880, anomaly: null }], [{ year: 1880, anomaly: -999 }], [{ year: 1880, anomaly: 0 }, { year: 1880, anomaly: 1 }]]) {
    assert.throws(() => validateYears(years, ['anomaly']));
  }
});

test('POWER accepts 24 complete months and preserves negative temperatures', () => {
  const body = powerBody();
  assert.equal(validatePower(body), body.properties.parameter);
});

test('POWER rejects changed units, missing parameters, fill values, and annual summaries used as months', () => {
  let body = powerBody();
  body.parameters.ALLSKY_SFC_SW_DWN.units = 'kWh/m^2/day';
  assert.throws(() => validatePower(body), /units/);
  body = powerBody();
  delete body.properties.parameter.PRECTOTCORR;
  assert.throws(() => validatePower(body), /parameter/);
  for (const bad of [-999, null, '3', Infinity]) {
    body = powerBody();
    body.properties.parameter.T2M['202301'] = bad;
    body.properties.parameter.T2M['202313'] = 20;
    assert.throws(() => validatePower(body), /24 complete/);
  }
});

test('committed NASA climate files have usable annual and monthly observations with provenance', async () => {
  const load = async (path) => JSON.parse(await readFile(new URL('../public/data/' + path, import.meta.url), 'utf8'));
  for (const [path, fields] of [['gistemp.json', ['anomaly']], ['zones.json', ['global', 'arctic', 'tropics', 'antarctic']]]) {
    const file = await load(path);
    validateYears(file.years, fields);
    assert.ok(file.source.startsWith('https://data.giss.nasa.gov/'));
    assert.ok(Number.isFinite(Date.parse(file.fetched)));
  }
  const places = JSON.parse(await readFile(new URL('../src/presets.json', import.meta.url), 'utf8'));
  assert.equal(new Set(places.map((place) => place.slug)).size, places.length, "Preset slugs must be unique");
  for (const place of places) {
    const file = await load('places/' + place.slug + '.json');
    validatePower({ properties: { parameter: file.parameter }, parameters: file.parameters });
    assert.deepEqual(file.place, place);
    assert.ok(file.source.startsWith('https://power.larc.nasa.gov/'));
    assert.ok(Number.isFinite(Date.parse(file.fetched)));
  }
});
