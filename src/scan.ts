import { fetchTimed, type ClimatePoint, type ClimateTrack } from "./data";

export type ScanLayer = "air" | "sea" | "plants" | "image";

interface LayerInfo {
  name: string;
  gibsLayer: string;
  colormap: string;
  units: string;
  first: string;
  latest: string;
  convert: (value: number) => number;
  digits: number;
}

export const scanLayers: Record<Exclude<ScanLayer, "image">, LayerInfo> = {
  air: {
    name: "Air temperature",
    gibsLayer: "MERRA2_2m_Air_Temperature_Assimilated_Monthly",
    colormap: "MERRA2_2m_Air_Temperature_Assimilated_Monthly",
    units: "°C",
    first: "1980-01",
    latest: "2026-08",
    convert: (kelvin) => kelvin - 273.15,
    digits: 1,
  },
  sea: {
    name: "Sea surface",
    gibsLayer: "GHRSST_L4_MUR_Sea_Surface_Temperature",
    colormap: "GHRSST_Sea_Surface_Temperature",
    units: "°C",
    first: "2002-06",
    latest: "2026-11",
    convert: (celsius) => celsius,
    digits: 1,
  },
  plants: {
    name: "Plants",
    gibsLayer: "MODIS_Terra_L3_NDVI_Monthly",
    colormap: "MODIS_L3_NDVI",
    units: "NDVI",
    first: "2000-03",
    latest: "2026-10",
    convert: (index) => index,
    digits: 2,
  },
};

export const thenYear = 1981;
export const scanColumns = 60;
export const scanBands = 8;
const gridWidth = 180;
const gridHeight = 90;
const gibsRoot = "https://gibs.earthdata.nasa.gov";
const siteRoot = import.meta.env.BASE_URL;

export interface ScanPicture {
  imageUrl: string;
  date: string;
  grid: number[];
  detail?: number[];
}

export interface ScanSpot {
  value: number;
  latitude: number;
  longitude: number;
}

export interface ScanDetails {
  layer: ScanLayer;
  units: string;
  digits: number;
  pictures: ScanPicture[];
  warmest: ScanSpot;
  coolest: ScanSpot;
  description: string;
  difference?: number;
}

type ColorEntry = { red: number; green: number; blue: number; value: number | null };

const savedFiles = { index: "gibs/index.json" };

const latitudeOf = (row: number) => 90 - ((row + 0.5) * 180) / gridHeight;
const longitudeOf = (column: number) => -180 + ((column + 0.5) * 360) / gridWidth;

export const longitudeLabel = (longitude: number) => {
  const rounded = Math.round(longitude);
  if (rounded === 0 || Math.abs(rounded) === 180) return `${Math.abs(rounded)}°`;
  return `${Math.abs(rounded)}°${rounded < 0 ? "W" : "E"}`;
};

const latitudeLabel = (latitude: number) => `${Math.abs(Math.round(latitude))}°${latitude < 0 ? "S" : "N"}`;

export function gibsImageUrl(layer: LayerInfo, date: string) {
  const query = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: layer.gibsLayer,
    CRS: "EPSG:4326",
    BBOX: "-90,-180,90,180",
    WIDTH: "720",
    HEIGHT: "360",
    FORMAT: "image/png",
    TRANSPARENT: "true",
    TIME: date,
  });
  return `${gibsRoot}/wms/epsg4326/best/wms.cgi?${query}`;
}

export const colormapUrl = (layer: LayerInfo) => `${gibsRoot}/colormaps/v1.3/${layer.colormap}.xml`;

export const gibsDate = (month: string) => `${month}-01`;

function readColormap(xml: string): ColorEntry[] {
  const entries: ColorEntry[] = [];
  for (const match of xml.matchAll(/<ColorMapEntry\b([^>]*)\/>/g)) {
    const attribute = (name: string) => match[1].match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
    const [red, green, blue] = (attribute("rgb") ?? "").split(",").map(Number);
    const range = attribute("value")?.match(/^[[(]\s*([^,]+),\s*([^\])]+)[\])]$/);
    let value: number | null = null;
    if (attribute("transparent") !== "true" && attribute("nodata") !== "true" && range) {
      const low = Number(range[1]);
      const high = Number(range[2]);
      value = Number.isFinite(low) && Number.isFinite(high) ? (low + high) / 2 : Number.isFinite(low) ? low : high;
    }
    entries.push({ red, green, blue, value: Number.isFinite(value) ? value : null });
  }
  if (!entries.some((entry) => entry.value !== null)) throw new Error("Colormap has no values");
  return entries;
}

function colorReader(entries: ColorEntry[]) {
  const remembered = new Map<number, number | null>();
  return (red: number, green: number, blue: number) => {
    const key = (red << 16) | (green << 8) | blue;
    if (remembered.has(key)) return remembered.get(key)!;
    let nearest = entries[0];
    let nearestGap = Infinity;
    for (const entry of entries) {
      const gap = (entry.red - red) ** 2 + (entry.green - green) ** 2 + (entry.blue - blue) ** 2;
      if (gap < nearestGap) {
        nearest = entry;
        nearestGap = gap;
      }
    }
    const value = nearestGap <= 300 ? nearest.value : null;
    remembered.set(key, value);
    return value;
  };
}

async function pixelsOf(imageUrl: string) {
  const picture = await new Promise<HTMLImageElement>((done, fail) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => done(image);
    image.onerror = () => fail(new Error("Image failed to load"));
    image.src = imageUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = gridWidth * 4;
  canvas.height = gridHeight * 4;
  const painter = canvas.getContext("2d", { willReadFrequently: true })!;
  painter.drawImage(picture, 0, 0, canvas.width, canvas.height);
  return painter.getImageData(0, 0, canvas.width, canvas.height);
}

function gridFrom(pixels: ImageData, readPixel: (red: number, green: number, blue: number) => number | null) {
  const grid: number[] = [];
  const blockWidth = pixels.width / gridWidth;
  const blockHeight = pixels.height / gridHeight;
  for (let row = 0; row < gridHeight; row++) {
    for (let column = 0; column < gridWidth; column++) {
      let total = 0;
      let count = 0;
      for (let y = Math.floor(row * blockHeight); y < Math.floor((row + 1) * blockHeight); y++) {
        for (let x = Math.floor(column * blockWidth); x < Math.floor((column + 1) * blockWidth); x++) {
          const at = (y * pixels.width + x) * 4;
          if (pixels.data[at + 3] < 128) continue;
          const value = readPixel(pixels.data[at], pixels.data[at + 1], pixels.data[at + 2]);
          if (value === null) continue;
          total += value;
          count++;
        }
      }
      grid.push(count ? total / count : NaN);
    }
  }
  return grid;
}

function warmthOf(red: number, green: number, blue: number) {
  const highest = Math.max(red, green, blue) / 255;
  const lowest = Math.min(red, green, blue) / 255;
  const saturation = highest === 0 ? 0 : (highest - lowest) / highest;
  let hue = 0;
  if (highest !== lowest) {
    const span = highest - lowest;
    const [r, g, b] = [red / 255, green / 255, blue / 255];
    hue = highest === r ? ((g - b) / span + 6) % 6 : highest === g ? (b - r) / span + 2 : (r - g) / span + 4;
    hue *= 60;
  }
  const hueWarmth = hue <= 240 ? 1 - hue / 240 : (hue - 240) / 120;
  return { level: saturation * hueWarmth * 0.6 + highest * 0.4, saturation, brightness: highest, hue };
}

function detailFrom(pixels: ImageData) {
  const detail: number[] = [];
  const blockWidth = pixels.width / gridWidth;
  const blockHeight = pixels.height / gridHeight;
  const brightnessAt = (x: number, y: number) => {
    const at = (y * pixels.width + x) * 4;
    return (pixels.data[at] + pixels.data[at + 1] + pixels.data[at + 2]) / 765;
  };
  for (let row = 0; row < gridHeight; row++) {
    for (let column = 0; column < gridWidth; column++) {
      let edges = 0;
      let saturation = 0;
      let count = 0;
      for (let y = Math.floor(row * blockHeight); y < Math.floor((row + 1) * blockHeight) - 1; y++) {
        for (let x = Math.floor(column * blockWidth); x < Math.floor((column + 1) * blockWidth) - 1; x++) {
          edges += Math.abs(brightnessAt(x + 1, y) - brightnessAt(x, y)) + Math.abs(brightnessAt(x, y + 1) - brightnessAt(x, y));
          const at = (y * pixels.width + x) * 4;
          saturation += warmthOf(pixels.data[at], pixels.data[at + 1], pixels.data[at + 2]).saturation;
          count++;
        }
      }
      detail.push(count ? Math.min(1, (edges / count) * 4 + (saturation / count) * 0.5) : 0);
    }
  }
  return detail;
}

const colourNames: [number, string][] = [
  [15, "red"], [45, "orange"], [70, "yellow"], [160, "green"], [200, "cyan"], [260, "blue"], [300, "purple"], [345, "pink"], [360, "red"],
];

function describeImage(pixels: ImageData, grid: number[]) {
  const tally = new Map<string, number>();
  for (let at = 0; at < pixels.data.length; at += 16) {
    if (pixels.data[at + 3] < 128) continue;
    const { saturation, brightness, hue } = warmthOf(pixels.data[at], pixels.data[at + 1], pixels.data[at + 2]);
    const name =
      brightness < 0.2 ? "black" : saturation < 0.2 ? (brightness > 0.8 ? "white" : "grey") : colourNames.find(([limit]) => hue < limit)![1];
    tally.set(name, (tally.get(name) ?? 0) + 1);
  }
  const main = [...tally].sort((first, second) => second[1] - first[1]).slice(0, 3).map(([name]) => name);
  const brightest = grid.reduce((best, value, at) => (value > grid[best] ? at : best), 0);
  const row = Math.floor(brightest / gridWidth);
  const column = brightest % gridWidth;
  const where = `${row < gridHeight / 3 ? "top" : row > (gridHeight * 2) / 3 ? "bottom" : "middle"} ${column < gridWidth / 3 ? "left" : column > (gridWidth * 2) / 3 ? "right" : "centre"}`;
  return `Mostly ${main.join(", ")}. Warmest and brightest area: ${where.replace("middle centre", "centre")}.`;
}

function spotsOf(grid: number[]) {
  let warmest = -1;
  let coolest = -1;
  grid.forEach((value, at) => {
    if (!Number.isFinite(value)) return;
    if (warmest < 0 || value > grid[warmest]) warmest = at;
    if (coolest < 0 || value < grid[coolest]) coolest = at;
  });
  const spot = (at: number): ScanSpot => ({
    value: grid[at],
    latitude: latitudeOf(Math.floor(at / gridWidth)),
    longitude: longitudeOf(at % gridWidth),
  });
  return { warmest: spot(warmest), coolest: spot(coolest) };
}

export const spotLabel = (spot: ScanSpot) => `${latitudeLabel(spot.latitude)} ${longitudeLabel(spot.longitude)}`;

function areaAverage(grid: number[]) {
  let total = 0;
  let weight = 0;
  grid.forEach((value, at) => {
    if (!Number.isFinite(value)) return;
    const share = Math.cos((latitudeOf(Math.floor(at / gridWidth)) * Math.PI) / 180);
    total += value * share;
    weight += share;
  });
  return weight ? total / weight : NaN;
}

function columnsOf(picture: ScanPicture, offset: number, dateLabel: string): ClimatePoint[] {
  const perColumn = gridWidth / scanColumns;
  const perBand = gridHeight / scanBands;
  return Array.from({ length: scanColumns }, (_, column) => {
    const bands = Array.from({ length: scanBands }, (_, band) => {
      const values: number[] = [];
      const details: number[] = [];
      for (let row = Math.round(band * perBand); row < Math.round((band + 1) * perBand); row++) {
        for (let x = column * perColumn; x < (column + 1) * perColumn; x++) {
          const value = picture.grid[row * gridWidth + x];
          if (Number.isFinite(value)) values.push(value);
          if (picture.detail) details.push(picture.detail[row * gridWidth + x]);
        }
      }
      return {
        value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN,
        detail: details.length ? details.reduce((sum, value) => sum + value, 0) / details.length : 1,
      };
    });
    const present = bands.map((band) => band.value).filter(Number.isFinite);
    const longitude = -180 + (column * 360) / scanColumns;
    return {
      position: offset + column,
      label: picture.detail
        ? `${Math.round(((column + 0.5) / scanColumns) * 100)}%`
        : dateLabel
          ? `${dateLabel} · ${longitudeLabel(longitude + 3)}`
          : longitudeLabel(longitude + 3),
      temperature: present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : NaN,
      bands: bands.map((band) => band.value),
      bandDetail: picture.detail ? bands.map((band) => band.detail) : undefined,
      longitude: longitude + 3,
    };
  });
}

type SavedIndex = { layers: Partial<Record<string, { date: string; image: string }>>; then?: { date: string; image: string } };

async function savedIndex(): Promise<SavedIndex | null> {
  try {
    const response = await fetchTimed(`${siteRoot}data/${savedFiles.index}`);
    return response.ok ? ((await response.json()) as SavedIndex) : null;
  } catch {
    return null;
  }
}

export async function latestMonths(): Promise<Partial<Record<string, string>>> {
  const index = await savedIndex();
  return Object.fromEntries(Object.entries(index?.layers ?? {}).map(([key, saved]) => [key, saved!.date.slice(0, 7)]));
}

const colormaps = new Map<string, Promise<ColorEntry[]>>();

function colormapFor(layer: LayerInfo) {
  if (!colormaps.has(layer.colormap)) {
    const read = async (url: string, waitMs?: number) => {
      const response = await fetchTimed(url, waitMs);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return readColormap(await response.text());
    };
    const loading = read(`${siteRoot}data/gibs/${layer.colormap}.xml`).catch(() => read(colormapUrl(layer), 15000));
    loading.catch(() => colormaps.delete(layer.colormap));
    colormaps.set(layer.colormap, loading);
  }
  return colormaps.get(layer.colormap)!;
}

async function pictureFor(key: Exclude<ScanLayer, "image">, month: string, savedFallback?: { date: string; image: string }) {
  const layer = scanLayers[key];
  const readPixel = colorReader(await colormapFor(layer));
  const date = gibsDate(month);
  try {
    const pixels = await withTimeout(pixelsOf(gibsImageUrl(layer, date)), 15000);
    return { picture: { imageUrl: gibsImageUrl(layer, date), date, grid: gridFrom(pixels, readPixel) }, fromBackup: false };
  } catch (problem) {
    if (!savedFallback) throw problem;
    const imageUrl = `${siteRoot}data/${savedFallback.image}`;
    const pixels = await pixelsOf(imageUrl);
    return { picture: { imageUrl, date: savedFallback.date, grid: gridFrom(pixels, readPixel) }, fromBackup: true };
  }
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number) {
  return Promise.race([work, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("GIBS too slow")), timeoutMs))]);
}

const monthLabel = (date: string) => {
  const [year, month] = date.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1]} ${year}`;
};

export async function loadScan(key: Exclude<ScanLayer, "image">, month: string, thenVsNow: boolean): Promise<ClimateTrack> {
  const layer = scanLayers[key];
  const index = await savedIndex();
  const saved = index?.layers[key];
  const now = await pictureFor(key, month, saved);
  const pictures = [now.picture];
  let fromBackup = now.fromBackup;
  if (thenVsNow && key === "air") {
    const thenMonth = `${thenYear}${now.picture.date.slice(4, 7)}`;
    const then = await pictureFor(key, thenMonth, index?.then);
    pictures.unshift(then.picture);
    fromBackup ||= then.fromBackup;
  }
  const grids = pictures.map((picture) => picture.grid.map((value) => layer.convert(value)));
  pictures.forEach((picture, order) => (picture.grid = grids[order]));
  const { warmest, coolest } = spotsOf(grids.at(-1)!);
  const scan: ScanDetails = {
    layer: key,
    units: layer.units,
    digits: layer.digits,
    pictures,
    warmest,
    coolest,
    description: `NASA GIBS ${layer.name.toLowerCase()} map, ${monthLabel(now.picture.date)}.`,
    difference: pictures.length > 1 ? areaAverage(grids[1]) - areaAverage(grids[0]) : undefined,
  };
  const points = pictures.flatMap((picture, order) =>
    columnsOf(picture, order * scanColumns, pictures.length > 1 ? picture.date.slice(0, 4) : ""),
  );
  return {
    kind: "scan",
    title: pictures.length > 1 ? `${layer.name} ${monthLabel(pictures[0].date)} vs ${monthLabel(pictures[1].date)}` : `${layer.name} ${monthLabel(now.picture.date)}`,
    source: `NASA GIBS · ${layer.gibsLayer}${fromBackup ? " · saved copy" : ""}`,
    points,
    fromBackup,
    scan,
  };
}

export async function loadImageScan(file: File): Promise<ClimateTrack> {
  const imageUrl = URL.createObjectURL(file);
  const pixels = await pixelsOf(imageUrl);
  const grid = gridFrom(pixels, (red, green, blue) => warmthOf(red, green, blue).level * 100);
  const picture: ScanPicture = { imageUrl, date: "", grid, detail: detailFrom(pixels) };
  const { warmest, coolest } = spotsOf(grid);
  return {
    kind: "scan",
    title: file.name.replace(/\.[^.]+$/, ""),
    source: "Your image · colour and brightness",
    points: columnsOf(picture, 0, ""),
    scan: {
      layer: "image",
      units: "%",
      digits: 0,
      pictures: [picture],
      warmest,
      coolest,
      description: describeImage(pixels, grid),
    },
  };
}
