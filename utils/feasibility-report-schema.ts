/**
 * The shape of a planning feasibility report, enforced by the API.
 *
 * Asking for JSON in the prompt wasn't enough: on 31 Oct 2026, Claude Sonnet 5.5
 * closed the object early (straight after keyStats) in 3 of 7 reports, and the
 * user would have got a parse error after a 40-second wait. With this schema the
 * API constrains the output so that can't happen.
 *
 * minItems matters. Without it the same slip comes out as valid JSON with an empty
 * `sections` array (5 of 8 reports in testing), which reads as a blank report.
 *
 * Keep it in step with REPORT_SYS and with what FeasibilityClient renders.
 */
const TONE = { type: "string", enum: ["good", "warn", "bad", "info"] };
const TEXT = { type: "string" };
const TEXT_LIST = { type: "array", items: TEXT };

function block(type: string, properties: Record<string, unknown>, optional: string[] = []) {
  return {
    type: "object",
    additionalProperties: false,
    properties: { type: { type: "string", const: type }, ...properties },
    required: ["type", ...Object.keys(properties).filter((k) => !optional.includes(k))],
  };
}

export const REPORT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: TEXT,
    subtitle: TEXT,
    meta: {
      type: "object",
      additionalProperties: false,
      properties: {
        scope: TEXT,
        statusPills: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: { label: TEXT, tone: TONE },
            required: ["label", "tone"],
          },
        },
      },
      required: ["scope", "statusPills"],
    },
    keyStats: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { n: TEXT, l: TEXT },
        required: ["n", "l"],
      },
    },
    sections: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          heading: TEXT,
          blocks: {
            type: "array",
            minItems: 1,
            items: {
              anyOf: [
                block("p", { text: TEXT }),
                block("callout", { tone: TONE, title: TEXT, text: TEXT }, ["title"]),
                block("bullets", { items: TEXT_LIST }),
                block("table", { columns: TEXT_LIST, rows: { type: "array", items: TEXT_LIST } }),
              ],
            },
          },
        },
        required: ["heading", "blocks"],
      },
    },
    disclaimer: TEXT,
  },
  required: ["title", "subtitle", "meta", "keyStats", "sections", "disclaimer"],
};
