import "./style.css";
import presetFile from "./presets.json";
import { ClimateChart } from "./chart";
import {
  loadGlobal,
  loadPlace,
  loadEvents,
  loadLiveEvents,
  loadZones,
  searchPlaces,
  trendPerYear,
  yearlyAverages,
  type ClimateTrack,
  type Place,
  type TrackKind,
} from "./data";
import {
  SoundEngine,
  eventSteps,
  globalSteps,
  placeSteps,
  scanSteps,
  shouldLoopPlayback,
  supportsLeadSound,
  zoneSteps,
  type LeadSound,
  type SoundStep,
} from "./sonify";
import { tabAfterKey } from "./ui";
import { latestMonths, loadImageScan, loadScan, scanLayers, spotLabel, type ScanLayer } from "./scan";

const examplePlaces = presetFile as Place[];
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const page = {
  tabs: {
    global: element("tab-global"),
    zones: element("tab-zones"),
    place: element("tab-place"),
    events: element("tab-events"),
    scan: element("tab-scan"),
  } as Record<TrackKind, HTMLElement>,
  placeTools: element("place-tools"),
  scanTools: element("scan-tools"),
  layerPicker: element<HTMLSelectElement>("layer"),
  monthPicker: element<HTMLInputElement>("month"),
  thenNowToggle: element<HTMLInputElement>("then-now"),
  thenNowLabel: element("then-now-label"),
  picturePicker: element<HTMLInputElement>("picture"),
  pictureWords: element("picture-words"),
  searchForm: element<HTMLFormElement>("search"),
  searchBox: element<HTMLInputElement>("q"),
  nearMeButton: element("geo"),
  searchResults: element("results"),
  exampleList: element("presets"),
  title: element("title"),
  playButton: element<HTMLButtonElement>("play"),
  restartButton: element("restart"),
  recordButton: element<HTMLButtonElement>("record"),
  downloadLink: element<HTMLAnchorElement>("download"),
  nowLabel: element("now-label"),
  nowValue: element("now-value"),
  speedPicker: element<HTMLSelectElement>("speed"),
  instrumentPicker: element<HTMLSelectElement>("instrument"),
  instrumentControl: element("instrument-control"),
  loopToggle: element<HTMLInputElement>("loop"),
  narrateToggle: element<HTMLInputElement>("narrate"),
  volumeSlider: element<HTMLInputElement>("vol"),
  status: element("status"),
  connection: element("connection"),
  firstListenHint: element("first-listen-hint"),
  headphonesHint: element("headphones-hint"),
  soundGuide: element("mapping"),
  findings: element("facts"),
  source: element("source"),
};

const stepSeconds: Record<TrackKind, number> = { global: 0.5, zones: 0.5, place: 0.25, events: 0.4, scan: 0.25 };

const engine = new SoundEngine();
const chart = new ClimateChart(element("chart"));

let track: ClimateTrack | null = null;
let steps: SoundStep[] = [];
let currentStep = 0;
let scheduled = false;
let latestRequest = 0;
let activeTab: TrackKind = "global";

const secondsPerStep = () =>
  track ? stepSeconds[track.kind] / Number(page.speedPicker.value) : 0.5;
const oneDecimal = (value: number | undefined, digits = 1) =>
  value == null || !Number.isFinite(value) ? "–" : value.toFixed(digits);
const withSign = (value: number, digits = 2) =>
  (value > 0 ? "+" : value < 0 ? "−" : "") + Math.abs(value).toFixed(digits);
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

async function showTrack(loadTrack: () => Promise<ClimateTrack>) {
  const request = ++latestRequest;
  await stopRecordingIfNeeded();
  engine.stop();
  showPlaying(false);
  scheduled = false;
  page.playButton.disabled = true;
  page.recordButton.disabled = true;
  page.downloadLink.hidden = true;
  page.status.textContent = "Loading…";
  try {
    const loaded = await loadTrack();
    if (request !== latestRequest) return;
    track = loaded;
    const stepMakers = { global: globalSteps, zones: zoneSteps, place: placeSteps, events: eventSteps, scan: scanSteps };
    steps = stepMakers[loaded.kind](loaded.points);
    currentStep = 0;
    page.title.textContent = loaded.title;
    page.source.textContent = loaded.source;
    chart.render(loaded);
    describeSound(loaded);
    showFacts(loaded);
    showReadout(0);
    page.status.textContent = loaded.notice ?? (loaded.fromBackup ? "Using saved data." : "");
    const instrumentAvailable = supportsLeadSound(loaded.kind);
    page.instrumentPicker.disabled = !instrumentAvailable;
    page.instrumentControl.setAttribute(
      "title",
      instrumentAvailable ? "Choose the lead instrument" : "This track uses its own fixed instruments",
    );
    page.headphonesHint.hidden = loaded.kind !== "zones";
    page.pictureWords.hidden = !loaded.scan;
    page.pictureWords.textContent = loaded.scan?.description ?? "";
    page.playButton.disabled = false;
    page.recordButton.disabled = !engine.canRecord;
  } catch (problem) {
    if (request !== latestRequest) return;
    console.error(problem);
    page.status.textContent = friendlyError();
  }
}

function friendlyError() {
  if (activeTab === "scan") return page.layerPicker.value === "image" ? "Couldn't read that image." : "Couldn't reach NASA GIBS.";
  if (activeTab === "place") return "NASA POWER is unavailable. Choose a saved example city and try again.";
  if (activeTab === "events") return "NASA EONET is unavailable. Reconnect and try again.";
  return "NASA data couldn't load. Reconnect and try again.";
}

function openTab(kind: TrackKind) {
  activeTab = kind;
  for (const [tabKind, tab] of Object.entries(page.tabs)) {
    const selected = tabKind === kind;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  page.placeTools.hidden = kind !== "place";
  page.headphonesHint.hidden = kind !== "zones";
  page.scanTools.hidden = kind !== "scan";
  page.pictureWords.hidden = kind !== "scan";
  if (kind === "place") {
    openPlace(placeFromUrl() ?? examplePlaces[0]);
    return;
  }
  if (kind === "scan") {
    openScan();
    return;
  }
  history.replaceState(null, "", kind === "global" ? location.pathname + location.search : `#track=${kind}`);
  const loaders = { global: loadGlobal, zones: loadZones, events: loadEvents };
  showTrack(loaders[kind as keyof typeof loaders]).then(() => {
    if (kind === "events") refreshEvents();
  });
}

function openScan() {
  const layer = page.layerPicker.value as ScanLayer;
  const usingImage = layer === "image";
  page.picturePicker.hidden = !usingImage;
  page.monthPicker.hidden = usingImage;
  page.thenNowLabel.hidden = layer !== "air";
  if (usingImage) {
    history.replaceState(null, "", "#track=scan&layer=image");
    const file = page.picturePicker.files?.[0];
    if (file) showTrack(() => loadImageScan(file));
    else page.status.textContent = "Choose an image";
    return;
  }
  const info = scanLayers[layer];
  page.monthPicker.min = info.first;
  page.monthPicker.max = info.latest;
  if (!page.monthPicker.value || page.monthPicker.value > info.latest || page.monthPicker.value < info.first) {
    page.monthPicker.value = info.latest;
  }
  const month = page.monthPicker.value;
  const thenVsNow = layer === "air" && page.thenNowToggle.checked;
  history.replaceState(null, "", `#${new URLSearchParams({ track: "scan", layer, month, ...(thenVsNow ? { then: "1" } : {}) })}`);
  showTrack(() => loadScan(layer, month, thenVsNow));
}

async function refreshEvents() {
  const request = latestRequest;
  try {
    const live = await loadLiveEvents();
    if (request !== latestRequest || scheduled || engine.recording) return;
    await showTrack(async () => live);
  } catch (problem) {
    console.error(problem);
    if (request === latestRequest) page.status.textContent = "Using saved EONET data. Live update unavailable.";
  }
}

function openPlace(place: Place) {
  const address = new URLSearchParams({
    lat: place.latitude.toFixed(3),
    lon: place.longitude.toFixed(3),
    name: place.name,
    ...(place.country ? { country: place.country } : {}),
    ...(place.slug ? { slug: place.slug } : {}),
  });
  history.replaceState(null, "", `#${address}`);
  page.searchResults.innerHTML = "";
  showTrack(() => loadPlace(place, examplePlaces));
}

function placeFromUrl(): Place | null {
  const address = new URLSearchParams(location.hash.slice(1));
  const latitude = Number(address.get("lat"));
  const longitude = Number(address.get("lon"));
  if (!address.has("lat") || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    name: address.get("name") ?? "Selected place",
    country: address.get("country") ?? undefined,
    slug: address.get("slug") ?? undefined,
  };
}

function describeSound(shown: ClimateTrack) {
  const guide: Record<TrackKind, [string, string][]> = {
    global: [
      ["Note", "one year"],
      ["Pitch", "temperature"],
      ["Hiss", "heat"],
      ["Bass", "new decade"],
    ],
    zones: [
      ["Left", "Arctic"],
      ["Centre", "Tropics"],
      ["Right", "Antarctic"],
      ["Pitch", "temperature"],
    ],
    place: [
      ["Beat", "one month"],
      ["Pitch", "temperature"],
      ["Notes", "rain"],
      ["Brightness", "sunshine"],
      ["Bass", "January"],
    ],
    events: [
      ["Beat", "one day"],
      ["Crackle", "wildfire"],
      ["Drum", "storm · volcano"],
      ["Bell", "ice · snow"],
      ["Pluck", "other"],
      ["Left ↔ right", "west ↔ east"],
    ],
    scan: [
      ["Line", "sweeps west → east"],
      ["Notes", "north → south"],
      ["Pitch", "value"],
      ["Left ↔ right", "west ↔ east"],
      ["Brightness", "column average"],
    ],
  };
  if (shown.scan?.layer === "image") {
    guide.scan = [
      ["Line", "sweeps left → right"],
      ["Pitch", "warm colour · brightness"],
      ["Notes", "detail · colour"],
      ["Left ↔ right", "left ↔ right"],
    ];
  }
  page.soundGuide.innerHTML = guide[shown.kind].map(([what, how]) => `<li><b>${what}</b>: ${how}</li>`).join("");
}

function warming(points: ClimateTrack["points"], read: (point: ClimateTrack["points"][number]) => number | undefined) {
  const early = points.filter((point) => point.position < 1910).map(read).filter(Number.isFinite) as number[];
  const recent = points.slice(-10).map(read).filter(Number.isFinite) as number[];
  return average(recent) - average(early);
}

function showFacts(shown: ClimateTrack) {
  const findings: string[] = [];
  const points = shown.points;
  const scan = shown.scan;
  if (scan) {
    const shownValue = (value: number) => `${value.toFixed(scan.digits)} ${scan.units}`;
    if (scan.layer === "image") {
      findings.push(scan.description);
    } else {
      findings.push(`Warmest: <b>${shownValue(scan.warmest.value)}</b> near ${spotLabel(scan.warmest)}`);
      findings.push(`Coolest: <b>${shownValue(scan.coolest.value)}</b> near ${spotLabel(scan.coolest)}`);
      if (scan.difference != null) findings.push(`Average change: <b>${withSign(scan.difference)} ${scan.units}</b>`);
      findings.push(`Date: <b>${scan.pictures.map((picture) => picture.date).join(" · ")}</b>`);
    }
    if (scan.layer === "plants") findings[0] = findings[0].replace("Warmest", "Greenest");
    if (scan.layer === "plants") findings[1] = findings[1].replace("Coolest", "Barest");
  } else if (shown.kind === "global") {
    const warmest = points.reduce((best, point) => (point.temperature > best.temperature ? point : best));
    const since1980 = points.filter((point) => point.position >= 1980);
    const decadeTrend =
      trendPerYear(since1980.map((point) => point.position), since1980.map((point) => point.temperature)) * 10;
    findings.push(`<b>${withSign(warming(points, (point) => point.temperature))} °C</b> since 1880–1909`);
    findings.push(`Warmest year: <b>${warmest.label}</b>`);
    findings.push(`<b>${withSign(decadeTrend)} °C</b> per decade since 1980`);
  } else if (shown.kind === "zones") {
    const arctic = warming(points, (point) => point.arctic);
    const tropics = warming(points, (point) => point.tropics);
    const antarctic = warming(points, (point) => point.antarctic);
    const planet = warming(points, (point) => point.temperature);
    findings.push(`Arctic <b>${withSign(arctic)} °C</b>, <b>${(arctic / planet).toFixed(1)}×</b> the global rate`);
    findings.push(`Tropics <b>${withSign(tropics)} °C</b> · Antarctic <b>${withSign(antarctic)} °C</b>`);
  } else if (shown.kind === "events") {
    const countOf = (category: string) => shown.eventTotals?.[category] ?? 0;
    const busiest = points.reduce((best, point) => (point.temperature > best.temperature ? point : best));
    findings.push(`Wildfires <b>${countOf("wildfires")}</b> · Storms <b>${countOf("severeStorms")}</b> · Floods <b>${countOf("floods")}</b> · Volcanoes <b>${countOf("volcanoes")}</b>`);
    findings.push(`Busiest day: <b>${busiest.label}</b> (${busiest.temperature})`);
  } else {
    const years = yearlyAverages(points);
    if (years.length >= 5) {
      const decadeTrend = trendPerYear(years.map((entry) => entry.year), years.map((entry) => entry.temperature)) * 10;
      const warmestYear = years.reduce((best, entry) => (entry.temperature > best.temperature ? entry : best));
      findings.push(`<b>${withSign(decadeTrend)} °C</b> per decade`);
      findings.push(`Warmest year: <b>${warmestYear.year}</b>`);
    }
    const wettest = points.reduce((best, point) => ((point.rainfall ?? -1) > (best.rainfall ?? -1) ? point : best));
    const hottest = points.reduce((best, point) => (point.temperature > best.temperature ? point : best));
    findings.push(`Hottest month: <b>${hottest.label}</b>`);
    findings.push(`Wettest month: <b>${wettest.label}</b>`);
  }
  page.findings.innerHTML = findings.map((finding) => `<li>${finding}</li>`).join("");
}

function showReadout(stepNumber: number) {
  if (!track) return;
  currentStep = stepNumber;
  const point = track.points[stepNumber];
  page.nowLabel.textContent = point.label;
  page.nowValue.textContent =
    track.scan
      ? Number.isFinite(point.temperature)
        ? `${point.temperature.toFixed(track.scan.digits)} ${track.scan.units}`
        : "no data"
      : track.kind === "global"
      ? `${withSign(point.temperature)} °C`
      : track.kind === "events"
        ? `${point.temperature} events${point.headlines?.length ? ` · ${point.headlines.slice(0, 3).join(" · ")}` : ""}`
        : track.kind === "zones"
        ? `${withSign(point.arctic ?? NaN)} · ${withSign(point.tropics ?? NaN)} · ${withSign(point.antarctic ?? NaN)} °C`
        : `${oneDecimal(point.temperature)} °C · ${oneDecimal(point.rainfall)} mm/day · ${oneDecimal(point.sunshine)} MJ/m²/day`;
  chart.movePlayhead(stepNumber);
}

const wave = element<HTMLCanvasElement>("wave");
let waveFrame = 0;

function drawWave() {
  const pen = wave.getContext("2d");
  if (!pen) return;
  const ratio = window.devicePixelRatio || 1;
  wave.width = wave.clientWidth * ratio;
  wave.height = wave.clientHeight * ratio;
  pen.clearRect(0, 0, wave.width, wave.height);
  const samples = engine.wave?.getValue();
  pen.lineWidth = 2 * ratio;
  pen.strokeStyle = "#3ddc84";
  pen.shadowColor = "#3ddc84";
  pen.shadowBlur = 8 * ratio;
  pen.beginPath();
  const count = samples?.length ?? 2;
  for (let at = 0; at < count; at++) {
    const x = (at / (count - 1)) * wave.width;
    const y = wave.height / 2 - (samples ? samples[at] : 0) * wave.height * 1.6;
    if (at) pen.lineTo(x, y);
    else pen.moveTo(x, y);
  }
  pen.stroke();
  if (engine.playing) waveFrame = requestAnimationFrame(drawWave);
}

function showPlaying(isPlaying: boolean) {
  page.playButton.classList.toggle("playing", isPlaying);
  cancelAnimationFrame(waveFrame);
  if (isPlaying) waveFrame = requestAnimationFrame(drawWave);
  else requestAnimationFrame(drawWave);
  page.playButton.textContent = isPlaying ? "⏸" : "▶";
  page.playButton.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
}

async function prepareAudio() {
  try {
    await engine.init();
    engine.setVolume(Number(page.volumeSlider.value));
    engine.useLeadSound(page.instrumentPicker.value as LeadSound);
    return true;
  } catch (problem) {
    console.error(problem);
    page.status.textContent = "Audio blocked. Tap play again.";
    return false;
  }
}

async function togglePlay() {
  if (!track || !(await prepareAudio())) return;
  page.firstListenHint.hidden = true;
  if (engine.playing) {
    engine.pause();
    showPlaying(false);
    await stopRecordingIfNeeded();
    return;
  }
  if (!scheduled) {
    engine.load(steps, secondsPerStep(), currentStep >= steps.length - 1 ? 0 : currentStep);
    scheduled = true;
  }
  engine.play();
  showPlaying(true);
}

async function recordFromStart() {
  if (!track || !(await prepareAudio())) return;
  page.firstListenHint.hidden = true;
  if (engine.recording) {
    engine.pause();
    showPlaying(false);
    await stopRecordingIfNeeded();
    return;
  }
  page.downloadLink.hidden = true;
  engine.load(steps, secondsPerStep(), 0);
  scheduled = true;
  if (!engine.startRecording()) {
    page.status.textContent = "Recording not supported.";
    return;
  }
  page.recordButton.textContent = "⏹ Stop";
  page.status.textContent = "Recording…";
  engine.play();
  showPlaying(true);
}

async function stopRecordingIfNeeded() {
  if (!engine.recording) return;
  page.recordButton.textContent = "⏺ Record";
  const recording = await engine.finishRecording();
  if (!recording || !track) return;
  if (page.downloadLink.href) URL.revokeObjectURL(page.downloadLink.href);
  const fileName = track.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  page.downloadLink.href = URL.createObjectURL(recording);
  page.downloadLink.download = `earth-in-sound-${fileName}.webm`;
  page.downloadLink.hidden = false;
  page.status.textContent = "";
}

function jumpTo(stepNumber: number) {
  if (!track) return;
  const safeStep = Math.max(0, Math.min(track.points.length - 1, stepNumber));
  if (scheduled) engine.jumpTo(safeStep);
  else showReadout(safeStep);
}

engine.onStep = showReadout;
engine.onEnd = () => {
  if (shouldLoopPlayback(page.loopToggle.checked, engine.recording)) {
    engine.load(steps, secondsPerStep(), 0);
    engine.play();
    return;
  }
  showPlaying(false);
  scheduled = false;
  page.status.textContent = "";
  stopRecordingIfNeeded();
};
chart.onJump = jumpTo;

page.playButton.addEventListener("click", togglePlay);
page.recordButton.addEventListener("click", recordFromStart);
page.restartButton.addEventListener("click", () => jumpTo(0));
page.instrumentPicker.addEventListener("change", () => engine.useLeadSound(page.instrumentPicker.value as LeadSound));
page.narrateToggle.addEventListener("change", () => (engine.narrate = page.narrateToggle.checked));
page.volumeSlider.addEventListener("input", () => engine.setVolume(Number(page.volumeSlider.value)));
page.speedPicker.addEventListener("change", () => {
  if (!scheduled) return;
  const wasPlaying = engine.playing;
  engine.load(steps, secondsPerStep(), engine.currentStep);
  if (wasPlaying) engine.play();
});
for (const [kind, tab] of Object.entries(page.tabs)) {
  tab.addEventListener("click", () => openTab(kind as TrackKind));
  tab.addEventListener("keydown", (event) => {
    const destination = tabAfterKey(kind as TrackKind, event.key);
    if (!destination) return;
    event.preventDefault();
    page.tabs[destination].focus();
    openTab(destination);
  });
}

document.addEventListener("keydown", (event) => {
  const typingTarget = (event.target as HTMLElement).tagName;
  if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(typingTarget)) return;
  if (event.code === "Space" && typingTarget !== "BUTTON" && typingTarget !== "A") {
    event.preventDefault();
    togglePlay();
  } else if (event.key === "ArrowRight") jumpTo(currentStep + (event.shiftKey ? 10 : 1));
  else if (event.key === "ArrowLeft") jumpTo(currentStep - (event.shiftKey ? 10 : 1));
});

const placeChip = (place: Place) => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = place.country ? `${place.name}, ${place.country}` : place.name;
  button.addEventListener("click", () => openPlace(place));
  const item = document.createElement("li");
  item.appendChild(button);
  return item;
};

page.exampleList.append(...examplePlaces.map(placeChip));

page.searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = page.searchBox.value.trim();
  if (!query) return;
  page.searchResults.innerHTML = "<li class='muted'>Searching…</li>";
  try {
    const found = await searchPlaces(query);
    page.searchResults.innerHTML = found.length ? "" : "<li class='muted'>No results</li>";
    page.searchResults.append(...found.map(placeChip));
  } catch {
    page.searchResults.innerHTML = "<li class='muted'>Search unavailable. Choose a saved city below.</li>";
  }
});

page.nearMeButton.addEventListener("click", () => {
  if (!navigator.geolocation) return;
  page.status.textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(
    (position) => openPlace({ name: "My location", latitude: position.coords.latitude, longitude: position.coords.longitude }),
    () => (page.status.textContent = "Location denied"),
  );
});

function showConnection() {
  page.connection.hidden = navigator.onLine;
  if (!navigator.onLine && activeTab === "place") {
    page.status.textContent = "Offline: search needs a connection. Saved example cities still work.";
  }
}
window.addEventListener("online", showConnection);
window.addEventListener("offline", showConnection);
showConnection();

window.addEventListener("error", (event) => {
  console.error(event.error ?? event.message);
  page.status.textContent = "Something went wrong. Try again.";
});
window.addEventListener("unhandledrejection", (event) => {
  console.error(event.reason);
  page.status.textContent = "Network issue. Using saved data.";
});

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}offline-worker.js`).catch((problem) => console.error(problem));
}

const opening = new URLSearchParams(location.hash.slice(1));
const requestedTrack = opening.get("track");
if (requestedTrack === "scan") {
  const layer = opening.get("layer");
  if (layer && [...page.layerPicker.options].some((option) => option.value === layer)) page.layerPicker.value = layer;
  if (opening.get("month")) page.monthPicker.value = opening.get("month")!;
  page.thenNowToggle.checked = opening.get("then") === "1";
}
latestMonths().then((months) => {
  for (const [layer, month] of Object.entries(months)) {
    if (month && layer in scanLayers) scanLayers[layer as keyof typeof scanLayers].latest = month;
  }
});
page.layerPicker.addEventListener("change", () => openScan());
page.monthPicker.addEventListener("change", () => page.monthPicker.value && openScan());
page.thenNowToggle.addEventListener("change", () => openScan());
page.picturePicker.addEventListener("change", () => openScan());
openTab(
  placeFromUrl()
    ? "place"
    : requestedTrack === "zones" || requestedTrack === "events" || requestedTrack === "scan"
      ? requestedTrack
      : "global",
);
