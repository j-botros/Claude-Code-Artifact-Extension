/** One step of a plan. JSON-serializable fields only. */
export interface PlanStep {
  id: string;
  title: string;
  detail: string;
}

/** A plan with a title, a summary, and ordered steps. */
export interface SamplePlan {
  title: string;
  summary: string;
  steps: PlanStep[];
}

/** Result of parsing plan JSON: either a plan or an error message. */
export type ParseResult =
  | { ok: true; plan: SamplePlan }
  | { ok: false; error: string };

/** Hard-coded sample plan shown by the scaffold command. */
export const samplePlan: SamplePlan = {
  title: "Sample Implementation Plan",
  summary: "A hard-coded plan used to check that the webview renders.",
  steps: [
    { id: "1", title: "Set up the project", detail: "Create the extension scaffold and build scripts." },
    { id: "2", title: "Render the plan", detail: "Show the plan title and steps in a webview panel." },
    { id: "3", title: "Add comments", detail: "Let users comment on each step in a later task." },
  ],
};

/** Removes one optional Markdown code fence (```json ... ```) around the text. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```[a-zA-Z]*\s*\r?\n([\s\S]*?)\r?\n?```$/.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

/** Checks that a value has the shape of a SamplePlan. */
function isPlan(value: unknown): value is SamplePlan {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  if (typeof v.title !== "string" || typeof v.summary !== "string" || !Array.isArray(v.steps)) {
    return false;
  }
  return v.steps.every((s) => {
    if (typeof s !== "object" || s === null) {
      return false;
    }
    const step = s as Record<string, unknown>;
    return typeof step.id === "string" && typeof step.title === "string" && typeof step.detail === "string";
  });
}

/** Parses plan JSON text (optionally fenced) into a plan. Never throws. */
export function parsePlanJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(stripCodeFence(text));
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!isPlan(data)) {
    return { ok: false, error: "JSON does not match the plan shape (title, summary, steps[{id,title,detail}])." };
  }
  return { ok: true, plan: data };
}
