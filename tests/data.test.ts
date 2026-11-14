import { describe, expect, it } from "vitest";
import presets from "../src/presets.json";
import { eventDays, nearestExample, parsePower, type EonetEvent, type Place } from "../src/data";

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
      expect.objectContaining({ slug: "dhaka", name: "Dhaka", country: "Bangladesh", latitude: 23.8103, longitude: 90.4125 }),
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


describe('POWER monthly parsing', () => {
  it('excludes annual summaries, malformed month keys and fill values without losing negative temperatures', () => {
    const points = parsePower({
      T2M: { '202301': -5, '202302': -999, '202313': 12, 'abcd01': 20, '202300': 2, '202303': null as unknown as number, '202304': Infinity },
      PRECTOTCORR: { '202301': 2 },
      ALLSKY_SFC_SW_DWN: { '202301': 10 },
    });
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ label: 'Jan 2023', temperature: -5, rainfall: 2, sunshine: 10 });
  });
});
