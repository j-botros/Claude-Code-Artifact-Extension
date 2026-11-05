import { describe, it, expect } from "vitest";

import { ACCEPT_MARKER, REJECT_MARKER } from "../../src/plan/decisionMarkers";

describe("decision markers", () => {
  it("accept is a check mark in the blue chart colour", () => {
    expect(ACCEPT_MARKER.glyph).toBe("✓");
    expect(ACCEPT_MARKER.colorId).toBe("charts.blue");
  });

  it("reject is a cross in the red chart colour", () => {
    expect(REJECT_MARKER.glyph).toBe("✗");
    expect(REJECT_MARKER.colorId).toBe("charts.red");
  });

  it("uses different glyphs and different colour ids", () => {
    expect(ACCEPT_MARKER.colorId).not.toBe(REJECT_MARKER.colorId);
    expect(ACCEPT_MARKER.glyph).not.toBe(REJECT_MARKER.glyph);
  });

  it("uses theme colour ids, not hex values", () => {
    for (const m of [ACCEPT_MARKER, REJECT_MARKER]) {
      expect(m.colorId).toMatch(/^[a-zA-Z]+(\.[a-zA-Z]+)+$/);
      expect(m.colorId.startsWith("#")).toBe(false);
    }
  });
});
