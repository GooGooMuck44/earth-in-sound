// Loading NASA data in the browser.
// Every loader tries the live NASA API first (when the API allows browser requests),
// then falls back to the copy saved by `npm run data` in public/data/.

export interface Point {
  x: number; // chart x: a year (global) or fractional year (monthly)
  label: string; // "1998" or "Mar 2015"
  temp: number; // °C anomaly (global) or °C (place)
  rain?: number; // mm/day
  sun?: number; // kWh/m²/day
}

export interface Dataset {
  kind: "global" | "place";
  title: string;
  source: string;
  points: Point[];
}

export interface Place {
  slug?: string;
  name: string;
  country?: string;
  lat: number;
  lon: number;
}

const BASE = import.meta.env.BASE_URL;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ---------- GISTEMP (global temperature anomaly since 1880) ----------

export const GISTEMP_CSV = "https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv";

/** Parses NASA GISS GLB.Ts+dSST.csv into yearly J-D anomalies (°C vs 1951–1980). */
export function parseGistempCsv(csv: string): { year: number; anomaly: number }[] {
  const lines = csv.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.startsWith("Year,"));
  if (headerIdx < 0) throw new Error("Unexpected GISTEMP format");
  const cols = lines[headerIdx].split(",");
  const jd = cols.indexOf("J-D");
  const out: { year: number; anomaly: number }[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    const c = line.split(",");
    const year = Number(c[0]);
    const v = Number(c[jd]);
    if (Number.isFinite(year) && c[jd] && c[jd] !== "***" && Number.isFinite(v)) {
      out.push({ year, anomaly: v });
    }
  }
  return out;
}

export async function loadGistemp(): Promise<Dataset> {
  let years: { year: number; anomaly: number }[] | null = null;
  try {
    const r = await fetch(`${BASE}data/gistemp.json`);
    if (r.ok) years = (await r.json()).years;
  } catch {
    /* fall through to live */
  }
  if (!years) {
    // Usually blocked by CORS in browsers, but worth a try.
    const r = await fetch(GISTEMP_CSV);
    if (!r.ok) throw new Error(`GISTEMP HTTP ${r.status}`);
    years = parseGistempCsv(await r.text());
  }
  if (!years.length) throw new Error("GISTEMP data is empty");
  return {
    kind: "global",
    title: `Global temperature, ${years[0].year}–${years[years.length - 1].year}`,
    source: "NASA GISS Surface Temperature Analysis (GISTEMP v4), anomaly vs 1951–1980",
    points: years.map((y) => ({ x: y.year, label: String(y.year), temp: y.anomaly })),
  };
}

// ---------- NASA POWER (monthly climate for any point on Earth) ----------

export const POWER_PARAMS = "T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN";
export const POWER_START = 2001;

export function powerUrl(lat: number, lon: number, start: number, end: number): string {
  const q = new URLSearchParams({
    parameters: POWER_PARAMS,
    community: "AG",
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start: String(start),
    end: String(end),
    format: "JSON",
  });
  return `https://power.larc.nasa.gov/api/temporal/monthly/point?${q}`;
}

type ParamTable = Record<string, Record<string, number>>;

/** Turns POWER's {T2M: {"200101": 3.2, ..., "200113": annual}} into monthly points. */
export function parsePower(parameter: ParamTable): Point[] {
  const t = parameter.T2M ?? {};
  const keys = Object.keys(t)
    .filter((k) => k.length === 6 && Number(k.slice(4)) >= 1 && Number(k.slice(4)) <= 12)
    .sort();
  const clean = (v: number | undefined) => (v === undefined || v <= -990 ? NaN : v);
  const pts: Point[] = [];
  for (const k of keys) {
    const temp = clean(t[k]);
    if (!Number.isFinite(temp)) continue;
    const year = Number(k.slice(0, 4));
    const m = Number(k.slice(4)) - 1;
    pts.push({
      x: year + (m + 0.5) / 12,
      label: `${MONTHS[m]} ${year}`,
      temp,
      rain: clean(parameter.PRECTOTCORR?.[k]),
      sun: clean(parameter.ALLSKY_SFC_SW_DWN?.[k]),
    });
  }
  return pts;
}

async function fetchPowerLive(p: Place): Promise<ParamTable> {
  const thisYear = new Date().getFullYear();
  // Monthly POWER data lags; the newest complete year may not exist yet.
  for (const end of [thisYear - 1, thisYear - 2]) {
    const r = await fetch(powerUrl(p.lat, p.lon, POWER_START, end));
    if (r.ok) return (await r.json()).properties.parameter;
  }
  throw new Error("NASA POWER did not return data");
}

export async function loadPlace(p: Place): Promise<Dataset> {
  let parameter: ParamTable | null = null;
  let note = "";
  try {
    parameter = await fetchPowerLive(p);
  } catch (e) {
    if (p.slug) {
      const r = await fetch(`${BASE}data/places/${p.slug}.json`);
      if (r.ok) {
        parameter = (await r.json()).parameter;
        note = " (saved copy)";
      }
    }
    if (!parameter) throw e;
  }
  const points = parsePower(parameter);
  if (points.length < 24) throw new Error("Not enough NASA POWER data for this place");
  const name = p.country ? `${p.name}, ${p.country}` : p.name;
  return {
    kind: "place",
    title: `${name}: ${Math.floor(points[0].x)}–${Math.floor(points[points.length - 1].x)}`,
    source: `NASA POWER monthly T2M, PRECTOTCORR, ALLSKY_SFC_SW_DWN at ${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}${note}`,
    points,
  };
}

// ---------- Place search (Open-Meteo geocoding: free, no key, open data) ----------

export async function searchPlaces(name: string): Promise<Place[]> {
  const r = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&format=json&name=${encodeURIComponent(name)}`,
  );
  if (!r.ok) throw new Error(`Search failed (${r.status})`);
  const j = await r.json();
  return (j.results ?? []).map((g: any) => ({
    name: g.name,
    country: g.country,
    lat: g.latitude,
    lon: g.longitude,
  }));
}

// ---------- Small stats for the "what you're hearing" facts ----------

/** Least-squares slope of y over x. */
export function slope(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den ? num / den : 0;
}

/** Yearly means of a monthly series, keeping only complete years. */
export function annualMeans(points: Point[]): { year: number; temp: number }[] {
  const by = new Map<number, number[]>();
  for (const p of points) {
    const y = Math.floor(p.x);
    if (!by.has(y)) by.set(y, []);
    by.get(y)!.push(p.temp);
  }
  return [...by]
    .filter(([, v]) => v.length === 12)
    .map(([year, v]) => ({ year, temp: v.reduce((a, b) => a + b, 0) / 12 }));
}
