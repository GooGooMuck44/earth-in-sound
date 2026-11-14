import { describe, expect, it } from "vitest";
import { tabAfterKey } from "../src/ui";

describe("track tab navigation", () => {
  it("wraps arrow keys and supports Home and End", () => {
    expect(tabAfterKey("global", "ArrowLeft")).toBe("scan");
    expect(tabAfterKey("events", "ArrowRight")).toBe("scan");
    expect(tabAfterKey("place", "Home")).toBe("global");
    expect(tabAfterKey("zones", "End")).toBe("scan");
    expect(tabAfterKey("zones", "Enter")).toBeNull();
  });
});
