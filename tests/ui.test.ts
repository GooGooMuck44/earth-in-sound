import { describe, expect, it } from "vitest";
import { tabAfterKey } from "../src/ui";

describe("track tab navigation", () => {
  it("wraps arrow keys and supports Home and End", () => {
    expect(tabAfterKey("global", "ArrowLeft")).toBe("events");
    expect(tabAfterKey("events", "ArrowRight")).toBe("global");
    expect(tabAfterKey("place", "Home")).toBe("global");
    expect(tabAfterKey("zones", "End")).toBe("events");
    expect(tabAfterKey("zones", "Enter")).toBeNull();
  });
});
