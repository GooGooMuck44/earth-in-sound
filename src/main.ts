import "./style.css";
import presetFile from "./presets.json";
import { ClimateChart, type Key } from "./chart";
import { loadComparison } from "./compare";
import { fileStem, notes, toCsv } from "./csv";
import {
  loadEvents,
  loadGlobal,
  loadLiveEvents,
  loadPlace,
  loadZones,
  placeName,
  searchPlaces,
  type ClimatePoint,
  type ClimateTrack,
  type Place,
  type TrackKind,
} from "./data";
import { findingsFor, signed } from "./findings";
import { startHome } from "./home";
import { fillIcons, icon } from "./icons";
import { clampRange, isFull, rangeKinds, rangeLabel, slice, span, yearsIn, type YearRange } from "./range";
import { latestMonths, loadImageScan, loadScan, scanLayers, type ScanLayer } from "./scan";
import { buildSetup, parseSetup, sharesLocation, type Setup } from "./share";
import { SoundEngine, shouldLoopPlayback, speakAloud, stepsFor, supportsLeadSound, type LeadSound, type SoundStep } from "./sonify";
import { tabAfterKey, trackOrder } from "./ui";

const presets = presetFile as Place[];
const dhaka = presets.find((place) => place.slug === "dhaka")!;
const london = presets.find((place) => place.slug === "london")!;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const page = {
  tabs: Object.fromEntries(trackOrder.map((kind) => [kind, $(`tab-${kind}`)])) as Record<TrackKind, HTMLButtonElement>,
  hint: $("hint"),
  title: $("title"),
  subtitle: $("subtitle"),
  badge: $("badge"),
  placeTools: $("place-tools"),
  compareTools: $("compare-tools"),
  scanTools: $("scan-tools"),
  cityA: $<HTMLSelectElement>("city-a"),
  cityB: $<HTMLSelectElement>("city-b"),
  layer: $<HTMLSelectElement>("layer"),
  month: $<HTMLInputElement>("month"),
  thenNow: $<HTMLInputElement>("then-now"),
  thenNowLabel: $("then-now-label"),
  picture: $<HTMLInputElement>("picture"),
  pictureLabel: $("picture-label"),
  pictureWords: $("picture-words"),
  legend: $("legend"),
  key: $("key"),
  search: $<HTMLFormElement>("search"),
  query: $<HTMLInputElement>("q"),
  geo: $<HTMLButtonElement>("geo"),
  results: $("results"),
  presetList: $("presets"),
  range: $("range"),
  from: $<HTMLSelectElement>("from"),
  to: $<HTMLSelectElement>("to"),
  rangeReset: $<HTMLButtonElement>("range-reset"),
  findings: $("findings"),
  mapping: $("mapping"),
  scaleNote: $("scale-note"),
  status: $("status"),
  connection: $("connection"),
  play: $<HTMLButtonElement>("play"),
  restart: $<HTMLButtonElement>("restart"),
  scrub: $<HTMLInputElement>("scrub"),
  nowLabel: $("now-label"),
  nowValue: $("now-value"),
  speed: $<HTMLSelectElement>("speed"),
  volume: $<HTMLInputElement>("vol"),
  record: $<HTMLButtonElement>("record"),
  download: $<HTMLAnchorElement>("download"),
  more: $<HTMLButtonElement>("more"),
  extra: $("extra"),
  instrument: $<HTMLSelectElement>("instrument"),
  instrumentControl: $("instrument-control"),
  loop: $<HTMLInputElement>("loop"),
  narrate: $<HTMLInputElement>("narrate"),
  recordNote: $("record-note"),
  wave: $<HTMLCanvasElement>("wave"),
  about: $<HTMLDialogElement>("about"),
  data: $<HTMLDialogElement>("data"),
  dataList: $("data-list"),
  csv: $<HTMLAnchorElement>("csv"),
  notes: $<HTMLAnchorElement>("notes"),
  share: $<HTMLDialogElement>("share"),
  saved: $<HTMLDialogElement>("saved"),
  savedList: $<HTMLUListElement>("saved-list"),
  savedNote: $("saved-note"),
  setupName: $<HTMLInputElement>("setup-name"),
  shareLink: $<HTMLInputElement>("share-link"),
  shareWarning: $("share-warning"),
  copy: $<HTMLButtonElement>("copy"),
  copied: $("copied"),
  tour: $("tour"),
  tourStep: $("tour-step"),
  tourCaption: $("tour-caption"),
};

const stepSeconds: Record<TrackKind, number> = { global: 0.5, zones: 0.5, place: 0.25, compare: 0.25, events: 0.4, scan: 0.25 };
const calm = matchMedia("(prefers-reduced-motion: reduce)");

const engine = new SoundEngine();
const chart = new ClimateChart($("chart"));

let view: TrackKind = "global";
let full: ClimateTrack | null = null;
let shown: ClimateTrack | null = null;
let fullSteps: SoundStep[] = [];
let steps: SoundStep[] = [];
let range: YearRange | null = null;
let pendingRange: Partial<YearRange> | null = null;
let currentStep = 0;
let scheduled = false;
let latestRequest = 0;
let place: Place = dhaka;
let pair: [Place, Place] = [dhaka, london];
const known: Place[] = [...presets];
let lastLoad: (() => void) | null = null;
let exportUrls: string[] = [];

const secondsPerStep = () => stepSeconds[view] / Number(page.speed.value);

function say(text: string, retry?: () => void) {
  page.status.textContent = text;
  if (retry) {
    const again = document.createElement("button");
    again.type = "button";
    again.className = "quiet small";
    again.textContent = "Try again";
    again.addEventListener("click", retry);
    page.status.append(" ", again);
  }
}

function setPlayIcon(playing: boolean) {
  page.play.innerHTML = icon(playing ? "pause" : "play");
  page.play.setAttribute("aria-label", playing ? "Pause" : "Play");
  page.play.classList.toggle("playing", playing);
  cancelAnimationFrame(waveFrame);
  waveFrame = requestAnimationFrame(drawWave);
}

function halt() {
  engine.stop();
  scheduled = false;
  setPlayIcon(false);
}

function loadingName(kind: TrackKind) {
  if (kind === "place") return place.name;
  if (kind === "compare") return `${pair[0].name} and ${pair[1].name}`;
  if (kind === "scan") return page.layer.value === "image" ? "image" : scanLayers[page.layer.value as Exclude<ScanLayer, "image">].name.toLowerCase();
  return { global: "global temperature", zones: "the poles", events: "events" }[kind as "global"];
}

async function showTrack(load: () => Promise<ClimateTrack>, kind: TrackKind) {
  const request = ++latestRequest;
  await stopRecording();
  halt();
  page.play.disabled = true;
  page.record.disabled = true;
  page.download.hidden = true;
  say(`Loading ${loadingName(kind)}…`);
  lastLoad = () => void showTrack(load, kind);
  try {
    const loaded = await load();
    if (request !== latestRequest) return false;
    full = loaded;
    fullSteps = stepsFor(loaded.kind, loaded.points);
    if (loaded.place) place = loaded.place;
    if (loaded.places) pair = loaded.places;
    range = rangeKinds.includes(loaded.kind) ? clampRange(loaded.points, pendingRange) : null;
    pendingRange = null;
    currentStep = 0;
    applyRange();
    describeSound(loaded);
    say(loaded.notice ?? "");
    page.instrument.disabled = !supportsLeadSound(loaded.kind);
    page.instrumentControl.title = page.instrument.disabled ? "This view uses its own fixed voices" : "";
    page.pictureWords.hidden = !loaded.scan;
    page.pictureWords.textContent = loaded.scan?.description ?? "";
    showLegend(loaded);
    page.play.disabled = false;
    page.record.disabled = !engine.canRecord;
    markPresets();
    remember();
    return true;
  } catch (problem) {
    if (request !== latestRequest) return false;
    console.error(problem);
    say(friendlyError(kind), lastLoad);
    return false;
  }
}

function friendlyError(kind: TrackKind) {
  if (kind === "scan") return page.layer.value === "image" ? "Couldn't read that image." : "NASA GIBS unavailable.";
  if (kind === "place") return `${place.name} unavailable. Choose a saved city.`;
  if (kind === "compare") return "One of these places is unavailable. Choose saved cities.";
  if (kind === "events") return "Events unavailable.";
  return "Data unavailable.";
}

function applyRange() {
  if (!full) return;
  halt();
  shown = slice(full, range);
  const [start, end] = rangeKinds.includes(full.kind) && range ? span(full.points, range) : [0, full.points.length];
  steps = fullSteps.slice(start, end);
  currentStep = Math.min(currentStep, Math.max(0, steps.length - 1));
  page.title.textContent = shown.title;
  page.subtitle.textContent = subtitleFor(shown);
  showBadge(shown);
  chart.render(shown);
  showFindings(shown);
  showRangeControls();
  page.scrub.max = String(Math.max(0, shown.points.length - 1));
  showReadout(currentStep);
}

function subtitleFor(track: ClimateTrack) {
  const period = range ? rangeLabel(range) : "";
  switch (track.kind) {
    case "global":
      return `vs 1951–1980 · ${period}`;
    case "zones":
      return `vs 1951–1980 · ${period}`;
    case "place":
      return `${track.place?.country ?? `${track.place?.latitude.toFixed(2)}, ${track.place?.longitude.toFixed(2)}`} · ${period}`;
    case "compare":
      return `Monthly temperature · ${period}`;
    case "events":
      return `${track.points[0]?.label} – ${track.points.at(-1)?.label}`;
    case "scan":
      return track.scan?.layer === "image" ? "Colour and brightness" : "NASA GIBS";
  }
}

function showBadge(track: ClimateTrack) {
  const status = track.meta.status;
  page.badge.hidden = track.scan?.layer === "image";
  page.badge.textContent = status === "live" ? "Live" : status === "browser" ? "Saved in browser" : "Saved data";
  page.badge.className = `badge ${status}`;
}

function showRangeControls() {
  if (!full || !range || !rangeKinds.includes(full.kind)) {
    page.range.hidden = true;
    return;
  }
  page.range.hidden = false;
  const years = yearsIn(full.points);
  const options = (selected: number) => years.map((year) => `<option value="${year}"${year === selected ? " selected" : ""}>${year}</option>`).join("");
  page.from.innerHTML = options(range.from);
  page.to.innerHTML = options(range.to);
  page.rangeReset.hidden = isFull(full.points, range);
}

function setRange(next: Partial<YearRange> | null) {
  if (!full) return;
  void stopRecording();
  range = clampRange(full.points, next);
  currentStep = 0;
  applyRange();
  remember();
}

function showFindings(track: ClimateTrack) {
  page.findings.innerHTML = "";
  for (const finding of findingsFor(track)) {
    const item = document.createElement("div");
    const label = document.createElement("dt");
    label.textContent = finding.label;
    const value = document.createElement("dd");
    value.textContent = finding.value;
    item.append(label, value);
    page.findings.append(item);
  }
}

function showKey(keys: Key[]) {
  page.key.innerHTML = "";
  for (const entry of keys) {
    const item = document.createElement("li");
    item.style.color = entry.color;
    const swatch = document.createElement("i");
    swatch.className = entry.style;
    const name = document.createElement("span");
    name.textContent = entry.name;
    name.style.color = "var(--text-2)";
    item.append(swatch, name);
    page.key.append(item);
  }
}
chart.onKey = showKey;

function showLegend(track: ClimateTrack) {
  const legend = track.scan?.legend;
  page.legend.hidden = !legend;
  if (!legend) return;
  page.legend.innerHTML = `<div class="bar" style="background:linear-gradient(90deg, ${legend.stops})"></div><div class="ends"><span>${legend.low}</span><span>NASA colormap</span><span>${legend.high}</span></div>`;
}

const sound: Record<TrackKind, [string, string][]> = {
  global: [["One note", "one year"], ["Higher", "warmer"], ["Hiss", "more heat"], ["Low tone", "new decade"]],
  zones: [["Left", "Arctic"], ["Centre", "Tropics"], ["Right", "Antarctic"], ["Higher", "warmer"]],
  place: [["One beat", "one month"], ["Higher", "warmer"], ["More notes", "more rain"], ["Brighter", "more sunlight"], ["Low tone", "January"]],
  compare: [["Left ear", "first city"], ["Right ear", "second city"], ["Higher", "warmer"], ["Low tone", "January"]],
  events: [["One beat", "one day"], ["Crackle", "wildfire"], ["Drum", "storm or volcano"], ["Bell", "ice or snow"], ["Pluck", "other"], ["Left to right", "west to east"]],
  scan: [["Sweep", "west to east"], ["Notes", "north to south"], ["Higher", "higher value"], ["Left to right", "west to east"]],
};

function describeSound(track: ClimateTrack) {
  let rows = sound[track.kind];
  if (track.kind === "compare" && track.places) rows = [["Left ear", track.places[0].name], ["Right ear", track.places[1].name], ...rows.slice(2)];
  if (track.scan?.layer === "image") rows = [["Sweep", "left to right"], ["Higher", "warmer colour, brighter"], ["More notes", "more detail and colour"]];
  page.mapping.innerHTML = "";
  for (const [what, how] of rows) {
    const item = document.createElement("li");
    const name = document.createElement("b");
    name.textContent = what;
    item.append(name, `: ${how}`);
    page.mapping.append(item);
  }
  const scaleNotes: Partial<Record<TrackKind, string>> = {
    global: "Pitch uses one scale for the whole record, so a shorter range keeps the same notes.",
    zones: "All three regions share one pitch scale, so the same note means the same anomaly.",
    place: "Pitch, rain and brightness each use one scale for this city's full record. Rain is the month's average daily rate.",
    compare: "Both cities share one pitch scale in °C, across the months they have in common.",
    events: "Busy days are thinned to 16 sounds so they stay clear. The chart keeps the full count.",
    scan: track.scan?.layer === "image" ? "This plays colour and brightness, not a measurement." : "Values are read back from the map's NASA colormap, so they are approximate.",
  };
  page.scaleNote.textContent = scaleNotes[track.kind] ?? "";
}

function valueText(track: ClimateTrack, point: ClimatePoint) {
  const one = (value: number | undefined, digits = 1) => (value == null || !Number.isFinite(value) ? "no data" : value.toFixed(digits));
  const anomaly = (value: number | undefined) => (value == null || !Number.isFinite(value) ? "no data" : signed(value));
  switch (track.kind) {
    case "global":
      return `${anomaly(point.temperature)} °C`;
    case "zones":
      return `Arctic ${anomaly(point.arctic)} · Tropics ${anomaly(point.tropics)} · Antarctic ${anomaly(point.antarctic)} °C`;
    case "place":
      return `${one(point.temperature)} °C · rain ${one(point.rainfall)} mm/day · sun ${one(point.sunshine)} MJ/m²/day`;
    case "compare":
      return `${track.places![0].name} ${one(point.temperature)} °C · ${track.places![1].name} ${one(point.other)} °C`;
    case "events":
      return `${point.temperature} ${point.temperature === 1 ? "event" : "events"}${point.headlines?.length ? ` · ${point.headlines.slice(0, 2).join(" · ")}` : ""}`;
    case "scan":
      return Number.isFinite(point.temperature) ? `${point.temperature.toFixed(track.scan!.digits)} ${track.scan!.units}` : "no data";
  }
}

function showReadout(stepNumber: number) {
  if (!shown || !shown.points.length) return;
  currentStep = Math.max(0, Math.min(shown.points.length - 1, stepNumber));
  const point = shown.points[currentStep];
  const value = valueText(shown, point);
  page.nowLabel.textContent = point.label;
  page.nowValue.textContent = value;
  page.scrub.value = String(currentStep);
  page.scrub.setAttribute("aria-valuetext", `${point.label}, ${value}`);
  page.scrub.style.setProperty("--fill", `${(currentStep / Math.max(1, shown.points.length - 1)) * 100}%`);
  chart.movePlayhead(currentStep);
  tourCaptionAt(currentStep);
}

let waveFrame = 0;
function drawWave() {
  const pen = page.wave.getContext("2d");
  if (!pen) return;
  const ratio = window.devicePixelRatio || 1;
  const width = page.wave.clientWidth * ratio;
  const height = page.wave.clientHeight * ratio;
  if (page.wave.width !== width) page.wave.width = width;
  if (page.wave.height !== height) page.wave.height = height;
  pen.clearRect(0, 0, width, height);
  if (!engine.playing || calm.matches) return;
  const samples = engine.wave?.getValue();
  if (!samples) return;
  pen.lineWidth = 1.5 * ratio;
  pen.strokeStyle = "rgba(140, 196, 255, 0.75)";
  pen.beginPath();
  for (let at = 0; at < samples.length; at++) {
    const x = (at / (samples.length - 1)) * width;
    const y = height / 2 - samples[at] * height * 1.2;
    if (at) pen.lineTo(x, y);
    else pen.moveTo(x, y);
  }
  pen.stroke();
  waveFrame = requestAnimationFrame(drawWave);
}

async function prepareAudio() {
  try {
    await engine.init();
    engine.setVolume(Number(page.volume.value));
    engine.useLeadSound(page.instrument.value as LeadSound);
    engine.narrate = page.narrate.checked && !tour.active;
    return true;
  } catch (problem) {
    console.error(problem);
    say("Sound is blocked. Tap play again.");
    return false;
  }
}

function startFrom(stepNumber: number) {
  engine.load(steps, secondsPerStep(), stepNumber);
  scheduled = true;
  engine.play();
  setPlayIcon(true);
}

async function togglePlay() {
  if (!shown || page.play.disabled || !(await prepareAudio())) return;
  page.hint.textContent = "Use ← → to step through time.";
  if (engine.playing) {
    engine.pause();
    setPlayIcon(false);
    await stopRecording();
    return;
  }
  if (!scheduled) {
    startFrom(currentStep >= steps.length - 1 ? 0 : currentStep);
    return;
  }
  engine.play();
  setPlayIcon(true);
}

async function toggleRecording() {
  if (!shown || !(await prepareAudio())) return;
  if (engine.recording) {
    engine.pause();
    setPlayIcon(false);
    await stopRecording();
    return;
  }
  page.download.hidden = true;
  engine.load(steps, secondsPerStep(), 0);
  scheduled = true;
  if (!engine.startRecording()) {
    say("Recording isn't supported here.");
    return;
  }
  page.record.classList.add("on");
  page.record.innerHTML = icon("stop");
  page.record.setAttribute("aria-label", "Stop recording");
  say("Recording one pass…");
  engine.play();
  setPlayIcon(true);
}

async function stopRecording() {
  if (!engine.recording) return;
  page.record.classList.remove("on");
  page.record.innerHTML = icon("record");
  page.record.setAttribute("aria-label", "Record one pass");
  const recording = await engine.finishRecording();
  if (!recording || !shown) return;
  if (page.download.href) URL.revokeObjectURL(page.download.href);
  page.download.href = URL.createObjectURL(recording);
  page.download.download = `${fileStem(shown)}.webm`;
  page.download.hidden = false;
  say("Recorded. Press Save to keep it.");
}

function jumpTo(stepNumber: number) {
  if (!shown) return;
  const safe = Math.max(0, Math.min(shown.points.length - 1, stepNumber));
  if (scheduled) engine.jumpTo(safe);
  else showReadout(safe);
}

engine.onStep = showReadout;
engine.onEnd = () => {
  if (tour.active) {
    setPlayIcon(false);
    scheduled = false;
    window.setTimeout(() => tour.active && nextChapter(), 1400);
    return;
  }
  if (shouldLoopPlayback(page.loop.checked, engine.recording)) {
    startFrom(0);
    return;
  }
  setPlayIcon(false);
  scheduled = false;
  void stopRecording();
};
chart.onJump = jumpTo;

function selectTab(kind: TrackKind) {
  view = kind;
  for (const [tabKind, tab] of Object.entries(page.tabs)) {
    const selected = tabKind === kind;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  page.tabs[kind].scrollIntoView({ block: "nearest", inline: "nearest" });
  page.placeTools.hidden = kind !== "place";
  page.compareTools.hidden = kind !== "compare";
  page.scanTools.hidden = kind !== "scan";
  if (kind !== "scan") {
    page.legend.hidden = true;
    page.pictureWords.hidden = true;
  }
}

function openView(kind: TrackKind): Promise<boolean> {
  selectTab(kind);
  if (kind === "place") return showTrack(() => loadPlace(place, presets), "place");
  if (kind === "compare") {
    fillCompare();
    return showTrack(() => loadComparison(pair[0], pair[1], presets), "compare");
  }
  if (kind === "scan") return openScan();
  if (kind === "events") {
    return showTrack(loadEvents, "events").then((ok) => {
      if (ok) void refreshEvents();
      return ok;
    });
  }
  return showTrack(kind === "global" ? loadGlobal : loadZones, kind);
}

function openScan(): Promise<boolean> {
  const layer = page.layer.value as ScanLayer;
  const usingImage = layer === "image";
  page.pictureLabel.hidden = !usingImage;
  page.month.hidden = usingImage;
  page.thenNowLabel.hidden = layer !== "air";
  if (usingImage) {
    const file = page.picture.files?.[0];
    if (file) return showTrack(() => loadImageScan(file), "scan");
    latestRequest++;
    halt();
    full = shown = null;
    page.play.disabled = true;
    page.title.textContent = "Your image";
    page.subtitle.textContent = "Colour and brightness, not a measurement";
    page.badge.hidden = true;
    page.findings.innerHTML = "";
    page.range.hidden = true;
    page.legend.hidden = true;
    page.pictureWords.hidden = true;
    chart.render({ kind: "events", title: "", source: "", points: [], meta: { dataset: "", link: "", units: "", coverage: "", status: "saved", limit: "" } });
    say("Choose an image");
    remember();
    return Promise.resolve(false);
  }
  const info = scanLayers[layer];
  page.month.min = info.first;
  page.month.max = info.latest;
  if (!page.month.value || page.month.value > info.latest || page.month.value < info.first) page.month.value = info.latest;
  const month = page.month.value;
  const thenVsNow = layer === "air" && page.thenNow.checked;
  return showTrack(() => loadScan(layer, month, thenVsNow), "scan");
}

async function refreshEvents() {
  const request = latestRequest;
  if (!navigator.onLine) return;
  say("Checking live events…");
  try {
    const live = await loadLiveEvents();
    if (request !== latestRequest || scheduled || engine.recording || view !== "events") return;
    await showTrack(async () => live, "events");
  } catch {
    if (request === latestRequest && view === "events") say("Live events unavailable. Playing saved data.");
    return;
  }
}

function currentSetup(): Setup {
  const setup: Setup = { view, sound: page.instrument.value as LeadSound, speed: Number(page.speed.value) };
  if (view === "place") setup.city = place;
  if (view === "compare") [setup.city, setup.city2] = pair;
  if (full && range && rangeKinds.includes(full.kind) && !isFull(full.points, range)) {
    setup.from = range.from;
    setup.to = range.to;
  }
  if (view === "scan" && page.layer.value !== "image") {
    setup.layer = page.layer.value as Setup["layer"];
    setup.month = page.month.value;
    setup.then = page.thenNow.checked;
  }
  return setup;
}

function remember() {
  const setup = currentSetup();
  if (sharesLocation(setup)) {
    delete setup.city;
    delete setup.city2;
  }
  const hash = buildSetup(setup);
  history.replaceState(history.state, "", hash === "#view=planet" ? location.pathname + location.search : hash);
}

async function applySetup(setup: Setup) {
  if (setup.speed) page.speed.value = String(setup.speed);
  if (setup.sound) {
    page.instrument.value = setup.sound;
    engine.useLeadSound(setup.sound);
  }
  if (setup.city) {
    addKnown(setup.city);
    if (setup.view === "place") place = setup.city;
    if (setup.view === "compare") pair = [setup.city, setup.city2 ? addKnown(setup.city2) : pair[1]];
  }
  if (setup.layer) page.layer.value = setup.layer;
  if (setup.month) page.month.value = setup.month;
  page.thenNow.checked = Boolean(setup.then);
  pendingRange = setup.from != null && setup.to != null ? { from: setup.from, to: setup.to } : null;
  return openView(setup.view);
}

function addKnown(target: Place) {
  const found = known.find((entry) => (entry.slug && entry.slug === target.slug) || (Math.abs(entry.latitude - target.latitude) < 0.01 && Math.abs(entry.longitude - target.longitude) < 0.01));
  if (found) return found;
  known.push(target);
  return target;
}

function fillCompare() {
  for (const [select, chosen] of [[page.cityA, pair[0]], [page.cityB, pair[1]]] as const) {
    select.innerHTML = "";
    known.forEach((entry, order) => {
      const option = new Option(entry.slug ? entry.name : placeName(entry), String(order));
      option.selected = entry === addKnown(chosen);
      select.add(option);
    });
  }
}

function markPresets() {
  page.presetList.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.setAttribute("aria-pressed", String(view === "place" && button.dataset.slug === place.slug));
  });
}

function placeChip(target: Place) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = target.slug ? target.name : placeName(target);
  if (target.slug) button.dataset.slug = target.slug;
  button.addEventListener("click", () => {
    place = addKnown(target);
    page.results.innerHTML = "";
    void showTrack(() => loadPlace(place, presets), "place");
  });
  const item = document.createElement("li");
  item.append(button);
  return item;
}

const tour = {
  active: false,
  chapter: 0,
  captions: [] as { step: number; text: string }[],
  shownCaption: -1,
};

interface Chapter {
  setup: () => Setup;
  range?: (track: ClimateTrack) => YearRange;
  captions: (track: ClimateTrack) => { step: number; text: string }[];
}

const fromYear = (track: ClimateTrack, year: number) => Math.max(0, track.points.findIndex((point) => point.position >= year));

const chapters: Chapter[] = [
  {
    setup: () => ({ view: "global", speed: 4 }),
    captions: (track) => {
      const recent = findingsFor({ ...track, points: track.points.slice(fromYear(track, 1980)) });
      const all = findingsFor(track);
      return [
        { step: 0, text: "Each note is one year. Higher means warmer than 1951–1980." },
        { step: fromYear(track, 1980), text: `From 1980: ${recent.find((item) => item.label === "Trend")?.value ?? ""}.` },
        { step: track.points.length - 1, text: `Warmest year: ${all.find((item) => item.label === "Warmest year")?.value ?? ""}.` },
      ];
    },
  },
  {
    setup: () => ({ view: "zones", speed: 4 }),
    captions: (track) => {
      const recent = findingsFor({ ...track, points: track.points.slice(fromYear(track, 1980)) });
      const fastest = recent.find((item) => item.label === "Fastest warming")?.value ?? "";
      return [
        { step: 0, text: "Arctic on the left, Tropics in the middle, Antarctic on the right." },
        { step: fromYear(track, 1980), text: `Since 1980, fastest warming: ${fastest}.` },
      ];
    },
  },
  {
    setup: () => ({ view: "place", city: dhaka, speed: 1 }),
    range: (track) => {
      const years = yearsIn(track.points).filter((year) => track.points.filter((point) => Math.floor(point.position) === year).length === 12);
      const last = years.at(-1) ?? Math.floor(track.points.at(-1)!.position);
      return { from: last - 2, to: last };
    },
    captions: (track) => {
      const peak = findingsFor(track).find((item) => item.label === "Rain peaks")?.value ?? "";
      const first = peak.split(/ & |, /)[0];
      const at = track.points.findIndex((point) => point.label.startsWith(first.slice(0, 3)));
      return [
        { step: 0, text: `${track.place?.name ?? "Dhaka"}, month by month. More notes mean more rain.` },
        ...(peak && at >= 0 ? [{ step: at, text: `Rain peaks in ${peak}.` }] : []),
      ];
    },
  },
];

function tourCaptionAt(stepNumber: number) {
  if (!tour.active) return;
  let latest = -1;
  tour.captions.forEach((caption, order) => caption.step <= stepNumber && (latest = order));
  if (latest < 0 || latest === tour.shownCaption) return;
  tour.shownCaption = latest;
  const text = tour.captions[latest].text;
  page.tourCaption.textContent = text;
  if (page.narrate.checked) speakAloud(text);
}

async function playChapter(order: number) {
  tour.chapter = order;
  tour.shownCaption = -1;
  tour.captions = [];
  page.tourStep.textContent = `${order + 1} / ${chapters.length}`;
  page.tourCaption.textContent = "…";
  const chapter = chapters[order];
  const ok = await applySetup(chapter.setup());
  if (!tour.active || tour.chapter !== order) return;
  if (!ok || !shown || !full) {
    page.tourCaption.textContent = "This part couldn't load. Skip to go on.";
    return;
  }
  if (chapter.range) setRange(chapter.range(full));
  tour.captions = chapter.captions(shown);
  if (!(await prepareAudio())) return;
  engine.narrate = false;
  startFrom(0);
  tourCaptionAt(0);
}

function nextChapter() {
  if (tour.chapter + 1 < chapters.length) {
    void playChapter(tour.chapter + 1);
    return;
  }
  halt();
  tour.captions = [];
  page.tourStep.textContent = "Done";
  page.tourCaption.textContent = "Now pick any view and press play.";
  if (page.narrate.checked) speakAloud(page.tourCaption.textContent);
}

async function startTour() {
  if (!(await prepareAudio())) return;
  tour.active = true;
  page.tour.hidden = false;
  page.tour.scrollIntoView({ block: "nearest" });
  void playChapter(0);
}

function leaveTour() {
  tour.active = false;
  tour.captions = [];
  page.tour.hidden = true;
  window.speechSynthesis?.cancel();
  engine.narrate = page.narrate.checked;
  halt();
  page.play.focus();
}

$("tour-start").addEventListener("click", startTour);
$("tour-skip").addEventListener("click", () => nextChapter());
$("tour-replay").addEventListener("click", () => void playChapter(page.tourStep.textContent === "Done" ? 0 : tour.chapter));
$("tour-leave").addEventListener("click", leaveTour);

function openData() {
  if (!shown) return;
  const meta = shown.meta;
  const rows: [string, string | HTMLElement][] = [["Dataset", meta.dataset]];
  if (meta.link) {
    const link = document.createElement("a");
    link.href = meta.link;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = meta.link.replace(/^https:\/\//, "");
    rows.push(["Source", link]);
  }
  rows.push(["Units", meta.units]);
  if (meta.baseline) rows.push(["Baseline", meta.baseline]);
  rows.push(["Coverage", meta.coverage]);
  if (range && full && !isFull(full.points, range)) rows.push(["Selected", rangeLabel(range)]);
  rows.push(["Retrieved", meta.retrieved ?? "Unknown"]);
  rows.push(["Status", meta.status === "live" ? "Live from NASA" : meta.status === "browser" ? "Saved in this browser" : "Saved copy in the app"]);
  rows.push(["Limits", meta.limit]);
  page.dataList.innerHTML = "";
  for (const [label, value] of rows) {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.append(value);
    page.dataList.append(term, detail);
  }
  exportUrls.forEach((url) => URL.revokeObjectURL(url));
  const csvUrl = URL.createObjectURL(new Blob([toCsv(shown)], { type: "text/csv" }));
  const notesUrl = URL.createObjectURL(new Blob([notes(shown, range && full && !isFull(full.points, range) ? rangeLabel(range) : "")], { type: "text/plain" }));
  exportUrls = [csvUrl, notesUrl];
  page.csv.href = csvUrl;
  page.csv.download = `${fileStem(shown)}.csv`;
  page.notes.href = notesUrl;
  page.notes.download = `${fileStem(shown)}-notes.txt`;
  page.data.showModal();
}

function openShare() {
  const setup = currentSetup();
  page.shareLink.value = `${location.origin}${location.pathname}${buildSetup(setup)}`;
  page.shareWarning.hidden = !sharesLocation(setup);
  page.copied.textContent = "";
  page.share.showModal();
  page.shareLink.select();
}

const savedKey = "earth-in-sound:setups";
type SavedSetup = { name: string; hash: string };

function readSaved(): SavedSetup[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(savedKey) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is SavedSetup => Boolean(item && typeof item.name === "string" && typeof item.hash === "string" && parseSetup(item.hash, presets))).slice(0, 8);
  } catch {
    return [];
  }
}

function renderSaved() {
  const entries = readSaved();
  page.savedList.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "muted";
    empty.textContent = "No saved setups yet.";
    page.savedList.append(empty);
    return;
  }
  entries.forEach((entry, index) => {
    const item = document.createElement("li");
    const load = document.createElement("button");
    load.type = "button";
    load.textContent = entry.name;
    load.addEventListener("click", async () => {
      const setup = parseSetup(entry.hash, presets);
      if (!setup) return;
      page.saved.close();
      await applySetup(setup);
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "quiet small";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${entry.name}`);
    remove.addEventListener("click", () => {
      entries.splice(index, 1);
      localStorage.setItem(savedKey, JSON.stringify(entries));
      renderSaved();
    });
    item.append(load, remove);
    page.savedList.append(item);
  });
}

$("open-saved").addEventListener("click", () => {
  page.savedNote.textContent = "";
  renderSaved();
  page.saved.showModal();
});
$("save-setup-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const setup = currentSetup();
  if (sharesLocation(setup)) {
    page.savedNote.textContent = "For privacy, a setup using your precise location can't be saved.";
    return;
  }
  const entries = readSaved();
  if (entries.length >= 8) {
    page.savedNote.textContent = "Remove a saved setup before adding another.";
    return;
  }
  const name = page.setupName.value.trim();
  if (!name) return;
  entries.push({ name: name.slice(0, 40), hash: buildSetup(setup) });
  try {
    localStorage.setItem(savedKey, JSON.stringify(entries));
    page.setupName.value = "";
    page.savedNote.textContent = "Saved on this device.";
    renderSaved();
  } catch {
    page.savedNote.textContent = "Couldn't save on this device. Check its available storage.";
  }
});

page.copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(page.shareLink.value);
    page.copied.textContent = "Copied";
  } catch {
    page.shareLink.select();
    page.copied.textContent = "Press Ctrl+C or ⌘C to copy";
  }
});

$("open-data").addEventListener("click", openData);
$("open-share").addEventListener("click", openShare);
$("open-about").addEventListener("click", () => page.about.showModal());
for (const dialog of [page.about, page.data, page.share, page.saved]) {
  dialog.querySelector("[data-close]")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => event.target === dialog && dialog.close());
}

page.play.addEventListener("click", togglePlay);
page.record.addEventListener("click", toggleRecording);
page.restart.addEventListener("click", () => {
  if (scheduled) engine.jumpTo(0);
  else showReadout(0);
});
page.scrub.addEventListener("input", () => jumpTo(Number(page.scrub.value)));
page.instrument.addEventListener("change", () => {
  engine.useLeadSound(page.instrument.value as LeadSound);
  remember();
});
page.narrate.addEventListener("change", () => {
  engine.narrate = page.narrate.checked && !tour.active;
  if (!page.narrate.checked) window.speechSynthesis?.cancel();
});
page.volume.addEventListener("input", () => engine.setVolume(Number(page.volume.value)));
page.speed.addEventListener("change", () => {
  remember();
  if (!scheduled) return;
  const wasPlaying = engine.playing;
  engine.load(steps, secondsPerStep(), engine.currentStep);
  if (wasPlaying) engine.play();
});
page.more.addEventListener("click", () => {
  const open = page.extra.hidden;
  page.extra.hidden = !open;
  page.more.setAttribute("aria-expanded", String(open));
});
page.from.addEventListener("change", () => setRange({ from: Number(page.from.value), to: Math.max(Number(page.from.value), Number(page.to.value)) }));
page.to.addEventListener("change", () => setRange({ from: Math.min(Number(page.from.value), Number(page.to.value)), to: Number(page.to.value) }));
page.rangeReset.addEventListener("click", () => setRange(null));

for (const [kind, tab] of Object.entries(page.tabs) as [TrackKind, HTMLButtonElement][]) {
  tab.addEventListener("click", () => {
    if (tour.active) leaveTour();
    if (kind !== view || !full) void openView(kind);
  });
  tab.addEventListener("keydown", (event) => {
    const destination = tabAfterKey(kind, event.key);
    if (!destination) return;
    event.preventDefault();
    page.tabs[destination].focus();
    if (tour.active) leaveTour();
    void openView(destination);
  });
}

document.addEventListener("keydown", (event) => {
  if (document.querySelector("dialog[open]")) return;
  const target = event.target as HTMLElement;
  if (["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A", "SUMMARY"].includes(target.tagName)) return;
  if (event.code === "Space") {
    event.preventDefault();
    void togglePlay();
  } else if (event.key === "ArrowRight") jumpTo(currentStep + (event.shiftKey ? 10 : 1));
  else if (event.key === "ArrowLeft") jumpTo(currentStep - (event.shiftKey ? 10 : 1));
});

page.presetList.append(...presets.map(placeChip));

page.search.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = page.query.value.trim();
  if (!query) return;
  if (!navigator.onLine) {
    page.results.innerHTML = "<li class='muted'>Offline. Choose a saved city.</li>";
    return;
  }
  page.results.innerHTML = "<li class='muted'>Searching…</li>";
  try {
    const found = await searchPlaces(query);
    page.results.innerHTML = found.length ? "" : "<li class='muted'>No match. Try another spelling.</li>";
    page.results.append(...found.map(placeChip));
  } catch {
    page.results.innerHTML = "<li class='muted'>Search unavailable. Choose a saved city.</li>";
  }
});

page.geo.addEventListener("click", () => {
  if (!navigator.geolocation) {
    say("Location isn't available here.");
    return;
  }
  say("Finding you…");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      place = addKnown({ name: "My location", latitude: Number(position.coords.latitude.toFixed(2)), longitude: Number(position.coords.longitude.toFixed(2)) });
      void showTrack(() => loadPlace(place, presets), "place");
    },
    () => say("Location off. Choose a city."),
    { timeout: 10000, maximumAge: 600000 },
  );
});

page.cityA.addEventListener("change", () => {
  pair = [known[Number(page.cityA.value)], pair[1]];
  void showTrack(() => loadComparison(pair[0], pair[1], presets), "compare");
});
page.cityB.addEventListener("change", () => {
  pair = [pair[0], known[Number(page.cityB.value)]];
  void showTrack(() => loadComparison(pair[0], pair[1], presets), "compare");
});

page.layer.addEventListener("change", () => void openScan());
page.month.addEventListener("change", () => page.month.value && void openScan());
page.thenNow.addEventListener("change", () => void openScan());
page.picture.addEventListener("change", () => void openScan());

function showConnection() {
  page.connection.hidden = navigator.onLine;
}
window.addEventListener("online", showConnection);
window.addEventListener("offline", showConnection);
showConnection();

window.addEventListener("error", (event) => {
  console.error(event.error ?? event.message);
  say("Something went wrong.", lastLoad ?? undefined);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error(event.reason);
  event.preventDefault();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && engine.playing) waveFrame = requestAnimationFrame(drawWave);
});

if (!engine.canRecord) page.recordNote.hidden = false;

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const returningVisitor = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (returningVisitor && !refreshing) {
      refreshing = true;
      location.reload();
    }
  });
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}offline-worker.js`, { updateViaCache: "none" })
    .then((registration) => {
      window.addEventListener("online", () => void registration.update().catch(console.error));
    }).catch(console.error);
}

fillIcons();
setPlayIcon(false);
latestMonths().then((months) => {
  for (const [layer, month] of Object.entries(months)) {
    if (month && layer in scanLayers) scanLayers[layer as keyof typeof scanLayers].latest = month;
  }
});

window.addEventListener("hashchange", () => {
  const setup = parseSetup(location.hash, presets);
  if (!setup) return;
  if (tour.active) leaveTour();
  void applySetup(setup);
});

const opening = parseSetup(location.hash, presets);
void applySetup(opening ?? { view: "global" });

startHome(presets, {
  open: (hash) => {
    const setup = hash ? parseSetup(hash, presets) : null;
    if (!setup) return;
    if (tour.active) leaveTour();
    void applySetup(setup);
  },
  tour: () => void startTour(),
  leave: () => {
    if (tour.active) leaveTour();
    else halt();
  },
});
