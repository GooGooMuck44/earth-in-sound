const cacheName = "earth-in-sound-v2";
const examplePlaces = ["new-york", "london", "lagos", "delhi", "kathmandu", "tokyo", "sao-paulo", "sydney"];
const startupFiles = [
  "./",
  "./index.html",
  "./data/gistemp.json",
  "./data/zones.json",
  ...examplePlaces.map((slug) => `./data/places/${slug}.json`),
];
const trustedHosts = ["power.larc.nasa.gov", "geocoding-api.open-meteo.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => Promise.allSettled(startupFiles.map((file) => cache.add(file))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== cacheName).map((name) => caches.delete(name))))
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
      const homePage = await cache.match("./index.html");
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
    event.respondWith(address.pathname.includes("/assets/") ? savedOrFresh(request) : freshOrSaved(request, 4000));
  } else if (trustedHosts.includes(address.hostname)) {
    event.respondWith(freshOrSaved(request, 25000));
  }
});
