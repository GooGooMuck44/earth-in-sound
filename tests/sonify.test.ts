import { describe, expect, it } from "vitest";
import {
  eventSteps,
  evenlySpacedHitOffsets,
  longitudeToPan,
  shouldLoopPlayback,
  supportsLeadSound,
  zoneSteps,
} from "../src/sonify";

describe("event scheduling", () => {
  it("clamps longitude to a safe stereo pan", () => {
    expect(longitudeToPan(-270)).toBe(-1);
    expect(longitudeToPan(-90)).toBe(-0.5);
    expect(longitudeToPan(0)).toBe(0);
    expect(longitudeToPan(90)).toBe(0.5);
    expect(longitudeToPan(270)).toBe(1);
    expect(longitudeToPan(Number.NaN)).toBe(0);
  });

  it("spreads multiple hits evenly across the full beat", () => {
    expect(evenlySpacedHitOffsets(4, 0.4)).toEqual([0, 0.1, 0.2, 0.30000000000000004]);
    expect(evenlySpacedHitOffsets(0, 0.4)).toEqual([]);
  });

  it("keeps category sounds and creates one hit per grouped event", () => {
    const [step] = eventSteps([
      {
        position: 0,
        label: "Today",
        temperature: 3,
        happenings: [
          { category: "wildfires", count: 2, longitude: -180 },
          { category: "severeStorms", count: 1, longitude: 180 },
        ],
      },
    ]);
    expect(step.hits).toHaveLength(3);
    expect(step.hits?.map(({ instrument, pan }) => ({ instrument, pan }))).toEqual([
      { instrument: "crackle", pan: -1 },
      { instrument: "crackle", pan: -1 },
      { instrument: "storm", pan: 1 },
    ]);
  });
});

describe("track controls", () => {
  it("only offers lead instruments where they change the sound", () => {
    expect(supportsLeadSound("global")).toBe(true);
    expect(supportsLeadSound("place")).toBe(true);
    expect(supportsLeadSound("zones")).toBe(false);
    expect(supportsLeadSound("events")).toBe(false);
  });

  it("keeps all three Poles vs Tropics voices", () => {
    const [step] = zoneSteps([
      { position: 2000, label: "2000", temperature: 0.2, arctic: 0.8, tropics: 0.2, antarctic: -0.1 },
    ]);
    expect(step.zoneNotes?.map(({ voice }) => voice)).toEqual(["arctic", "tropics", "antarctic"]);
  });

  it("never loops while recording", () => {
    expect(shouldLoopPlayback(true, false)).toBe(true);
    expect(shouldLoopPlayback(true, true)).toBe(false);
    expect(shouldLoopPlayback(false, false)).toBe(false);
  });
});
