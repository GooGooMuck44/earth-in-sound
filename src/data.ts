export type TrackKind = "global" | "zones" | "place";

export interface ClimatePoint {
  position: number;
  label: string;
  temperature: number;
  rainfall?: number;
  sunshine?: number;
  arctic?: number;
  tropics?: number;
  antarctic?: number;
}

export interface ClimateTrack {
  kind: TrackKind;
  title: string;
  source: string;
  points: ClimatePoint[];
  fromBackup?: boolean;
}

export interface Place {
  slug?: string;
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
}

const siteRoot = import.meta.env.BASE_URL;
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const requestTimeoutMs = 12000;

export const powerParameters = "T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN";
export const powerFirstYear = 2001;

export async function fetchWithTimeout(url: string, timeoutMs = requestTimeoutMs): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function readSavedCopy<T>(key: string): T | null {
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T) : null;
  } catch {
    return null;
  }
}

function keepSavedCopy(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    try {
      Object.keys(localStorage)
        .filter((existingKey) => existingKey.startsWith("earth-in-sound:place:"))
        .forEach((existingKey) => localStorage.removeItem(existingKey));
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      return;
    }
  }
}

async function loadBundledJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetchWithTimeout(`${siteRoot}data/${path}`);
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function loadGlobalTemperature(): Promise<ClimateTrack> {
  type GistempFile = { years: { year: number; anomaly: number }[] };
  let years = (await loadBundledJson<GistempFile>("gistemp.json"))?.years ?? null;
  let fromBackup = false;
  if (years?.length) {
    keepSavedCopy("earth-in-sound:gistemp", years);
  } else {
    years = readSavedCopy<{ year: number; anomaly: number }[]>("earth-in-sound:gistemp");
    fromBackup = true;
  }
  if (!years?.length) throw new Error("GISTEMP data is missing");
  return {
    kind: "global",
    title: `Global temperature, ${years[0].year}–${years[years.length - 1].year}`,
    source: "NASA GISS Surface Temperature Analysis (GISTEMP v4), anomaly vs 1951–1980",
    points: years.map((entry) => ({ position: entry.year, label: String(entry.year), temperature: entry.anomaly })),
    fromBackup,
  };
}

interface ZoneYear {
  year: number;
  global: number;
  arctic: number;
  tropics: number;
  antarctic: number;
}

export async function loadPolesAndTropics(): Promise<ClimateTrack> {
  let years = (await loadBundledJson<{ years: ZoneYear[] }>("zones.json"))?.years ?? null;
  let fromBackup = false;
  if (years?.length) {
    keepSavedCopy("earth-in-sound:zones", years);
  } else {
    years = readSavedCopy<ZoneYear[]>("earth-in-sound:zones");
    fromBackup = true;
  }
  if (!years?.length) throw new Error("Zonal GISTEMP data is missing");
  return {
    kind: "zones",
    title: `Arctic, Tropics and Antarctic, ${years[0].year}–${years[years.length - 1].year}`,
    source: "NASA GISS GISTEMP v4 zonal annual means (64N–90N, 24S–24N, 90S–64S), anomaly vs 1951–1980",
    points: years.map((entry) => ({
      position: entry.year,
      label: String(entry.year),
      temperature: entry.global,
      arctic: entry.arctic,
      tropics: entry.tropics,
      antarctic: entry.antarctic,
    })),
    fromBackup,
  };
}

export function powerUrl(latitude: number, longitude: number, firstYear: number, lastYear: number): string {
  const query = new URLSearchParams({
    parameters: powerParameters,
    community: "AG",
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    start: String(firstYear),
    end: String(lastYear),
    format: "JSON",
  });
  return `https://power.larc.nasa.gov/api/temporal/monthly/point?${query}`;
}

type PowerTable = Record<string, Record<string, number>>;

export function parsePower(table: PowerTable): ClimatePoint[] {
  const temperatures = table.T2M ?? {};
  const monthKeys = Object.keys(temperatures)
    .filter((key) => key.length === 6 && Number(key.slice(4)) >= 1 && Number(key.slice(4)) <= 12)
    .sort();
  const usable = (value: number | undefined) => (value === undefined || value <= -990 ? NaN : value);
  const points: ClimatePoint[] = [];
  for (const key of monthKeys) {
    const temperature = usable(temperatures[key]);
    if (!Number.isFinite(temperature)) continue;
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(4)) - 1;
    points.push({
      position: year + (month + 0.5) / 12,
      label: `${monthNames[month]} ${year}`,
      temperature,
      rainfall: usable(table.PRECTOTCORR?.[key]),
      sunshine: usable(table.ALLSKY_SFC_SW_DWN?.[key]),
    });
  }
  return points;
}

async function fetchPowerLive(place: Place): Promise<PowerTable> {
  const currentYear = new Date().getFullYear();
  for (const lastYear of [currentYear - 1, currentYear - 2]) {
    const response = await fetchWithTimeout(powerUrl(place.latitude, place.longitude, powerFirstYear, lastYear), 20000);
    if (response.ok) return (await response.json()).properties.parameter;
  }
  throw new Error("NASA POWER did not return data");
}

const placeKey = (place: Place) => `earth-in-sound:place:${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}`;

function distanceKm(from: Place, to: Place) {
  const radians = Math.PI / 180;
  const latitudeGap = (to.latitude - from.latitude) * radians;
  const longitudeGap = (to.longitude - from.longitude) * radians;
  const arc =
    Math.sin(latitudeGap / 2) ** 2 +
    Math.cos(from.latitude * radians) * Math.cos(to.latitude * radians) * Math.sin(longitudeGap / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(arc));
}

export function nearestExample(place: Place, examples: Place[]): Place {
  return examples.reduce((closest, candidate) =>
    distanceKm(place, candidate) < distanceKm(place, closest) ? candidate : closest,
  );
}

export async function loadPlace(place: Place, examples: Place[] = []): Promise<ClimateTrack> {
  let table: PowerTable | null = null;
  let backupNote = "";
  let shownPlace = place;
  try {
    table = await fetchPowerLive(place);
    keepSavedCopy(placeKey(place), table);
  } catch (liveError) {
    table = readSavedCopy<PowerTable>(placeKey(place));
    if (table) backupNote = " (saved on this device)";
    if (!table && place.slug) {
      table = (await loadBundledJson<{ parameter: PowerTable }>(`places/${place.slug}.json`))?.parameter ?? null;
      if (table) backupNote = " (saved copy)";
    }
    if (!table && examples.length) {
      const fallback = nearestExample(place, examples);
      table = (await loadBundledJson<{ parameter: PowerTable }>(`places/${fallback.slug}.json`))?.parameter ?? null;
      if (table) {
        shownPlace = fallback;
        backupNote = ` (NASA POWER was unreachable, so this is the nearest saved city, ${fallback.name})`;
      }
    }
    if (!table) throw liveError;
  }
  const points = parsePower(table);
  if (points.length < 24) throw new Error("Not enough NASA POWER data for this place");
  const displayName = shownPlace.country ? `${shownPlace.name}, ${shownPlace.country}` : shownPlace.name;
  return {
    kind: "place",
    title: `${displayName}: ${Math.floor(points[0].position)}–${Math.floor(points[points.length - 1].position)}`,
    source: `NASA POWER monthly T2M, PRECTOTCORR, ALLSKY_SFC_SW_DWN at ${shownPlace.latitude.toFixed(2)}, ${shownPlace.longitude.toFixed(2)}${backupNote}`,
    points,
    fromBackup: Boolean(backupNote),
  };
}

export async function searchPlaces(name: string): Promise<Place[]> {
  const response = await fetchWithTimeout(
    `https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&format=json&name=${encodeURIComponent(name)}`,
  );
  if (!response.ok) throw new Error(`Search failed (${response.status})`);
  const body = await response.json();
  return (body.results ?? []).map((result: { name: string; country: string; latitude: number; longitude: number }) => ({
    name: result.name,
    country: result.country,
    latitude: result.latitude,
    longitude: result.longitude,
  }));
}

export function trendPerYear(xValues: number[], yValues: number[]): number {
  const count = xValues.length;
  const meanX = xValues.reduce((sum, value) => sum + value, 0) / count;
  const meanY = yValues.reduce((sum, value) => sum + value, 0) / count;
  let covariance = 0;
  let spread = 0;
  for (let i = 0; i < count; i++) {
    covariance += (xValues[i] - meanX) * (yValues[i] - meanY);
    spread += (xValues[i] - meanX) ** 2;
  }
  return spread ? covariance / spread : 0;
}

export function yearlyAverages(points: ClimatePoint[]): { year: number; temperature: number }[] {
  const monthsByYear = new Map<number, number[]>();
  for (const point of points) {
    const year = Math.floor(point.position);
    if (!monthsByYear.has(year)) monthsByYear.set(year, []);
    monthsByYear.get(year)!.push(point.temperature);
  }
  return [...monthsByYear]
    .filter(([, months]) => months.length === 12)
    .map(([year, months]) => ({ year, temperature: months.reduce((sum, value) => sum + value, 0) / 12 }));
}
