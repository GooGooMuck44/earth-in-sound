// Saves NASA data into public/data/ so the app works offline and on any static host.
//   node scripts/fetch-data.mjs
// - GISTEMP global annual anomalies -> public/data/gistemp.json (required: the browser can't fetch it directly)
// - NASA POWER monthly data for each example place -> public/data/places/<slug>.json (backup for the live API)
import { mkdir, readFile, writeFile } from "node:fs/promises";

const GISTEMP_CSV = "https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv";
const START = 2001;
const out = new URL("../public/data/", import.meta.url);
const presets = JSON.parse(await readFile(new URL("../src/presets.json", import.meta.url), "utf8"));
await mkdir(new URL("places/", out), { recursive: true });

let failures = 0;

async function get(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "earth-in-sound (Space Apps project)" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((res) => setTimeout(res, 2000 * i));
    }
  }
}

// --- GISTEMP ---
try {
  const csv = await (await get(GISTEMP_CSV)).text();
  const lines = csv.split(/\r?\n/);
  const h = lines.findIndex((l) => l.startsWith("Year,"));
  const jd = lines[h].split(",").indexOf("J-D");
  const years = lines
    .slice(h + 1)
    .map((l) => l.split(","))
    .filter((c) => Number.isFinite(Number(c[0])) && c[jd] && c[jd] !== "***")
    .map((c) => ({ year: Number(c[0]), anomaly: Number(c[jd]) }));
  await writeFile(
    new URL("gistemp.json", out),
    JSON.stringify({ source: GISTEMP_CSV, fetched: new Date().toISOString(), baseline: "1951-1980", years }),
  );
  console.log(`✓ GISTEMP: ${years.length} years (${years[0].year}–${years.at(-1).year})`);
} catch (e) {
  failures++;
  console.error(`✗ GISTEMP failed: ${e.message}`);
}

// --- NASA POWER for each example place ---
const thisYear = new Date().getFullYear();
for (const p of presets) {
  let saved = false;
  for (const end of [thisYear - 1, thisYear - 2]) {
    const q = new URLSearchParams({
      parameters: "T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN",
      community: "AG",
      latitude: p.lat.toFixed(4),
      longitude: p.lon.toFixed(4),
      start: String(START),
      end: String(end),
      format: "JSON",
    });
    const url = `https://power.larc.nasa.gov/api/temporal/monthly/point?${q}`;
    try {
      const j = await (await get(url, 2)).json();
      await writeFile(
        new URL(`places/${p.slug}.json`, out),
        JSON.stringify({ place: p, source: url, fetched: new Date().toISOString(), parameter: j.properties.parameter }),
      );
      console.log(`✓ POWER: ${p.name} ${START}–${end}`);
      saved = true;
      break;
    } catch (e) {
      if (end === thisYear - 2) console.error(`✗ POWER ${p.name} failed: ${e.message}`);
    }
  }
  if (!saved) failures++;
}

if (failures) {
  console.error(`${failures} download(s) failed. The app still runs; failed items fall back to live fetching.`);
  process.exitCode = 1;
}
