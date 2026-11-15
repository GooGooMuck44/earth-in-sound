import { describe, expect, it } from "vitest";
import { coords, distanceKm, nearest, placeHash } from "../src/home";
import { subsolar, toVector } from "../src/globe";
import presets from "../src/presets.json";

describe("home globe", () => {
  it("formats coordinates by hemisphere", () => {
    expect(coords({ latitude: 23.81, longitude: 90.41 })).toBe("23.8°N, 90.4°E");
    expect(coords({ latitude: -33.87, longitude: -70.6 })).toBe("33.9°S, 70.6°W");
  });

  it("measures distance on the globe", () => {
    expect(distanceKm({ latitude: 23.81, longitude: 90.41 }, { latitude: 51.51, longitude: -0.13 })).toBeCloseTo(8000, -2);
  });

  it("snaps a tap to a nearby saved city", () => {
    expect(nearest({ latitude: 23.5, longitude: 90.0 }, presets)?.slug).toBe("dhaka");
    expect(placeHash({ latitude: 23.5, longitude: 90.0 }, presets)).toBe("#view=place&city=dhaka");
  });

  it("keeps raw coordinates far from saved cities", () => {
    const hash = placeHash({ latitude: -75, longitude: 10 }, presets);
    expect(decodeURIComponent(hash)).toBe("#view=place&city=-75.00,10.00,75.0°S, 10.0°E");
  });

  it("puts the Sun over the equator near the equinox at noon UTC", () => {
    const sun = subsolar(new Date(Date.UTC(2026, 2, 20, 12)));
    expect(Math.abs(sun.latitude)).toBeLessThan(1.5);
    expect(Math.abs(sun.longitude)).toBeLessThan(0.5);
    const [x, y, z] = toVector({ latitude: 0, longitude: 90 });
    expect([x, y, z].map((n) => Math.round(n))).toEqual([1, 0, 0]);
  });
});
