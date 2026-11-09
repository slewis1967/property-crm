/**
 * Shared by the Planning Feasibility scenarios (not a scenario itself).
 *
 * Answers the browser's calls to /api/ai/planning-feasibility with a made-up
 * interview and a made-up report, because the demo has no AI key. The address
 * and every figure are invented. The report carries no location, so the page
 * never asks an outside map service for a satellite picture.
 */
const ADDRESS = "14 Sample Street, Kelso QLD 4815";

export const DEMO_REPORT = {
  title: "Preliminary Planning Feasibility Assessment",
  subtitle: ADDRESS,
  meta: {
    scope: "Subdivision and duplex potential",
    statusPills: [
      { label: "Subdivision: likely", tone: "good" },
      { label: "Duplex: possible", tone: "warn" },
    ],
  },
  keyStats: [
    { n: "1,012 m2", l: "Lot size" },
    { n: "Low density residential", l: "Zone" },
    { n: "400 m2", l: "Minimum lot size" },
    { n: "2 lots", l: "Likely yield" },
  ],
  sections: [
    {
      heading: "Summary",
      blocks: [
        {
          type: "p",
          text: "This is an illustrative demo report. The block is large enough to consider a two lot subdivision, and a duplex may be possible, both subject to council assessment.",
        },
        {
          type: "callout",
          tone: "good",
          title: "Subdivision",
          text: "At 1,012 square metres the site is more than twice the minimum lot size for the zone.",
        },
        {
          type: "callout",
          tone: "warn",
          title: "Duplex",
          text: "A duplex is likely to need a development application. Frontage and car parking should be checked first.",
        },
      ],
    },
    {
      heading: "Planning controls",
      blocks: [
        {
          type: "table",
          columns: ["Control", "Requirement", "This site"],
          rows: [
            ["Minimum lot size", "400 m2", "1,012 m2"],
            ["Minimum frontage", "10 m", "22 m"],
            ["Overlays", "Check flood mapping", "None identified"],
          ],
        },
      ],
    },
    {
      heading: "Recommended next steps",
      blocks: [
        {
          type: "bullets",
          items: [
            "Confirm the zone and overlays with council.",
            "Order a survey to confirm the dimensions.",
            "Speak with a town planner before any contract.",
          ],
        },
      ],
    },
  ],
  disclaimer:
    "Demo content for training only. Preliminary planning information, not planning advice. Verify everything with council and a town planner.",
};

const QUESTIONS = [
  {
    id: "lot_size",
    label: "What is the lot size?",
    why: "Sets how many lots a subdivision could yield.",
    suggestion: "About 1,000 square metres",
  },
  {
    id: "existing",
    label: "What is on the block now?",
    why: "An existing house affects where a new boundary can go.",
    suggestion: "One house near the street",
  },
  {
    id: "frontage",
    label: "How wide is the street frontage?",
    why: "Each new lot needs a minimum frontage.",
    suggestion: "About 22 metres",
  },
];

/** Install the made-up answers on a page. Call before the page makes a request. */
export async function feasibilityRoute(page, { fast = false } = {}) {
  const wait = (ms) => new Promise((r) => setTimeout(r, fast ? 150 : ms));
  let interviews = 0;
  await page.route("**/api/ai/planning-feasibility", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    let out;
    if (body.phase === "prepare") {
      await wait(900);
      out = { ok: true, location: null, satellite: null };
    } else if (body.phase === "report") {
      await wait(2600);
      out = { ok: true, report: DEMO_REPORT };
    } else {
      await wait(1500);
      interviews += 1;
      out =
        interviews === 1
          ? {
              ok: true,
              status: "questions",
              understanding:
                "You want to know whether this block can be subdivided, and whether a duplex could be built.",
              questions: QUESTIONS,
            }
          : { ok: true, status: "ready", understanding: "Thanks. That is enough to prepare the report.", questions: [] };
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(out) });
  });
}
