import { Globe, type Spot } from "./globe";
import type { Place } from "./data";

type Hooks = {
  open: (hash: string | null) => void;
  tour: () => void;
  leave: () => void;
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function coords({ latitude, longitude }: Spot) {
  const ns = latitude >= 0 ? "N" : "S";
  const ew = longitude >= 0 ? "E" : "W";
  return `${Math.abs(latitude).toFixed(1)}°${ns}, ${Math.abs(longitude).toFixed(1)}°${ew}`;
}

export function distanceKm(a: Spot, b: Spot) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function nearest(spot: Spot, places: Place[], within = 600) {
  let best: Place | null = null;
  let gap = within;
  for (const place of places) {
    const km = distanceKm(spot, place);
    if (km < gap) {
      gap = km;
      best = place;
    }
  }
  return best;
}

export function placeHash(spot: Spot, places: Place[]) {
  const near = nearest(spot, places);
  if (near?.slug) return `#view=place&city=${near.slug}`;
  const name = coords(spot);
  return `#view=place&city=${encodeURIComponent(`${spot.latitude.toFixed(2)},${spot.longitude.toFixed(2)},${name}`)}`;
}

export function startHome(places: Place[], hooks: Hooks) {
  const home = $("home");
  const canvas = $<HTMLCanvasElement>("globe");
  const card = $("pick");
  const said = $("home-said");
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let globe: Globe | null = null;
  let chosen: Spot | null = null;

  try {
    globe = new Globe(canvas, import.meta.env.BASE_URL, calm);
    globe.lon = -new Date().getTimezoneOffset() / 4;
    globe.ready.then(() => home.classList.add("lit")).catch(() => home.classList.add("flat"));
  } catch {
    home.classList.add("flat");
  }

  const fit = () => {
    if (!globe) return;
    const wide = innerWidth >= 900 || innerWidth > innerHeight * 1.2;
    const tall = innerHeight / innerWidth;
    globe.layout = wide ? { x: 0.68, y: 0.5, r: 0.4 } : { x: 0.5, y: tall > 1.9 ? 0.3 : 0.27, r: tall > 1.9 ? 0.42 : 0.36 };
    const { cy, r } = globe.geometry();
    home.style.setProperty("--globe-end", `${Math.round(cy - home.getBoundingClientRect().top + r)}px`);
    globe.draw(performance.now());
  };
  addEventListener("resize", fit);
  fit();

  const choose = (spot: Spot) => {
    chosen = spot;
    if (globe) globe.picked = spot;
    const near = nearest(spot, places);
    $("pick-name").textContent = near ? `Near ${near.name}` : "Selected place";
    $("pick-coords").textContent = coords(spot);
    card.hidden = false;
    said.textContent = `${near ? `Near ${near.name}` : coords(spot)}. Press Listen here to hear its climate.`;
  };

  if (globe) {
    const g = globe;
    let down: { x: number; y: number; t: number; moved: number } | null = null;
    canvas.addEventListener("pointerdown", (event) => {
      canvas.setPointerCapture(event.pointerId);
      down = { x: event.clientX, y: event.clientY, t: performance.now(), moved: 0 };
      g.spin = 0;
      g.tilt = 0;
      g.hold();
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!down) {
        canvas.style.cursor = g.spotAt(event.clientX, event.clientY) ? "grab" : "default";
        return;
      }
      const { r } = g.geometry();
      const dx = event.clientX - down.x;
      const dy = event.clientY - down.y;
      const now = performance.now();
      const dt = Math.max(now - down.t, 1);
      const dLon = (-dx / r) * 57.3;
      const dLat = (dy / r) * 57.3;
      g.turn(dLon, dLat);
      g.spin = dLon / dt;
      g.tilt = dLat / dt;
      down = { x: event.clientX, y: event.clientY, t: now, moved: down.moved + Math.abs(dx) + Math.abs(dy) };
      canvas.style.cursor = "grabbing";
    });
    const release = (event: PointerEvent) => {
      if (!down) return;
      if (down.moved < 6) {
        g.spin = 0;
        g.tilt = 0;
        const spot = g.spotAt(event.clientX, event.clientY);
        if (spot) choose(spot);
      } else if (performance.now() - down.t > 80) {
        g.spin = 0;
        g.tilt = 0;
      }
      down = null;
      canvas.style.cursor = "grab";
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", () => (down = null));
    canvas.addEventListener("keydown", (event) => {
      const moves: Record<string, [number, number]> = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, 10], ArrowDown: [0, -10] };
      if (event.key in moves) {
        event.preventDefault();
        g.turn(...moves[event.key]);
        said.textContent = `Facing ${coords({ latitude: g.lat, longitude: g.lon })}`;
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        choose({ latitude: g.lat, longitude: g.lon });
        $("pick-go").focus();
      }
    });
  }

  const show = (page: "home" | "app") => {
    document.body.dataset.page = page;
    home.hidden = page !== "home";
    if (page === "home") {
      hooks.leave();
      fit();
      globe?.start();
    } else {
      globe?.stop();
    }
  };

  const enter = (hash: string | null, then?: () => void) => {
    history.pushState(null, "", hash ?? location.pathname + location.search);
    show("app");
    hooks.open(hash);
    scrollTo(0, 0);
    $("stage").focus({ preventScroll: true });
    then?.();
  };

  $("enter").addEventListener("click", () => enter(null));
  $("enter-tour").addEventListener("click", () => enter(null, hooks.tour));
  $("pick-go").addEventListener("click", () => chosen && enter(placeHash(chosen, places)));
  $("pick-close").addEventListener("click", () => {
    card.hidden = true;
    chosen = null;
    if (globe) globe.picked = null;
    canvas.focus();
  });

  document.querySelector<HTMLAnchorElement>(".brand")?.addEventListener("click", (event) => {
    event.preventDefault();
    if (document.body.dataset.page === "home") return;
    history.pushState({ home: true }, "", location.pathname + location.search);
    show("home");
    $("enter").focus();
  });

  addEventListener("popstate", () => {
    if (history.state?.home) show("home");
    else if (document.body.dataset.page === "home") show("app");
  });

  if (location.hash) {
    show("app");
  } else {
    history.replaceState({ home: true }, "");
    show("home");
  }
}
