const cachePrefix = "earth-in-sound-";
const cacheName = `${cachePrefix}v4`;
const examplePlaces = ["new-york", "london", "lagos", "delhi", "kathmandu", "dhaka", "tokyo", "sao-paulo", "sydney"];
const startupFiles = [
  "./data/gistemp.json",
  "./data/zones.json",
  "./data/eonet.json",
  ...examplePlaces.map((slug) => `./data/places/${slug}.json`),
];
const trustedHosts = ["power.larc.nasa.gov", "geocoding-api.open-meteo.com", "eonet.gsfc.nasa.gov"];

function appAssets(markup) {
  const paths = [];
  for (const match of markup.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const path = match[1];
    if (path.includes("/assets/") && !paths.includes(path)) paths.push(path);
  }
  return paths;
}

async function cacheFirstVisit() {
  const cache = await caches.open(cacheName);
  const indexUrl = new URL("./index.html", self.registration.scope);
  const homeUrl = new URL("./", self.registration.scope);
  const response = await fetch(indexUrl, { cache: "reload" });
  if (!response.ok) throw new Error("App shell unavailable");
  const markup = await response.clone().text();
  await cache.put(indexUrl, response.clone());
  await cache.put(homeUrl, response);
  const required = [...startupFiles, ...appAssets(markup)].map((path) => new URL(path, self.registration.scope));
  await cache.addAll(required);
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheFirstVisit().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith(cachePrefix) && name !== cacheName).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

function networkWithin(request, timeoutMs) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => setTimeout(() => reject(new Error("network too slow")), timeoutMs)),
  ]);
}

async function freshOrSaved(request, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const response = await networkWithin(request, timeoutMs);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (problem) {
    const saved = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
    if (saved) return saved;
    if (request.mode === "navigate") {
      const homePage = await cache.match(new URL("./index.html", self.registration.scope));
      if (homePage) return homePage;
    }
    throw problem;
  }
}

async function savedOrFresh(request) {
  const cache = await caches.open(cacheName);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const address = new URL(request.url);
  if (address.origin === self.location.origin) {
    const isStatic = address.pathname.includes("/assets/") || address.pathname.includes("/data/");
    event.respondWith(isStatic ? savedOrFresh(request) : freshOrSaved(request, 4000));
  } else if (trustedHosts.includes(address.hostname)) {
    event.respondWith(freshOrSaved(request, 25000));
  }
});
