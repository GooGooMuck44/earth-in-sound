import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const dist = new URL("../dist/", import.meta.url);
const markup = await readFile(new URL("index.html", dist), "utf8");
const workerCode = await readFile(new URL("offline-worker.js", dist), "utf8");
const listeners = new Map();
const stored = new Map();
let online = true;

const keyFor = (request) => String(request?.url ?? request);
const responseFor = async (url) => {
  const address = new URL(String(url));
  const scopePath = "/earth-in-sound/";
  assert.ok(address.pathname.startsWith(scopePath), `URL escaped the GitHub Pages base path: ${address.pathname}`);
  const relative = address.pathname.slice(scopePath.length) || "index.html";
  const file = relative === "" ? "index.html" : relative;
  await access(new URL(file, dist));
  const body = file === "index.html" ? markup : await readFile(new URL(file, dist));
  return new Response(body, { status: 200 });
};

const cache = {
  async put(request, response) {
    stored.set(keyFor(request), response.clone());
  },
  async addAll(requests) {
    for (const request of requests) await this.put(request, await responseFor(request));
  },
  async match(request) {
    return stored.get(keyFor(request))?.clone();
  },
};

const context = {
  URL,
  Response,
  Promise,
  console,
  setTimeout(callback) {
    return globalThis.setTimeout(callback, 0);
  },
  fetch: async (request) => {
    if (!online) throw new Error("offline");
    return responseFor(request);
  },
  caches: {
    async open() { return cache; },
    async keys() { return ["earth-in-sound-v3", "another-app-v1"]; },
    async delete() { return true; },
  },
  self: {
    registration: { scope: "https://example.test/earth-in-sound/" },
    location: { origin: "https://example.test" },
    addEventListener(type, listener) { listeners.set(type, listener); },
    async skipWaiting() {},
    clients: { async claim() {} },
  },
};

runInNewContext(workerCode, context, { filename: "offline-worker.js" });
let installPromise;
listeners.get("install")({ waitUntil(promise) { installPromise = promise; } });
await installPromise;

const assetPaths = [...markup.matchAll(/(?:src|href)=["']([^"']*\/assets\/[^"']+)["']/g)].map((match) => match[1]);
assert.ok(assetPaths.some((path) => path.endsWith(".js")), "built JavaScript was not discovered");
assert.ok(assetPaths.some((path) => path.endsWith(".css")), "built CSS was not discovered");
for (const path of assetPaths) {
  const url = new URL(path, context.self.registration.scope).href;
  assert.ok(stored.has(url), `first visit did not cache ${path}`);
}
for (const required of ["data/gistemp.json", "data/zones.json", "data/eonet.json", "data/places/dhaka.json", "data/gibs/index.json", "data/gibs/air.png", "data/gibs/air-then.png", "data/gibs/sea.png", "data/gibs/plants.png"]) {
  assert.ok(stored.has(new URL(required, context.self.registration.scope).href), `first visit did not cache ${required}`);
}

online = false;
let offlineResponse;
listeners.get("fetch")({
  request: { method: "GET", mode: "navigate", url: "https://example.test/earth-in-sound/#track=events" },
  respondWith(promise) { offlineResponse = promise; },
});
assert.match(await (await offlineResponse).text(), /Earth in Sound/);

console.log(`✓ first-visit cache includes ${assetPaths.length} hashed assets and all bundled track data`);
console.log("✓ offline navigation reopens the cached app at the GitHub Pages base path");
