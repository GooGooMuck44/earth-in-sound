# Earth in Sound

Hear NASA climate and natural-event data as music. Earth in Sound is a browser app for the NASA Space Apps Challenge 2026, built with Tone.js and uPlot.

## The five tracks

- **Planet since 1880:** NASA GISS GISTEMP v4 global temperature anomaly, one note per year. Warmer years play higher, brighter notes with more heat-haze noise; a bass note marks each decade.
- **Poles vs Tropics:** the Arctic plays on the left, the Tropics in the centre, and the Antarctic on the right. The three regions always use distinct fixed voices, so the instrument picker is disabled on this track. Headphones make the stereo comparison clearest.
- **My Place:** NASA POWER monthly temperature, rainfall, and sunshine from 2001 onward. Search for a city while online or choose a saved example. Dhaka, Bangladesh is included with bundled data.
- **Scan the Planet:** NASA GIBS air temperature, sea surface temperature and vegetation imagery, with a west-to-east scan and image upload.
- **Earth right now:** NASA EONET events from the last 60 days. Category-specific sounds identify fires, storms, volcanoes, ice, snow, and other events; longitude controls stereo position. Bundled EONET data loads first and a live refresh follows when the network is available.

Press **▶** to listen. The chart playhead follows the music, and clicking the chart jumps to a point in time. The instrument picker changes the lead voice on Planet and My Place. Loop repeats normal playback, but recordings always stop after one pass. “Voice” announces decade/year markers.

## Offline and fallback behaviour

After the first complete visit, the service worker caches the built HTML, hashed JavaScript and CSS, all five bundled track datasets, and every saved example city. The app can then reopen at the same GitHub Pages URL without a network connection. Cache versions are replaced on deployment so an old app shell cannot keep loading new, incompatible assets.

Saved My Place examples include New York, London, Lagos, Delhi, Kathmandu, **Dhaka**, Tokyo, São Paulo, and Sydney. A place previously downloaded in the same browser can also be reused offline. Searching for a completely new city needs the Open-Meteo geocoding service, and fetching its climate needs NASA POWER. When either service is unavailable, the interface directs the listener to saved cities; when possible, it explicitly plays the nearest saved city instead of silently substituting data.

The first successful visit must finish while online. Clearing site data removes the offline cache and browser-saved places.

## Controls and accessibility

- **Tab:** move through the track tabs and player controls.
- **Left/Right Arrow while a track tab is focused:** select and focus the previous/next track.
- **Home/End while a track tab is focused:** select and focus the first/last track.
- **Enter or Space on a focused tab/control:** activate it.
- **Space outside a control:** play or pause.
- **Left/Right Arrow outside a control:** step through the current track; hold Shift to move 10 steps.

Status, offline, fallback, and playback messages use live regions and avoid exposing raw network errors. The tab row may scroll horizontally on a narrow screen, but the page itself should not overflow.

## Run, test, and build

Node 22.12 or newer is required for the current test runner.

```bash
npm ci
npm run dev
npm test
npm run build
```

`npm test` runs unit tests, TypeScript checking, a production build, and a simulated first-visit/offline reopen against the built service worker. `npm run test:offline` can be repeated after any production build.

Refresh committed NASA data with:

```bash
npm run data
```

NASA's GISTEMP server cannot be fetched directly by a browser, so global and zonal data live in `public/data/`. NASA POWER and EONET can refresh in the browser, while committed copies keep demos reliable. Commit intended changes in `public/data/` after refreshing.

## Recording limitations

“Record” captures one full pass and offers a WebM download; enabling Loop never makes a recording repeat forever. The control is disabled when the browser does not expose `MediaRecorder`. WebM download, playback, and sharing support varies, especially across Safari/iOS versions, so test the exact target browser before a presentation. Recording does not request microphone access.

## Deploy

**GitHub Pages:** in repository Settings → Pages, choose **GitHub Actions**. `.github/workflows/deploy.yml` refreshes NASA data, builds, and publishes on pushes to `main`.

**Netlify, Cloudflare Pages, or Vercel:** use `npm run build` and publish `dist`.

The Vite base is relative (`./`) so the generated assets and offline worker stay under the repository's GitHub Pages path.

## Backup laptop guide

For a complete rebuild, copy or clone the repository to the other laptop, install Node 22.12+, then run:

```bash
npm ci
npm run build
npm test
npm run preview -- --host 127.0.0.1
```

For a no-build backup, copy the entire `dist/` folder and serve it over HTTP from that folder, for example:

```bash
python3 -m http.server 4173 --directory dist
```

Open `http://localhost:4173/` once and wait for every track to load before disconnecting. Do not open `index.html` via `file://`; browsers do not enable service workers there.

## Manual release checklist

These checks are intentionally left unchecked; they are not claims that physical-device testing occurred.

- [ ] Desktop Chrome: load all five tracks, play/pause, change instrument where enabled, loop once, record once, then reopen offline.
- [ ] Desktop Firefox: repeat playback, keyboard-tab, offline, and recording checks.
- [ ] Android Chrome at about 390 px: verify tap targets, horizontally scrollable track tabs, no page-level horizontal overflow, playback, and offline reopen.
- [ ] iPhone Safari: verify audio starts after a tap, layout at narrow width, Voice behaviour, and whether recording/download is supported on that version.
- [ ] With live APIs blocked: verify saved EONET, every example city including Dhaka, clear search guidance, and nearest-city fallback.

## ResizeObserver note

The chart resize callback now defers work to the next animation frame and only calls uPlot when width or height actually changed. This avoids an application-created resize feedback loop that could surface as “ResizeObserver loop completed with undelivered notifications.” A browser may still report that message for extensions or unrelated library/layout work; no global error suppression is used.

## How the sound works

| Data | Sound |
| --- | --- |
| Value scaled to 0–1 across a series | index into a three-octave C major pentatonic scale |
| GISTEMP global anomaly | pitch, low-pass brightness, pink-noise heat haze |
| GISTEMP zonal anomaly | three fixed voices panned Arctic left, Tropics centre, Antarctic right |
| POWER temperature | pitch |
| POWER rainfall | one to four falling notes per month |
| POWER sunshine | filter cutoff from dark to bright |
| EONET category | crackle, drum, bell, or pluck |
| EONET longitude | stereo pan from west to east |

Code map: `src/data.ts` loads NASA data, `src/sonify.ts` maps data to sound and timing, `src/chart.ts` renders uPlot, `src/main.ts` coordinates the UI, and `scripts/fetch-data.mjs` refreshes bundled data.

## Future ideas

- A compare mode that plays two cities in stereo.

## Data credits

- GISTEMP Team, 2026: GISS Surface Temperature Analysis (GISTEMP), version 4. NASA Goddard Institute for Space Studies. https://data.giss.nasa.gov/gistemp/
- NASA Langley Research Center POWER Project, funded through the NASA Earth Science Applied Science Program. https://power.larc.nasa.gov/
- NASA Earth Observatory Natural Event Tracker (EONET). https://eonet.gsfc.nasa.gov/
- Place search: Open-Meteo Geocoding API (CC BY 4.0).
