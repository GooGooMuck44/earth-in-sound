import { describe, expect, it } from "vitest";
import presets from "../src/presets.json";
import { eventDays, nearestExample, type EonetEvent, type Place } from "../src/data";

describe("EONET event grouping", () => {
  it("groups unique titles by day and category", () => {
    const events: EonetEvent[] = [
      {
        title: "Storm Alpha",
        categories: [{ id: "severeStorms" }],
        geometry: [
          { date: "2026-01-10T00:00:00Z", type: "Point", coordinates: [30, 5] },
          { date: "2026-01-10T06:00:00Z", type: "Point", coordinates: [40, 5] },
        ],
      },
      {
        title: "Storm Beta",
        categories: [{ id: "severeStorms" }],
        geometry: [{ date: "2026-01-10T12:00:00Z", type: "Point", coordinates: [50, 5] }],
      },
      {
        title: "Fire One",
        categories: [{ id: "wildfires" }],
        geometry: [{ date: "2026-01-10T12:00:00Z", type: "Point", coordinates: [-90, 5] }],
      },
    ];

    const day = eventDays(events, new Date("2026-01-10T12:00:00Z")).at(-1)!;
    expect(day.temperature).toBe(3);
    expect(day.headlines).toEqual(["Storm Alpha", "Storm Beta", "Fire One"]);
    expect(day.happenings).toEqual([
      { category: "severeStorms", count: 2, longitude: 40 },
      { category: "wildfires", count: 1, longitude: -90 },
    ]);
  });
});

describe("saved example places", () => {
  it("includes Dhaka with bundled-data coordinates", () => {
    expect(presets).toContainEqual(
      expect.objectContaining({ slug: "dhaka", name: "Dhaka", country: "Bangladesh", latitude: 23.81, longitude: 90.41 }),
    );
  });

  it("selects the geographically nearest saved city", () => {
    const examples: Place[] = [
      { name: "West", latitude: 0, longitude: -20 },
      { name: "Near", latitude: 1, longitude: 1 },
      { name: "East", latitude: 0, longitude: 20 },
    ];
    expect(nearestExample({ name: "Target", latitude: 1.2, longitude: 1.1 }, examples).name).toBe("Near");
  });
});
