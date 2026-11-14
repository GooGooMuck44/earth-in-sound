import { mkdir, readFile, writeFile, rename } from "node:fs/promises";

import { validateYears, validatePower } from './validate-nasa.mjs';

const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7).split(',');
const groups = ['global', 'zones', 'eonet', 'gibs', 'power'];
if (only?.some((group) => !groups.includes(group))) throw new Error('Unknown --only group. Use ' + groups.join(','));
const selected = (group) => !only || only.includes(group);

const globalCsvUrl = "https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv";
const zonalCsvUrl = "https://data.giss.nasa.gov/gistemp/tabledata_v4/ZonAnn.Ts+dSST.csv";
const powerFirstYear = 2001;
const dataFolder = new URL("../public/data/", import.meta.url);
const examplePlaces = JSON.parse(await readFile(new URL("../src/presets.json", import.meta.url), "utf8"));
await mkdir(new URL("places/", dataFolder), { recursive: true });

let failed = 0;

async function download(url, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "earth-in-sound (Space Apps project)" },
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resume) => setTimeout(resume, 2000 * attempt));
    }
  }
}

function readCsvTable(csvText) {
  const lines = csvText.split(/\r?\n/);
  const headerLine = lines.findIndex((line) => line.startsWith("Year,"));
  if (headerLine < 0) throw new Error("unexpected CSV layout");
  const columns = lines[headerLine].split(",").map((cell) => cell.trim());
  const rows = lines
    .slice(headerLine + 1)
    .map((line) => line.split(","))
    .filter((cells) => Number.isFinite(Number(cells[0])) && cells[0] !== "");
  return { columns, rows };
}

const readNumber = (cell) => (cell?.trim() && cell.trim() !== "***" && Number.isFinite(Number(cell)) ? Number(cell) : null);

async function saveJson(name, content) {
  const target = new URL(name, dataFolder);
  const temporary = new URL(name + '.tmp', dataFolder);
  await writeFile(temporary, JSON.stringify({ ...content, fetched: new Date().toISOString() }));
  await rename(temporary, target);
}

if (selected("global")) try {
  const { columns, rows } = readCsvTable(await (await download(globalCsvUrl)).text());
  const annualColumn = columns.indexOf("J-D");
  if (annualColumn < 0) throw new Error("GISTEMP is missing J-D column");
  const years = rows
    .map((cells) => ({ year: Number(cells[0]), anomaly: readNumber(cells[annualColumn]) }))
    .filter((entry) => entry.anomaly !== null);
  validateYears(years, ["anomaly"]);
  await saveJson("gistemp.json", { source: globalCsvUrl, baseline: "1951-1980", years });
  console.log(`✓ GISTEMP global: ${years.length} years (${years[0].year}–${years.at(-1).year})`);
} catch (error) {
  failed++;
  console.error(`✗ GISTEMP global failed: ${error.message}`);
}

if (selected("zones")) try {
  const { columns, rows } = readCsvTable(await (await download(zonalCsvUrl)).text());
  const column = (name) => {
    const index = columns.indexOf(name);
    if (index < 0) throw new Error('Missing zonal column ' + name);
    return index;
  };
  const years = rows
    .map((cells) => ({
      year: Number(cells[0]),
      global: readNumber(cells[column("Glob")]),
      arctic: readNumber(cells[column("64N-90N")]),
      tropics: readNumber(cells[column("24S-24N")]),
      antarctic: readNumber(cells[column("90S-64S")]),
    }))
    .filter((entry) => [entry.global, entry.arctic, entry.tropics, entry.antarctic].every((value) => value !== null));
  validateYears(years, ["global", "arctic", "tropics", "antarctic"]);
  await saveJson("zones.json", { source: zonalCsvUrl, baseline: "1951-1980", years });
  console.log(`✓ GISTEMP zones: ${years.length} years (${years[0].year}–${years.at(-1).year})`);
} catch (error) {
  failed++;
  console.error(`✗ GISTEMP zones failed: ${error.message}`);
}

if (selected("eonet")) try {
  const eonetUrl = "https://eonet.gsfc.nasa.gov/api/v3/events?status=all&days=60";
  const body = await (await download(eonetUrl)).json();
  const pointFor = (geometry) => {
    if (geometry.type === "Point") return geometry.coordinates;
    const ring = geometry.coordinates[0] ?? [];
    const centre = (axis) => ring.reduce((sum, corner) => sum + corner[axis], 0) / Math.max(1, ring.length);
    return [centre(0), centre(1)];
  };
  const events = body.events.map((event) => ({
    title: event.title,
    categories: event.categories.slice(0, 1).map((category) => ({ id: category.id })),
    geometry: event.geometry.map((geometry) => ({
      date: geometry.date,
      type: "Point",
      coordinates: pointFor(geometry).map((value) => Math.round(value * 100) / 100),
    })),
  }));
  await saveJson("eonet.json", { source: eonetUrl, events });
  console.log(`✓ EONET: ${body.events.length} events in the last 60 days`);
} catch (error) {
  failed++;
  console.error(`✗ EONET failed: ${error.message}`);
}

const gibs = "https://gibs.earthdata.nasa.gov";
const maps = {
  air: { layer: "MERRA2_2m_Air_Temperature_Assimilated_Monthly", colors: "MERRA2_2m_Air_Temperature_Assimilated_Monthly" },
  sea: { layer: "GHRSST_L4_MUR_Sea_Surface_Temperature", colors: "GHRSST_Sea_Surface_Temperature" },
  plants: { layer: "MODIS_Terra_L3_NDVI_Monthly", colors: "MODIS_L3_NDVI" },
};
const mapUrl = (layer, date) =>
  `${gibs}/wms/epsg4326/best/wms.cgi?${new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: layer,
    CRS: "EPSG:4326",
    BBOX: "-90,-180,90,180",
    WIDTH: "720",
    HEIGHT: "360",
    FORMAT: "image/png",
    TRANSPARENT: "true",
    TIME: date,
  })}`;

if (selected("gibs")) try {
  await mkdir(new URL("gibs/", dataFolder), { recursive: true });
  const caps = await (await download(`${gibs}/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetCapabilities`)).text();
  const saveFile = async (name, url) =>
    writeFile(new URL(`gibs/${name}`, dataFolder), Buffer.from(await (await download(url)).arrayBuffer()));
  const index = { layers: {} };
  for (const [key, map] of Object.entries(maps)) {
    const block = caps.slice(caps.indexOf(`<Name>${map.layer}</Name>`));
    const times = block.match(/<Dimension name="time"[^>]*>([^<]+)</)?.[1] ?? "";
    const date = times.split(",").at(-1).split("/")[1];
    if (!date) throw new Error(`no dates for ${map.layer}`);
    await saveFile(`${key}.png`, mapUrl(map.layer, date));
    await saveFile(`${map.colors}.xml`, `${gibs}/colormaps/v1.3/${map.colors}.xml`);
    index.layers[key] = { date, image: `gibs/${key}.png` };
    if (key === "air") {
      const then = `1981${date.slice(4)}`;
      await saveFile("air-then.png", mapUrl(map.layer, then));
      index.then = { date: then, image: "gibs/air-then.png" };
    }
    console.log(`✓ GIBS: ${map.layer} ${date}`);
  }
  await saveJson("gibs/index.json", index);
} catch (error) {
  failed++;
  console.error(`✗ GIBS failed: ${error.message}`);
}

const currentYear = new Date().getFullYear();
for (const place of selected("power") ? examplePlaces : []) {
  let saved = false;
  for (const lastYear of [currentYear - 1, currentYear - 2]) {
    const query = new URLSearchParams({
      parameters: "T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN",
      community: "AG",
      latitude: place.latitude.toFixed(4),
      longitude: place.longitude.toFixed(4),
      start: String(powerFirstYear),
      end: String(lastYear),
      format: "JSON",
    });
    const url = `https://power.larc.nasa.gov/api/temporal/monthly/point?${query}`;
    try {
      const body = await (await download(url, 2)).json();
      const parameter = validatePower(body);
      await saveJson(`places/${place.slug}.json`, { place, source: url, parameter, parameters: body.parameters, header: body.header });
      console.log(`✓ POWER: ${place.name} ${powerFirstYear}–${lastYear}`);
      saved = true;
      break;
    } catch (error) {
      if (lastYear === currentYear - 2) console.error(`✗ POWER ${place.name} failed: ${error.message}`);
    }
  }
  if (!saved) failed++;
}

if (failed) {
  console.error(`${failed} download(s) failed. Previously saved copies in public/data/ are kept and still used.`);
  process.exitCode = 1;
}
