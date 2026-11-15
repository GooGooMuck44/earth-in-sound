# Developer guide

## Setup and checks

Use Node 22.12 or newer. Install the locked dependencies with `npm ci`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Vite server |
| `npm run test:unit` | Run Vitest unit tests |
| `npm run test:data` | Validate NASA climate fixtures and saved records |
| `npm run build` | Check TypeScript and build into `dist/` |
| `npm run test:offline` | Simulate first-visit caching and offline navigation against `dist/` |
| `npm test` | Run all of the above checks in the required order |
| `npm run preview` | Serve the production build locally |

The offline simulation does not replace browser and device checks.

## Refresh NASA data

Saved data is committed in `public/data/`. Global and zonal records are bundled because browsers cannot fetch the GISTEMP CSV directly. POWER and EONET also support live browser requests.

Refresh every source:

```bash
npm run data
```

Refresh only selected groups:

```bash
npm run data -- --only=global,zones,power
```

Available groups: `global`, `zones`, `power`, `eonet`, `gibs`.

Review the generated diff and commit intended data updates. A failed climate download keeps the previous saved file and makes the command exit with a nonzero status. Validated JSON is written through a temporary file before replacement.

GISTEMP annual records must be numeric and ordered. POWER must have at least 24 complete monthly records across all three parameters with the expected units. Missing values such as `-999` and annual summary month `13` are not monthly observations.

POWER files retain the request URL, retrieval time, NASA parameter descriptions, units, and API header. The app uses the AG community: °C, mm/day, and MJ/m²/day.

## Code map

| File | Responsibility |
| --- | --- |
| `src/data.ts` | NASA loading, parsing, saved copies, and place fallback |
| `src/scan.ts` | NASA imagery and custom-image scanning |
| `src/sonify.ts` | Sound mappings, timing, instruments, and recording |
| `src/chart.ts` | Charts, map display, and playhead |
| `src/main.ts` | Interface state, player, dialogs and guided listen |
| `src/ui.ts` | View order and tab key navigation |
| `src/compare.ts` | Two-city loading, shared months and shared scale |
| `src/range.ts` | Selected listening range |
| `src/findings.ts` | Findings calculated from the selected data |
| `src/csv.ts` | CSV and notes export |
| `src/share.ts` | Share-link building and validation |
| `src/icons.ts` | Inline SVG icons |
| `src/style.css` | Design tokens, layout and visual styling |
| `src/presets.json` | Saved example cities |
| `scripts/fetch-data.mjs` | NASA data refresh |
| `scripts/validate-nasa.mjs` | Download validation |
| `public/offline-worker.js` | Production offline caching |

## Deploy

### Vercel

1. Push the reviewed changes to `main`, then choose **Add New → Project** in Vercel and import `GooGooMuck44/earth-in-sound` from GitHub.
2. Select `main` as the production branch and repository root `./`.
3. Confirm **Framework: Vite**, **Install: `npm ci`**, **Build: `npm run build`**, and **Output: `dist`**. Use Node 22.12 or newer. No API keys or environment variables are needed.
4. Click **Deploy**, then check playback and offline reopening at the HTTPS address after caching finishes.

Future pushes to `main` trigger production deployments through the GitHub connection. `vercel.json` records the build settings and revalidates HTML and the service worker. There is no backend or catch-all rewrite.

Each build fingerprints bundled assets and public files into the offline cache name. Installation saves the full shell, fonts, NASA records and maps before activation. Activation removes only older app caches. A returning controlled tab reloads once when the new worker takes control; registration bypasses HTTP caches and checks again when connectivity returns.

### Other hosts

For GitHub Pages, choose **GitHub Actions** under repository Settings → Pages. The deploy workflow refreshes NASA data, builds, and publishes on pushes to `main`. A data-refresh failure may leave committed copies in use; inspect workflow output.

Other static hosts can use `npm run build` and serve `dist/`. The relative Vite base keeps assets inside a repository subpath.

Service workers operate in production builds on localhost or HTTPS, not through `file://`.

## Backup laptop

Copy or clone the repository, install Node, then:

```bash
npm ci
npm test
npm run preview -- --host 127.0.0.1
```

For a no-build backup, copy the complete `dist/` directory and serve it over HTTP:

```bash
python -m http.server 4173 --directory dist
```

Open the local site while online and let the worker finish caching. Confirm offline reopening in the actual browser before relying on it at a demo.

## Manual release checks

Unchecked items below are tasks, not claims of completed testing.

- [ ] Desktop Chrome: all six views, playback, instruments, looping, recording, and offline reopen.
- [ ] Guided listen with Voice on and off; Compare with headphones; Range, Share and CSV.
- [ ] Desktop Firefox: playback, keyboard navigation, offline use, and recording.
- [ ] Android Chrome around 390 px: reachable controls, scrolling tabs, no page overflow, and offline reopen.
- [ ] iPhone Safari: tap-to-start audio, narrow layout, speech support, and recording/download compatibility.
- [ ] With live APIs unavailable: saved EONET, every saved city, clear search guidance, and named nearest-city fallback.
- [ ] Headphones: polar separation, dense event days, comfortable volume, and narration balance.
- [ ] Assistive technology: focus order, control names, useful status announcements, and accessible values.

## Design tokens

Colours, spacing and corners live as CSS custom properties at the top of `src/style.css`. Green marks actions and selection, blue is water and rain, gold is sunlight and findings, coral is warmth and the first compared city, ice is the Arctic. Scan maps keep NASA's own colormap, shown as a legend under the map. Every state also has a shape, label or icon, so colour is never the only cue.

## Chart resizing

The ResizeObserver callback defers work to an animation frame and resizes uPlot only when dimensions change. This avoids an application-created resize feedback loop. No global browser warning suppression is used.

## Submission notes

Keep the project page, source credits, asset permissions, and documentation consistent with the final build. Confirm the applicable challenge and current submission requirements with official guidance and the Local Lead. Record only checks and user testing that actually took place.
