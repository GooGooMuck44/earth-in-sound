// Reject malformed downloads before they replace the offline NASA records.
export const powerUnits = { T2M: 'C', PRECTOTCORR: 'mm/day', ALLSKY_SFC_SW_DWN: 'MJ/m^2/day' };
export const usable = (value) => typeof value === 'number' && Number.isFinite(value) && value > -990;
export function validateYears(years, fields) {
  if (!years.length) throw new Error('No complete annual NASA records');
  let previous = 0;
  for (const entry of years) {
    if (!Number.isInteger(entry.year) || entry.year < 1880 || entry.year <= previous ||
        fields.some((field) => !usable(entry[field]))) throw new Error('Invalid or unordered annual NASA record');
    previous = entry.year;
  }
  return years;
}
export function validatePower(body) {
  const table = body?.properties?.parameter;
  for (const [name, unit] of Object.entries(powerUnits)) {
    if (body?.parameters?.[name]?.units !== unit) throw new Error('Unexpected POWER units for ' + name);
    if (!table?.[name] || typeof table[name] !== 'object') throw new Error('Missing POWER parameter ' + name);
  }
  const months = Object.keys(table.T2M).filter((key) => /^\d{4}(0[1-9]|1[0-2])$/.test(key));
  const complete = months.filter((key) => Object.keys(powerUnits).every((name) => usable(table[name][key])));
  if (complete.length < 24) throw new Error('POWER needs at least 24 complete monthly records');
  return table;
}
