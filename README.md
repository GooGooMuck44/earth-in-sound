# Earth in Sound

Hear NASA climate data. A browser app for the NASA Space Apps Challenge 2026 that turns
global and local climate records into music with [Tone.js](https://tonejs.github.io/).

- **Planet since 1880:** NASA GISS GISTEMP v4 global temperature anomaly, one note per year.
  Warmer years play higher, brighter notes with more "heat haze" noise. A bass note marks each decade.
- **Poles vs Tropics:** NASA GISTEMP v4 zonal means. The Arctic (64°N–90°N) plays in your left ear, the Tropics
  (24°S–24°N) in the centre and the Antarctic (64°S–90°S) in your right ear, all on one scale, so you can hear the
  Arctic climb away from the rest. It has warmed about 2.7× faster than the planet as a whole.
- **My Place:** NASA POWER monthly data (2001 onward) for any city on Earth.
  Temperature (`T2M`) sets the pitch, rain (`PRECTOTCORR`) sets how many notes play,
  and sunshine (`ALLSKY_SFC_SW_DWN`) sets the filter brightness. A bass note marks each January.
- A playhead on the chart follows the music. Click the chart to jump, use Space to play or pause,
  and ←/→ to step (hold Shift to move 10 steps). "Say the years" reads the years aloud.
- **Record song** plays the track from the start and gives you a `.webm` file to download and share.

## Built not to break during a demo

- Every NASA file the app needs is saved in `public/data/` and shipped with the site.
- Every network request has a timeout, so slow Wi-Fi never leaves the app hanging.
- Every successful download is also kept in the browser, so a track that loaded once keeps working.
- If NASA POWER can't be reached for a searched city, the app plays the nearest saved city and says so.
- An offline worker (`public/offline-worker.js`) caches the site and its data after the first visit.
- Errors show a friendly message instead of a blank page.

Everything is free and open source: Vite, TypeScript, Tone.js (MIT), uPlot (MIT). No backend and no API keys.

## Run it

Requires Node 20 or newer.

```bash
npm install
npm run data     # downloads GISTEMP (global + zonal) and example cities from NASA into public/data/
npm run dev      # open http://localhost:5173
```

`npm run data` matters: NASA's GISTEMP server doesn't allow browsers to fetch its CSV directly,
so the app reads the saved `public/data/gistemp.json`. NASA POWER *is* fetched live in the browser
for any searched city; the saved example cities are a backup if the venue Wi-Fi or the API is slow.
**Commit `public/data/` after running it** so your deployed site always has data.

## Deploy (free)

**GitHub Pages (automatic):** push to a GitHub repo, then go to Settings → Pages → Source: *GitHub Actions*.
`.github/workflows/deploy.yml` downloads fresh NASA data, builds, and publishes on every push to `main`.

**Netlify / Cloudflare Pages / Vercel:** build command `npm run build`, output folder `dist`.

## How the sound works

| Data | Sound |
| --- | --- |
| Value scaled to 0–1 across the series | an index into a 3-octave C major pentatonic scale, so everything stays in tune |
| GISTEMP anomaly | pitch, lowpass brightness, pink-noise "heat haze" level |
| GISTEMP zonal anomaly | three voices panned left (Arctic), centre (Tropics), right (Antarctic) |
| POWER T2M | pitch |
| POWER PRECTOTCORR | 1–4 notes per month, falling like drops |
| POWER ALLSKY_SFC_SW_DWN | lowpass cutoff 250–4750 Hz |

Code map: `src/data.ts` (loading NASA data), `src/sonify.ts` (data → notes, Tone.js engine),
`src/chart.ts` (uPlot chart and playhead), `src/main.ts` (UI), `scripts/fetch-data.mjs` (data download).

## Ideas if you have time

- EONET live events (`https://eonet.gsfc.nasa.gov/api/v3/events?status=open`) as percussion: wildfires, storms, volcanoes.
- A "compare" mode that plays two cities in stereo, left and right.

## Data credits

- GISTEMP Team, 2026: GISS Surface Temperature Analysis (GISTEMP), version 4. NASA Goddard Institute for Space Studies. https://data.giss.nasa.gov/gistemp/
- NASA Langley Research Center POWER Project, funded through the NASA Earth Science Applied Science Program. https://power.larc.nasa.gov/
- Place search: Open-Meteo Geocoding API (CC BY 4.0).
