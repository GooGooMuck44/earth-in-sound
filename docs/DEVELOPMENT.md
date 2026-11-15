# Developer guide

Use Node 22.12 or newer. Run `npm ci`, then `npm run dev`.

`npm test` runs the unit tests, TypeScript check, production build, and offline-cache simulation. `npm run preview` serves `dist` for browser checks; service workers are enabled only in production on HTTPS or localhost.

## Deploy with Vercel

1. Push the reviewed changes to `main` in `GooGooMuck44/earth-in-sound`.
2. In Vercel, choose **Add New → Project** and import that GitHub repository.
3. Select `main` as the production branch. Set the repository root to `./`.
4. Confirm **Framework: Vite**, **Install: `npm ci`**, **Build: `npm run build`**, and **Output: `dist`**. Use Node 22.12+ (Node 24 is suitable). No environment variables or API keys are required.
5. Click **Deploy**. Open the resulting HTTPS URL and check playback and offline reopening after the first visit has finished caching.

Future pushes to `main` trigger production deployments through the GitHub connection. Other branches may produce Vercel previews. No deployment is performed by the local build.

`vercel.json` records build settings and requires revalidation of the HTML shell and service worker. There is no backend or catch-all rewrite. Vite's relative base also preserves GitHub Pages subpath support.

## Offline updates

The production build fingerprints its output into the service-worker cache name. Installation caches the new HTML, hashed scripts/styles, local font, and bundled NASA records before activation. Activation removes only older Earth in Sound caches. Returning controlled tabs reload once on controller change; a first visit does not reload. Registration bypasses HTTP caching and checks again when connectivity returns. The existing network-first shell falls back to the saved shell offline.

Keep the font and its license in `public/fonts`. NASA data remains in `public/data`; `npm run data` refreshes it. Recording uses browser audio and MediaRecorder without microphone access. Test recordings on the intended browser.

## Theme and release checks

`index.html` loads `src/main.ts`, which imports `src/style.css`. Colours live in that stylesheet; chart colours read the same variables. Edit this Git checkout, not a similarly named extracted folder. The interface uses ocean surfaces, green actions, water blue, sunlight gold, and coral temperature traces. Zone lines also differ by dash pattern. No scientific map assets are recoloured.

Before release, inspect desktop and narrow mobile widths, all tracks, keyboard tab navigation, Space playback, arrow-key seeking, recording/download, and offline reload. Wait for the worker to activate before disconnecting. Check a returning tab after a second build to confirm updates arrive without a manual cache clear. Browser simulations do not replace listening on physical devices or Safari/Firefox checks.
