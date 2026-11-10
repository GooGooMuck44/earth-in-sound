import "./style.css";
import examplePlacesFile from "./presets.json";
import { ClimateChart } from "./chart";
import {
  loadGlobalTemperature,
  loadPlace,
  loadPolesAndTropics,
  searchPlaces,
  trendPerYear,
  yearlyAverages,
  type ClimateTrack,
  type Place,
  type TrackKind,
} from "./data";
import { SoundEngine, globalSteps, placeSteps, zoneSteps, type SoundStep } from "./sonify";

const examplePlaces = examplePlacesFile as Place[];
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const page = {
  tabs: {
    global: element("tab-global"),
    zones: element("tab-zones"),
    place: element("tab-place"),
  } as Record<TrackKind, HTMLElement>,
  placeTools: element("place-tools"),
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
  narrateToggle: element<HTMLInputElement>("narrate"),
  volumeSlider: element<HTMLInputElement>("vol"),
  status: element("status"),
  connection: element("connection"),
  soundGuide: element("mapping"),
  findings: element("facts"),
  source: element("source"),
};

const secondsPerStepAtNormalSpeed: Record<TrackKind, number> = { global: 0.5, zones: 0.5, place: 0.25 };

const engine = new SoundEngine();
const chart = new ClimateChart(element("chart"));

let track: ClimateTrack | null = null;
let steps: SoundStep[] = [];
let currentStep = 0;
let scheduled = false;
let latestRequest = 0;
let activeTab: TrackKind = "global";

const secondsPerStep = () =>
  track ? secondsPerStepAtNormalSpeed[track.kind] / Number(page.speedPicker.value) : 0.5;
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
  page.status.textContent = "Fetching NASA data…";
  try {
    const loaded = await loadTrack();
    if (request !== latestRequest) return;
    track = loaded;
    steps =
      loaded.kind === "global" ? globalSteps(loaded.points) : loaded.kind === "zones" ? zoneSteps(loaded.points) : placeSteps(loaded.points);
    currentStep = 0;
    page.title.textContent = loaded.title;
    page.source.textContent = `Source: ${loaded.source}`;
    chart.render(loaded);
    describeSound(loaded);
    describeFindings(loaded);
    showReadout(0);
    page.status.textContent = loaded.fromBackup ? "Showing a saved copy of the data, so the demo keeps working offline." : "";
    page.playButton.disabled = false;
    page.recordButton.disabled = !engine.canRecord;
  } catch (problem) {
    if (request !== latestRequest) return;
    console.error(problem);
    page.status.textContent = friendlyError() + (problem instanceof Error ? ` (${problem.message})` : "");
  }
}

function friendlyError() {
  if (activeTab === "place") return "Couldn't reach NASA POWER for this place. Try again, or pick one of the example places.";
  return "Couldn't load the NASA temperature record. Run `npm run data` once to save it into public/data/.";
}

function openTab(kind: TrackKind) {
  activeTab = kind;
  for (const [tabKind, tab] of Object.entries(page.tabs)) tab.setAttribute("aria-selected", String(tabKind === kind));
  page.placeTools.hidden = kind !== "place";
  if (kind === "place") {
    openPlace(placeFromAddress() ?? examplePlaces[0]);
    return;
  }
  history.replaceState(null, "", kind === "zones" ? "#track=zones" : location.pathname + location.search);
  showTrack(kind === "zones" ? loadPolesAndTropics : loadGlobalTemperature);
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

function placeFromAddress(): Place | null {
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
      ["Each note", "one year (half a second at 1× speed)"],
      ["Pitch", "global temperature anomaly: higher means hotter"],
      ["Brightness and hiss", "rise with the anomaly, like a heat haze"],
      ["Low bass note", "the start of each decade"],
    ],
    zones: [
      ["Each chord", "one year, three regions of Earth at once"],
      ["Left ear", "the Arctic (64°N–90°N), a bright plucked tone"],
      ["Centre", "the Tropics (24°S–24°N), a soft round tone"],
      ["Right ear", "the Antarctic (64°S–90°S), a buzzy tone"],
      ["Pitch", "all three share one scale, so you hear the Arctic climb away from the others"],
    ],
    place: [
      ["Each beat", "one month (a quarter second at 1× speed)"],
      ["Pitch", "air temperature at 2 m (T2M)"],
      ["Number of notes", "rainfall (PRECTOTCORR): rainy months patter with up to 4 notes"],
      ["Brightness", "sunshine reaching the ground (ALLSKY_SFC_SW_DWN): cloudy months sound muffled"],
      ["Low bass note", "every January"],
    ],
  };
  page.soundGuide.innerHTML = guide[shown.kind].map(([what, how]) => `<li><b>${what}</b>: ${how}</li>`).join("");
}

function warmingSinceStart(points: ClimateTrack["points"], read: (point: ClimateTrack["points"][number]) => number | undefined) {
  const early = points.filter((point) => point.position < 1910).map(read).filter(Number.isFinite) as number[];
  const recent = points.slice(-10).map(read).filter(Number.isFinite) as number[];
  return average(recent) - average(early);
}

function describeFindings(shown: ClimateTrack) {
  const findings: string[] = [];
  const points = shown.points;
  if (shown.kind === "global") {
    const warmest = points.reduce((best, point) => (point.temperature > best.temperature ? point : best));
    const since1980 = points.filter((point) => point.position >= 1980);
    const decadeTrend =
      trendPerYear(since1980.map((point) => point.position), since1980.map((point) => point.temperature)) * 10;
    findings.push(`The last 10 years averaged <b>${withSign(warmingSinceStart(points, (point) => point.temperature))} °C</b> warmer than ${points[0].position}–1909.`);
    findings.push(`Warmest year on record: <b>${warmest.label}</b> (${withSign(warmest.temperature)} °C vs 1951–1980).`);
    findings.push(`Since 1980 the planet has warmed about <b>${withSign(decadeTrend)} °C per decade</b>.`);
  } else if (shown.kind === "zones") {
    const arctic = warmingSinceStart(points, (point) => point.arctic);
    const tropics = warmingSinceStart(points, (point) => point.tropics);
    const antarctic = warmingSinceStart(points, (point) => point.antarctic);
    const planet = warmingSinceStart(points, (point) => point.temperature);
    findings.push(`The Arctic has warmed <b>${withSign(arctic)} °C</b> since 1880–1909, about <b>${(arctic / planet).toFixed(1)}×</b> the global ${withSign(planet)} °C.`);
    findings.push(`The Tropics warmed <b>${withSign(tropics)} °C</b> and the Antarctic <b>${withSign(antarctic)} °C</b> over the same span.`);
    findings.push(`Scientists call this <b>Arctic amplification</b>: melting ice uncovers dark ocean that soaks up more sunlight.`);
  } else {
    const years = yearlyAverages(points);
    if (years.length >= 5) {
      const decadeTrend = trendPerYear(years.map((entry) => entry.year), years.map((entry) => entry.temperature)) * 10;
      const warmestYear = years.reduce((best, entry) => (entry.temperature > best.temperature ? entry : best));
      findings.push(`Trend: <b>${withSign(decadeTrend)} °C per decade</b> (${years[0].year}–${years[years.length - 1].year}, yearly averages).`);
      findings.push(`Warmest year here: <b>${warmestYear.year}</b>, averaging ${oneDecimal(warmestYear.temperature)} °C.`);
    }
    const wettest = points.reduce((best, point) => ((point.rainfall ?? -1) > (best.rainfall ?? -1) ? point : best));
    const hottest = points.reduce((best, point) => (point.temperature > best.temperature ? point : best));
    findings.push(`Hottest month: <b>${hottest.label}</b> at ${oneDecimal(hottest.temperature)} °C.`);
    findings.push(`Wettest month: <b>${wettest.label}</b>, ${oneDecimal(wettest.rainfall)} mm of rain per day.`);
  }
  page.findings.innerHTML = findings.map((finding) => `<li>${finding}</li>`).join("");
}

function showReadout(stepNumber: number) {
  if (!track) return;
  currentStep = stepNumber;
  const point = track.points[stepNumber];
  page.nowLabel.textContent = point.label;
  page.nowValue.textContent =
    track.kind === "global"
      ? `${withSign(point.temperature)} °C`
      : track.kind === "zones"
        ? `Arctic ${withSign(point.arctic ?? NaN)} · Tropics ${withSign(point.tropics ?? NaN)} · Antarctic ${withSign(point.antarctic ?? NaN)} °C`
        : `${oneDecimal(point.temperature)} °C · rain ${oneDecimal(point.rainfall)} mm/day · sun ${oneDecimal(point.sunshine, 2)} kWh/m²/day`;
  chart.movePlayhead(stepNumber);
}

function showPlaying(isPlaying: boolean) {
  page.playButton.textContent = isPlaying ? "⏸" : "▶";
  page.playButton.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
}

async function prepareAudio() {
  try {
    await engine.init();
    engine.setVolume(Number(page.volumeSlider.value));
    return true;
  } catch (problem) {
    console.error(problem);
    page.status.textContent = "This browser blocked audio. Click play again, or try Chrome or Firefox.";
    return false;
  }
}

async function togglePlay() {
  if (!track || !(await prepareAudio())) return;
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
    page.status.textContent = "Recording isn't supported in this browser.";
    return;
  }
  page.recordButton.textContent = "⏹ Stop recording";
  page.status.textContent = "Recording… the song downloads when it ends or when you stop.";
  engine.play();
  showPlaying(true);
}

async function stopRecordingIfNeeded() {
  if (!engine.recording) return;
  page.recordButton.textContent = "⏺ Record song";
  const recording = await engine.finishRecording();
  if (!recording || !track) return;
  if (page.downloadLink.href) URL.revokeObjectURL(page.downloadLink.href);
  const fileName = track.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  page.downloadLink.href = URL.createObjectURL(recording);
  page.downloadLink.download = `earth-in-sound-${fileName}.webm`;
  page.downloadLink.hidden = false;
  page.status.textContent = "Your recording is ready to download.";
}

function jumpTo(stepNumber: number) {
  if (!track) return;
  const safeStep = Math.max(0, Math.min(track.points.length - 1, stepNumber));
  if (scheduled) engine.jumpTo(safeStep);
  else showReadout(safeStep);
}

engine.onStep = showReadout;
engine.onEnd = () => {
  showPlaying(false);
  scheduled = false;
  page.status.textContent = "Finished. Press play to hear it again.";
  stopRecordingIfNeeded();
};
chart.onJump = jumpTo;

page.playButton.addEventListener("click", togglePlay);
page.recordButton.addEventListener("click", recordFromStart);
page.restartButton.addEventListener("click", () => jumpTo(0));
page.narrateToggle.addEventListener("change", () => (engine.narrate = page.narrateToggle.checked));
page.volumeSlider.addEventListener("input", () => engine.setVolume(Number(page.volumeSlider.value)));
page.speedPicker.addEventListener("change", () => {
  if (!scheduled) return;
  const wasPlaying = engine.playing;
  engine.load(steps, secondsPerStep(), engine.currentStep);
  if (wasPlaying) engine.play();
});
for (const [kind, tab] of Object.entries(page.tabs)) tab.addEventListener("click", () => openTab(kind as TrackKind));

document.addEventListener("keydown", (event) => {
  const typingTarget = (event.target as HTMLElement).tagName;
  if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(typingTarget)) return;
  if (event.code === "Space") {
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
    page.searchResults.innerHTML = found.length ? "" : "<li class='muted'>No places found.</li>";
    page.searchResults.append(...found.map(placeChip));
  } catch {
    page.searchResults.innerHTML = "<li class='muted'>Search is unavailable right now. Try an example place.</li>";
  }
});

page.nearMeButton.addEventListener("click", () => {
  if (!navigator.geolocation) return;
  page.status.textContent = "Finding you…";
  navigator.geolocation.getCurrentPosition(
    (position) => openPlace({ name: "My location", latitude: position.coords.latitude, longitude: position.coords.longitude }),
    () => (page.status.textContent = "Location permission was denied. Search for your city instead."),
  );
});

function showConnection() {
  page.connection.hidden = navigator.onLine;
}
window.addEventListener("online", showConnection);
window.addEventListener("offline", showConnection);
showConnection();

window.addEventListener("error", (event) => {
  console.error(event.error ?? event.message);
  page.status.textContent = "Something went wrong, but the app is still running. Try play again or switch tracks.";
});
window.addEventListener("unhandledrejection", (event) => {
  console.error(event.reason);
  page.status.textContent = "A request failed, but the app is still running. Saved data will be used where possible.";
});

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}offline-worker.js`).catch((problem) => console.error(problem));
}

const startingAddress = new URLSearchParams(location.hash.slice(1));
openTab(placeFromAddress() ? "place" : startingAddress.get("track") === "zones" ? "zones" : "global");
