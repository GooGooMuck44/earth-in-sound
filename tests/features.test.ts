import { describe, expect, it } from "vitest";
import presets from "../src/presets.json";
import { pairPoints, sharedRange } from "../src/compare";
import { notes, toCsv } from "../src/csv";
import type { ClimatePoint, ClimateTrack, Place } from "../src/data";
import { findingsFor, monthlyMeans } from "../src/findings";
import { clampRange, slice, span } from "../src/range";
import { buildSetup, parseSetup, sharesLocation } from "../src/share";
import { compareSteps, eventSteps, maxHits, pentatonic, stepsFor } from "../src/sonify";

const meta = { dataset: "Test", link: "https://example.test", units: "°C", coverage: "", status: "saved" as const, limit: "" };
const month = (year: number, monthNumber: number, temperature: number, extra: Partial<ClimatePoint> = {}): ClimatePoint => ({
  position: year + (monthNumber - 0.5) / 12,
  label: `M${monthNumber} ${year}`,
  key: `${year}-${String(monthNumber).padStart(2, "0")}`,
  temperature,
  ...extra,
});
const yearly = (values: [number, number][]): ClimateTrack => ({
  kind: "global",
  title: "Global temperature",
  source: "",
  meta,
  points: values.map(([year, value]) => ({ position: year, label: String(year), key: String(year), temperature: value })),
});
const places = presets as Place[];

describe("city comparison", () => {
  it("keeps only the shared period and leaves gaps as missing, not zero", () => {
    const left = [month(2001, 1, 20), month(2001, 2, 21), month(2001, 3, 22), month(2001, 4, 23)];
    const right = [month(2001, 2, 5), month(2001, 4, 7), month(2001, 5, 8)];
    const paired = pairPoints(left, right);
    expect(paired.map((point) => point.key)).toEqual(["2001-02", "2001-03", "2001-04"]);
    expect(paired[1].other).toBeNaN();
    expect(paired[2]).toMatchObject({ temperature: 23, other: 7 });
  });

  it("plays both cities on one shared pitch scale", () => {
    const points = [month(2001, 1, 30, { other: 0 }), month(2001, 2, 15, { other: 15 }), month(2001, 3, 0, { other: 30 })];
    expect(sharedRange(points)).toEqual([0, 30]);
    const steps = compareSteps(points);
    const note = (step: number, side: string) => steps[step].pairNotes!.find((entry) => entry.side === side)!.note;
    expect(note(1, "left")).toBe(note(1, "right"));
    expect(note(0, "left")).toBe(note(2, "right"));
    expect(note(0, "left")).toBe(pentatonic.at(-1));
    expect(note(0, "right")).toBe(pentatonic[0]);
  });

  it("skips the missing side instead of playing it as cold", () => {
    const steps = compareSteps([month(2001, 1, 10, { other: NaN }), month(2001, 2, 20, { other: 20 })]);
    expect(steps[0].pairNotes!.map((entry) => entry.side)).toEqual(["left"]);
  });
});

describe("listening range", () => {
  const track = yearly([[1880, -0.2], [1881, -0.1], [1882, 0], [1883, 0.5], [1884, 0.3]]);

  it("clamps, orders and defaults the range", () => {
    expect(clampRange(track.points, null)).toEqual({ from: 1880, to: 1884 });
    expect(clampRange(track.points, { from: 1883, to: 1870 })).toEqual({ from: 1880, to: 1883 });
    expect(clampRange(track.points, { from: 1900, to: 1950 })).toEqual({ from: 1884, to: 1884 });
  });

  it("gives the chart, sound, findings and CSV the same points", () => {
    const range = { from: 1881, to: 1883 };
    const shown = slice(track, range);
    const [start, end] = span(track.points, range);
    const steps = stepsFor("global", track.points).slice(start, end);
    expect(shown.points.map((point) => point.label)).toEqual(["1881", "1882", "1883"]);
    expect(steps).toHaveLength(shown.points.length);
    expect(findingsFor(shown)[0]).toEqual({ label: "Warmest year", value: "1883" });
    expect(toCsv(shown).trim().split("\n")).toEqual(["year,anomaly_c_vs_1951_1980", "1881,-0.1", "1882,0", "1883,0.5"]);
  });

  it("keeps one pitch scale when the range changes", () => {
    const fullSteps = stepsFor("global", track.points);
    const [start, end] = span(track.points, { from: 1881, to: 1882 });
    const ranged = fullSteps.slice(start, end);
    const refit = stepsFor("global", track.points.slice(start, end));
    expect(ranged[0].notes).toEqual(fullSteps[1].notes);
    expect(ranged[0].notes).not.toEqual(refit[0].notes);
  });
});

describe("share links", () => {
  it("round-trips view, cities, range, sound and speed", () => {
    const dhaka = places.find((place) => place.slug === "dhaka")!;
    const london = places.find((place) => place.slug === "london")!;
    const hash = buildSetup({ view: "compare", city: dhaka, city2: london, from: 2010, to: 2015, sound: "piano", speed: 2 });
    expect(hash).toBe("#view=compare&city=dhaka&city2=london&from=2010&to=2015&sound=piano&speed=2");
    expect(parseSetup(hash, places)).toEqual({ view: "compare", city: dhaka, city2: london, from: 2010, to: 2015, sound: "piano", speed: 2 });
  });

  it("drops invalid values and rejects unknown views", () => {
    expect(parseSetup("#view=nowhere", places)).toBeNull();
    expect(parseSetup("", places)).toBeNull();
    const setup = parseSetup("#view=place&city=999,10,Nowhere&speed=9&sound=kazoo&from=20x0&to=2010&layer=moon&month=2020-13", places);
    expect(setup).toEqual({ view: "place" });
  });

  it("orders a reversed range and keeps scan options", () => {
    expect(parseSetup("#view=planet&from=2010&to=1990", places)).toMatchObject({ from: 1990, to: 2010 });
    expect(parseSetup("#view=scan&layer=air&month=1999-07&then=1", places)).toMatchObject({ layer: "air", month: "1999-07", then: true });
  });

  it("still opens older links", () => {
    expect(parseSetup("#track=zones", places)).toEqual({ view: "zones" });
    expect(parseSetup("#lat=23.810&lon=90.413&name=Dhaka&slug=dhaka", places)?.city?.slug).toBe("dhaka");
  });

  it("flags links that carry the visitor's location", () => {
    const here = { name: "My location", latitude: 23.7, longitude: 90.4 };
    expect(sharesLocation({ view: "place", city: here })).toBe(true);
    expect(sharesLocation({ view: "place", city: places[0] })).toBe(false);
    expect(parseSetup(buildSetup({ view: "place", city: here }), places)?.city).toEqual(here);
  });
});

describe("CSV export", () => {
  it("names units in the header and leaves missing values empty", () => {
    const track: ClimateTrack = {
      kind: "place",
      title: "São Paulo",
      source: "",
      meta,
      points: [month(2001, 1, 24.1, { rainfall: 7.2, sunshine: 20 }), month(2001, 2, 24.5, { rainfall: NaN, sunshine: 19 })],
    };
    expect(toCsv(track)).toBe("month,t2m_c,prectotcorr_mm_per_day,allsky_sfc_sw_dwn_mj_per_m2_per_day\n2001-01,24.1,7.2,20\n2001-02,24.5,,19\n");
    expect(notes(track, "2001")).toContain("Empty cells are missing values, not zero.");
  });

  it("labels each compared city", () => {
    const track: ClimateTrack = {
      kind: "compare",
      title: "x",
      source: "",
      meta,
      places: [places[3], places[1]],
      points: [month(2001, 1, 18, { other: 5 })],
    };
    expect(toCsv(track).split("\n")[0]).toBe("month,dhaka_t2m_c,london_t2m_c");
  });
});

describe("findings", () => {
  it("reports ties instead of picking one", () => {
    expect(findingsFor(yearly([[2020, 1.01], [2023, 1.2], [2024, 1.2]]))[0]).toEqual({ label: "Warmest year", value: "2023 & 2024" });
  });

  it("needs every calendar month before naming a seasonal peak", () => {
    const partial: ClimateTrack = { kind: "place", title: "x", source: "", meta, points: [month(2001, 6, 30, { rainfall: 12 }), month(2001, 7, 29, { rainfall: 15 })] };
    expect(findingsFor(partial).map((finding) => finding.label)).toEqual(["Warmest"]);
    const fullYear: ClimateTrack = {
      ...partial,
      points: Array.from({ length: 12 }, (_, at) => month(2001, at + 1, 20 + (at === 4 ? 9 : 0), { rainfall: at === 6 ? 15 : at === 7 ? NaN : 2 })),
    };
    expect(findingsFor(fullYear).map((finding) => finding.label)).toEqual(["Warmest month"]);
    fullYear.points[7].rainfall = 3;
    expect(findingsFor(fullYear)).toEqual([
      { label: "Rain peaks", value: "July" },
      { label: "Warmest month", value: "May" },
    ]);
  });

  it("ignores missing values in monthly means", () => {
    const means = monthlyMeans([month(2001, 1, 10), month(2002, 1, NaN), month(2003, 1, 20)], (point) => point.temperature);
    expect(means[0]).toMatchObject({ value: 15, count: 2 });
  });
});

describe("dense event days", () => {
  it(`caps a busy day at ${maxHits} sounds while keeping each category`, () => {
    const [step] = eventSteps([
      { position: 0, label: "Busy", temperature: 103, happenings: [{ category: "wildfires", count: 100, longitude: 0 }, { category: "volcanoes", count: 3, longitude: 30 }] },
    ]);
    expect(step.hits!.length).toBeLessThanOrEqual(maxHits);
    expect(new Set(step.hits!.map((hit) => hit.instrument))).toEqual(new Set(["crackle", "volcano"]));
  });
});
