import type { ScanDetails } from "./scan";

export type TrackKind = "global" | "zones" | "place" | "compare" | "events" | "scan";

export type DataStatus = "live" | "saved" | "browser";

export interface TrackMeta {
  dataset: string;
  link: string;
  units: string;
  coverage: string;
  retrieved?: string;
  baseline?: string;
  status: DataStatus;
  limit: string;
  request?: string;
}

export interface ClimatePoint {
  position: number;
  label: string;
  key?: string;
  temperature: number;
  other?: number;
  rainfall?: number;
  sunshine?: number;
  arctic?: number;
  tropics?: number;
  antarctic?: number;
  happenings?: EventGroup[];
  headlines?: string[];
  bands?: number[];
  bandDetail?: number[];
  longitude?: number;
}

export interface EventGroup {
  category: string;
  count: number;
  longitude: number;
}

export interface ClimateTrack {
  kind: TrackKind;
  title: string;
  source: string;
  points: ClimatePoint[];
  fromBackup?: boolean;
  notice?: string;
  eventTotals?: Record<string, number>;
  scan?: ScanDetails;
  meta: TrackMeta;
  place?: Place;
  places?: [Place, Place];
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
const waitMs = 12000;

export const powerParameters = "T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN";
export const powerFirstYear = 2001;

export async function fetchTimed(url: string, timeoutMs = waitMs): Promise<Response> {
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

export const placeName = (place: Place) => (place.country ? `${place.name}, ${place.country}` : place.name);
const day = (stamp?: string) => (stamp && Number.isFinite(Date.parse(stamp)) ? stamp.slice(0, 10) : undefined);
const today = () => new Date().toISOString().slice(0, 10);

async function loadSaved<T>(path: string): Promise<T | null> {
  try {
    const response = await fetchTimed(`${siteRoot}data/${path}`);
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function loadGlobal(): Promise<ClimateTrack> {
  type GistempFile = { years: { year: number; anomaly: number }[]; fetched?: string; source?: string };
  const file = await loadSaved<GistempFile>("gistemp.json");
  let years = file?.years ?? null;
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
    title: "Global temperature",
    source: "NASA GISTEMP v4 · vs 1951–1980",
    points: years.map((entry) => ({ position: entry.year, label: String(entry.year), key: String(entry.year), temperature: entry.anomaly })),
    fromBackup,
    meta: {
      dataset: "NASA GISS Surface Temperature Analysis (GISTEMP v4), global annual mean",
      link: "https://data.giss.nasa.gov/gistemp/",
      request: file?.source,
      units: "°C anomaly",
      baseline: "1951–1980 average",
      coverage: `${years[0].year}–${years[years.length - 1].year}, yearly`,
      retrieved: fromBackup ? undefined : day(file?.fetched),
      status: fromBackup ? "browser" : "saved",
      limit: "Anomalies show change from a baseline, not actual temperatures. Early years have wider uncertainty.",
    },
  };
}

interface ZoneYear {
  year: number;
  global: number;
  arctic: number;
  tropics: number;
  antarctic: number;
}

export async function loadZones(): Promise<ClimateTrack> {
  const file = await loadSaved<{ years: ZoneYear[]; fetched?: string; source?: string }>("zones.json");
  let years = file?.years ?? null;
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
    title: "Poles and Tropics",
    source: "NASA GISTEMP v4 zonal · vs 1951–1980",
    meta: {
      dataset: "NASA GISTEMP v4 zonal annual means: 64°N–90°N, 24°S–24°N, 90°S–64°S",
      link: "https://data.giss.nasa.gov/gistemp/",
      request: file?.source,
      units: "°C anomaly",
      baseline: "1951–1980 average",
      coverage: `${years[0].year}–${years[years.length - 1].year}, yearly`,
      retrieved: fromBackup ? undefined : day(file?.fetched),
      status: fromBackup ? "browser" : "saved",
      limit: "Polar records have few stations, especially before 1950, so early polar values are less certain.",
    },
    points: years.map((entry) => ({
      position: entry.year,
      label: String(entry.year),
      key: String(entry.year),
      temperature: entry.global,
      arctic: entry.arctic,
      tropics: entry.tropics,
      antarctic: entry.antarctic,
    })),
    fromBackup,
  };
}

export const eonetUrl = "https://eonet.gsfc.nasa.gov/api/v3/events?status=all&days=60";
const windowDays = 60;

export interface EonetEvent {
  title: string;
  categories: { id: string }[];
  geometry: { date: string; type: string; coordinates: unknown }[];
}

function centreLon(geometry: EonetEvent["geometry"][number]): number {
  if (geometry.type === "Point") return (geometry.coordinates as number[])[0];
  const ring = (geometry.coordinates as number[][][])[0] ?? [];
  return ring.length ? ring.reduce((sum, corner) => sum + corner[0], 0) / ring.length : 0;
}

export function eventDays(events: EonetEvent[], today = new Date()): ClimatePoint[] {
  const dayKey = (date: Date) => date.toISOString().slice(0, 10);
  const days = new Map<string, { groups: Map<string, { titles: Set<string>; longitudes: number[] }>; headlines: Set<string> }>();
  for (let back = windowDays - 1; back >= 0; back--) {
    days.set(dayKey(new Date(today.getTime() - back * 86400000)), { groups: new Map(), headlines: new Set() });
  }
  for (const event of events) {
    const category = event.categories[0]?.id ?? "other";
    for (const geometry of event.geometry) {
      const day = days.get(geometry.date.slice(0, 10));
      if (!day) continue;
      const group = day.groups.get(category) ?? { titles: new Set<string>(), longitudes: [] };
      if (group.titles.has(event.title)) continue;
      group.titles.add(event.title);
      group.longitudes.push(centreLon(geometry));
      day.groups.set(category, group);
      day.headlines.add(event.title);
    }
  }
  return [...days].map(([key, day], order) => {
    const happenings = [...day.groups].map(([category, group]) => ({
      category,
      count: group.titles.size,
      longitude: group.longitudes.reduce((sum, value) => sum + value, 0) / group.longitudes.length,
    }));
    const date = new Date(`${key}T12:00:00Z`);
    return {
      position: order,
      label: `${date.getUTCDate()} ${monthNames[date.getUTCMonth()]}`,
      key,
      temperature: happenings.reduce((sum, group) => sum + group.count, 0),
      happenings,
      headlines: [...day.headlines],
    };
  });
}

function eventTrack(events: EonetEvent[], live: boolean, fetched?: string): ClimateTrack {
  const newestStamp = events.flatMap((event) => event.geometry.map((geometry) => geometry.date)).sort().at(-1);
  const points = eventDays(events, !live && newestStamp ? new Date(newestStamp) : new Date());
  const newest = events.flatMap((event) => event.geometry.map((geometry) => geometry.date)).sort().at(-1);
  const eventTotals: Record<string, number> = {};
  for (const event of events) {
    const category = event.categories[0]?.id ?? "other";
    eventTotals[category] = (eventTotals[category] ?? 0) + 1;
  }
  return {
    kind: "events",
    eventTotals,
    title: "Natural events",
    source: live ? "NASA EONET · live" : `NASA EONET · saved ${newest?.slice(0, 10) ?? ""}`,
    points,
    notice: live ? "Live events" : "",
    meta: {
      dataset: "NASA Earth Observatory Natural Event Tracker (EONET v3)",
      link: "https://eonet.gsfc.nasa.gov/",
      request: eonetUrl,
      units: "tracked events per day",
      coverage: `${points[0]?.key ?? ""} to ${points.at(-1)?.key ?? ""}, daily`,
      retrieved: live ? today() : day(fetched),
      status: live ? "live" : "saved",
      limit: "EONET lists events NASA is tracking. It is not a complete count of disasters and says nothing about causes.",
    },
  };
}

export async function loadLiveEvents(): Promise<ClimateTrack> {
  const response = await fetchTimed(eonetUrl, 45000);
  if (!response.ok) throw new Error(`EONET HTTP ${response.status}`);
  const events: EonetEvent[] = (await response.json()).events;
  if (!events?.length) throw new Error("EONET returned no events");
  return eventTrack(events, true);
}

export async function loadEvents(): Promise<ClimateTrack> {
  const file = await loadSaved<{ events: EonetEvent[]; fetched?: string }>("eonet.json");
  if (file?.events?.length) return eventTrack(file.events, false, file.fetched);
  return loadLiveEvents();
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
    .filter((key) => /^\d{4}(0[1-9]|1[0-2])$/.test(key))
    .sort();
  const usable = (value: number | undefined) => (typeof value !== "number" || !Number.isFinite(value) || value <= -990 ? NaN : value);
  const points: ClimatePoint[] = [];
  for (const key of monthKeys) {
    const temperature = usable(temperatures[key]);
    if (!Number.isFinite(temperature)) continue;
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(4)) - 1;
    points.push({
      position: year + (month + 0.5) / 12,
      label: `${monthNames[month]} ${year}`,
      key: `${year}-${String(month + 1).padStart(2, "0")}`,
      temperature,
      rainfall: usable(table.PRECTOTCORR?.[key]),
      sunshine: usable(table.ALLSKY_SFC_SW_DWN?.[key]),
    });
  }
  return points;
}

export const powerUnits: Record<string, string> = { T2M: "C", PRECTOTCORR: "mm/day", ALLSKY_SFC_SW_DWN: "MJ/m^2/day" };

export function checkPowerUnits(parameters: Record<string, { units?: string }> | undefined) {
  for (const [name, units] of Object.entries(powerUnits)) {
    if (parameters?.[name]?.units !== units) throw new Error(`Unexpected POWER units for ${name}`);
  }
}

type PowerSave = { table: PowerTable; request: string; fetched: string };

async function fetchPowerLive(place: Place): Promise<PowerSave> {
  const currentYear = new Date().getFullYear();
  for (const lastYear of [currentYear - 1, currentYear - 2]) {
    const request = powerUrl(place.latitude, place.longitude, powerFirstYear, lastYear);
    const response = await fetchTimed(request, 15000);
    if (!response.ok) continue;
    const body = await response.json();
    checkPowerUnits(body.parameters);
    return { table: body.properties.parameter, request, fetched: new Date().toISOString() };
  }
  throw new Error("NASA POWER did not return data");
}

const placeKey = (place: Place) => `earth-in-sound:place:${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}`;

export function distanceKm(from: Place, to: Place) {
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

type BundledPlace = { parameter: PowerTable; parameters?: Record<string, { units?: string }>; source?: string; fetched?: string };

async function bundled(slug: string): Promise<PowerSave | null> {
  const file = await loadSaved<BundledPlace>(`places/${slug}.json`);
  if (!file?.parameter) return null;
  try {
    checkPowerUnits(file.parameters);
  } catch {
    return null;
  }
  return { table: file.parameter, request: file.source ?? "", fetched: file.fetched ?? "" };
}

export async function loadPlace(place: Place, examples: Place[] = []): Promise<ClimateTrack> {
  let saved: PowerSave | null = null;
  let status: DataStatus = "saved";
  let notice = "";
  let shownPlace = place;
  const preset = place.slug ? examples.find((example) => example.slug === place.slug) : undefined;
  if (preset) {
    saved = await bundled(preset.slug!);
    shownPlace = preset;
  }
  if (!saved) {
    try {
      saved = await fetchPowerLive(place);
      status = "live";
      keepSavedCopy(placeKey(place), saved);
    } catch (liveError) {
      const copy = readSavedCopy<PowerSave | PowerTable>(placeKey(place));
      if (copy) {
        saved = "table" in copy ? (copy as PowerSave) : { table: copy as PowerTable, request: "", fetched: "" };
        status = "browser";
        notice = `Offline. Using ${place.name} from this browser.`;
      }
      if (!saved && examples.length) {
        const fallback = nearestExample(place, examples);
        saved = await bundled(fallback.slug!);
        if (saved) {
          shownPlace = fallback;
          notice = `${place.name} unavailable. Playing ${fallback.name}.`;
        }
      }
      if (!saved) throw liveError;
    }
  }
  const points = parsePower(saved.table);
  if (points.length < 24) throw new Error("Not enough NASA POWER data for this place");
  const first = points[0].key!;
  const last = points[points.length - 1].key!;
  return {
    kind: "place",
    title: shownPlace.name,
    source: `NASA POWER · ${shownPlace.latitude.toFixed(2)}, ${shownPlace.longitude.toFixed(2)}`,
    points,
    fromBackup: status !== "live",
    notice,
    place: shownPlace,
    meta: {
      dataset: "NASA POWER monthly point data (AG community): T2M, PRECTOTCORR, ALLSKY_SFC_SW_DWN",
      link: "https://power.larc.nasa.gov/",
      request: saved.request || powerUrl(shownPlace.latitude, shownPlace.longitude, powerFirstYear, Number(last.slice(0, 4))),
      units: "°C · mm/day · MJ/m²/day",
      coverage: `${first} to ${last}, monthly, near ${shownPlace.latitude.toFixed(2)}, ${shownPlace.longitude.toFixed(2)}`,
      retrieved: day(saved.fetched),
      status,
      limit: "Rain is the month's average daily rate (mm/day), not a monthly total. Values are satellite and model estimates for a grid cell (about half a degree for weather, one degree for sunlight), not readings from one weather station.",
    },
  };
}

export async function searchPlaces(name: string): Promise<Place[]> {
  const response = await fetchTimed(
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
