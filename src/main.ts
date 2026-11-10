import "./style.css";
import presets from "./presets.json";
import { Chart } from "./chart";
import { annualMeans, loadGistemp, loadPlace, searchPlaces, slope, type Dataset, type Place } from "./data";
import { Engine, globalSteps, placeSteps, type Step } from "./sonify";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  tabGlobal: $("tab-global"),
  tabPlace: $("tab-place"),
  placeTools: $("place-tools"),
  search: $<HTMLFormElement>("search"),
  q: $<HTMLInputElement>("q"),
  geo: $("geo"),
  results: $("results"),
  presets: $("presets"),
  title: $("title"),
  play: $<HTMLButtonElement>("play"),
  restart: $("restart"),
  label: $("now-label"),
  value: $("now-value"),
  speed: $<HTMLSelectElement>("speed"),
  narrate: $<HTMLInputElement>("narrate"),
  vol: $<HTMLInputElement>("vol"),
  status: $("status"),
  mapping: $("mapping"),
  facts: $("facts"),
  source: $("source"),
};

// Seconds per data point at 1× speed.
const BASE_STEP = { global: 0.5, place: 0.25 };

const engine = new Engine();
const chart = new Chart($("chart"));

let ds: Dataset | null = null;
let steps: Step[] = [];
let idx = 0;
let loaded = false; // are `steps` scheduled on the engine?
let loadToken = 0;

const stepSec = () => (ds ? BASE_STEP[ds.kind] / Number(ui.speed.value) : 0.5);
const fmt = (v: number | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "–" : v.toFixed(d));
const signed = (v: number, d = 2) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d);

// ---------- dataset switching ----------

async function show(load: () => Promise<Dataset>) {
  const token = ++loadToken;
  engine.stop();
  setPlaying(false);
  loaded = false;
  ui.play.disabled = true;
  ui.status.textContent = "Fetching NASA data…";
  try {
    const d = await load();
    if (token !== loadToken) return;
    ds = d;
    steps = d.kind === "global" ? globalSteps(d.points) : placeSteps(d.points);
    idx = 0;
    ui.title.textContent = d.title;
    ui.source.textContent = `Source: ${d.source}`;
    chart.render(d);
    renderMapping(d);
    renderFacts(d);
    updateReadout(0);
    ui.status.textContent = "";
    ui.play.disabled = false;
  } catch (e) {
    if (token !== loadToken) return;
    console.error(e);
    ui.status.textContent =
      errorHint() + (e instanceof Error ? ` (${e.message})` : "");
  }
}

function errorHint() {
  return ui.tabGlobal.getAttribute("aria-selected") === "true"
    ? "Couldn't load GISTEMP. Run `npm run data` once to save it into public/data/."
    : "Couldn't reach NASA POWER for this place. Try again, or pick one of the example places.";
}

function selectTab(kind: "global" | "place") {
  ui.tabGlobal.setAttribute("aria-selected", String(kind === "global"));
  ui.tabPlace.setAttribute("aria-selected", String(kind === "place"));
  ui.placeTools.hidden = kind !== "place";
  if (kind === "global") {
    history.replaceState(null, "", location.pathname + location.search);
    show(loadGistemp);
  } else {
    openPlace(placeFromHash() ?? (presets[0] as Place));
  }
}

function openPlace(p: Place) {
  const h = new URLSearchParams({ lat: p.lat.toFixed(3), lon: p.lon.toFixed(3), name: p.name, ...(p.country ? { country: p.country } : {}), ...(p.slug ? { slug: p.slug } : {}) });
  history.replaceState(null, "", `#${h}`);
  ui.results.innerHTML = "";
  show(() => loadPlace(p));
}

function placeFromHash(): Place | null {
  const h = new URLSearchParams(location.hash.slice(1));
  const lat = Number(h.get("lat"));
  const lon = Number(h.get("lon"));
  if (!h.has("lat") || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, name: h.get("name") ?? "Selected place", country: h.get("country") ?? undefined, slug: h.get("slug") ?? undefined };
}

// ---------- text panels ----------

function renderMapping(d: Dataset) {
  const items =
    d.kind === "global"
      ? [
          ["Each note", "one year (half a second at 1× speed)"],
          ["Pitch", "global temperature anomaly: higher means hotter"],
          ["Brightness and hiss", "rise with the anomaly, like a heat haze"],
          ["Low bass note", "the start of each decade"],
        ]
      : [
          ["Each beat", "one month (a quarter second at 1× speed)"],
          ["Pitch", "air temperature at 2 m (T2M)"],
          ["Number of notes", "rainfall (PRECTOTCORR): rainy months patter with up to 4 notes"],
          ["Brightness", "sunshine reaching the ground (ALLSKY_SFC_SW_DWN): cloudy months sound muffled"],
          ["Low bass note", "every January"],
        ];
  ui.mapping.innerHTML = items.map(([k, v]) => `<li><b>${k}</b>: ${v}</li>`).join("");
}

function renderFacts(d: Dataset) {
  const li: string[] = [];
  if (d.kind === "global") {
    const p = d.points;
    const mean = (a: typeof p) => a.reduce((s, x) => s + x.temp, 0) / a.length;
    const early = p.filter((x) => x.x < 1910);
    const late = p.slice(-10);
    const warmest = p.reduce((a, b) => (b.temp > a.temp ? b : a));
    const recent = p.filter((x) => x.x >= 1980);
    li.push(`The last 10 years averaged <b>${signed(mean(late) - mean(early))} °C</b> warmer than ${p[0].x}–1909.`);
    li.push(`Warmest year on record: <b>${warmest.label}</b> (${signed(warmest.temp)} °C vs 1951–1980).`);
    li.push(`Since 1980 the planet has warmed about <b>${signed(slope(recent.map((x) => x.x), recent.map((x) => x.temp)) * 10, 2)} °C per decade</b>.`);
  } else {
    const yrs = annualMeans(d.points);
    if (yrs.length >= 5) {
      const s = slope(yrs.map((y) => y.year), yrs.map((y) => y.temp)) * 10;
      const w = yrs.reduce((a, b) => (b.temp > a.temp ? b : a));
      li.push(`Trend: <b>${signed(s, 2)} °C per decade</b> (${yrs[0].year}–${yrs[yrs.length - 1].year}, yearly averages).`);
      li.push(`Warmest year here: <b>${w.year}</b>, averaging ${fmt(w.temp)} °C.`);
    }
    const wet = d.points.reduce((a, b) => ((b.rain ?? -1) > (a.rain ?? -1) ? b : a));
    const hot = d.points.reduce((a, b) => (b.temp > a.temp ? b : a));
    li.push(`Hottest month: <b>${hot.label}</b> at ${fmt(hot.temp)} °C.`);
    li.push(`Wettest month: <b>${wet.label}</b>, ${fmt(wet.rain)} mm of rain per day.`);
  }
  ui.facts.innerHTML = li.map((x) => `<li>${x}</li>`).join("");
}

function updateReadout(i: number) {
  if (!ds) return;
  idx = i;
  const p = ds.points[i];
  ui.label.textContent = p.label;
  ui.value.textContent =
    ds.kind === "global"
      ? `${signed(p.temp)} °C`
      : `${fmt(p.temp)} °C · rain ${fmt(p.rain)} mm/day · sun ${fmt(p.sun, 2)} kWh/m²/day`;
  chart.setPlayhead(i);
}

// ---------- transport ----------

function setPlaying(on: boolean) {
  ui.play.textContent = on ? "⏸" : "▶";
  ui.play.setAttribute("aria-label", on ? "Pause" : "Play");
}

async function togglePlay() {
  if (!ds) return;
  await engine.init();
  engine.setVolume(Number(ui.vol.value));
  if (engine.playing) {
    engine.pause();
    setPlaying(false);
    return;
  }
  if (!loaded) {
    engine.load(steps, stepSec(), idx >= steps.length - 1 ? 0 : idx);
    loaded = true;
  }
  engine.play();
  setPlaying(true);
}

function seek(i: number) {
  if (!ds) return;
  const c = Math.max(0, Math.min(ds.points.length - 1, i));
  if (loaded) engine.seek(c);
  else updateReadout(c);
}

engine.onStep = updateReadout;
engine.onEnd = () => {
  setPlaying(false);
  loaded = false;
  ui.status.textContent = "Finished. Press play to hear it again.";
};
chart.onSeek = seek;

ui.play.addEventListener("click", togglePlay);
ui.restart.addEventListener("click", () => seek(0));
ui.narrate.addEventListener("change", () => (engine.narrate = ui.narrate.checked));
ui.vol.addEventListener("input", () => engine.setVolume(Number(ui.vol.value)));
ui.speed.addEventListener("change", () => {
  if (!loaded) return;
  const wasPlaying = engine.playing;
  const at = engine.index;
  engine.load(steps, stepSec(), at);
  if (wasPlaying) engine.play();
});
ui.tabGlobal.addEventListener("click", () => selectTab("global"));
ui.tabPlace.addEventListener("click", () => selectTab("place"));

document.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(tag)) return;
  if (e.code === "Space") {
    e.preventDefault();
    togglePlay();
  } else if (e.key === "ArrowRight") seek(idx + (e.shiftKey ? 10 : 1));
  else if (e.key === "ArrowLeft") seek(idx - (e.shiftKey ? 10 : 1));
});

// ---------- place search ----------

const chip = (p: Place) => {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = p.country ? `${p.name}, ${p.country}` : p.name;
  b.addEventListener("click", () => openPlace(p));
  const li = document.createElement("li");
  li.appendChild(b);
  return li;
};

ui.presets.append(...(presets as Place[]).map(chip));

ui.search.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = ui.q.value.trim();
  if (!q) return;
  ui.results.innerHTML = "<li class='muted'>Searching…</li>";
  try {
    const found = await searchPlaces(q);
    ui.results.innerHTML = found.length ? "" : "<li class='muted'>No places found.</li>";
    ui.results.append(...found.map(chip));
  } catch {
    ui.results.innerHTML = "<li class='muted'>Search is unavailable. Try an example place.</li>";
  }
});

ui.geo.addEventListener("click", () => {
  if (!navigator.geolocation) return;
  ui.status.textContent = "Finding you…";
  navigator.geolocation.getCurrentPosition(
    (pos) => openPlace({ name: "My location", lat: pos.coords.latitude, lon: pos.coords.longitude }),
    () => (ui.status.textContent = "Location permission was denied. Search for your city instead."),
  );
});

// ---------- start ----------

selectTab(placeFromHash() ? "place" : "global");
