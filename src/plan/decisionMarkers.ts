/** Glyph and theme colour id for one decision marker. */
export interface DecisionMarker {
  /** The character drawn before the hunk's first line. */
  glyph: string;
  /** A VS Code theme colour id, so the marker reads in light and dark themes. */
  colorId: string;
}

/** Accept marker: a blue check mark. */
export const ACCEPT_MARKER: DecisionMarker = { glyph: "✓", colorId: "charts.blue" };

/** Reject marker: a red cross. */
export const REJECT_MARKER: DecisionMarker = { glyph: "✗", colorId: "charts.red" };
