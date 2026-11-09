/**
 * Suburb Intelligence: ask Elvis for a written brief on a suburb. Demo data only.
 *
 * The brief is written by an AI service the demo CRM has no key for, so the
 * browser's call to /api/ai/suburb-brief is answered inside this scenario with
 * a made-up brief in the same layout. The figures in it are invented.
 */
const card = 'div.rounded-xl:has(h3:text-is("Ripley"))';

const BRIEF = [
  "Snapshot: Ripley is a growing suburb south of Ipswich with a median price around $640,000 and steady growth over the past year. It suits young families and first home buyers.",
  "",
  "What we have here: We hold five house and land packages in one estate, priced close to the suburb median. They suit first home buyers and investors.",
  "",
  "Talking points:",
  "• A new town centre is taking shape",
  "• A rail extension is planned",
  "• Two new schools are on the way",
].join("\n");

export default {
  start: "/suburbs",
  steps: [
    {
      say: "This video shows how to get a short written summary of a suburb from Elvis.",
      do: async (h) => {
        await h.page.route("**/api/ai/suburb-brief", async (route) => {
          await new Promise((r) => setTimeout(r, 1500));
          await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, text: BRIEF, cached: false }) });
        });
        await h.pause(400);
      },
    },
    {
      say: "Scroll to the card for the suburb.",
      do: async (h) => h.point(`${card} h3`, 1200),
    },
    {
      say: "Click Elvis brief at the bottom of the card. The brief takes a few seconds to appear.",
      do: async (h) => {
        await h.click(`${card} button:has-text("Elvis brief")`);
        await h.page.waitForSelector("text=Snapshot:");
      },
    },
    {
      say: "Read the brief. It covers the market, the stock we hold there, and talking points for your call.",
      do: async (h) => {
        await h.page.locator(`${card} >> text=Talking points`).evaluate((el) => el.scrollIntoView({ block: "center" }));
        await h.pause(3600);
      },
    },
    {
      say: "Use it as a starting point, and check the figures on the card before you quote them to a client.",
      do: async (h) => h.point(`${card} >> text=Median Price`, 1500),
    },
    {
      say: "Click close to hide it. You can open a brief on any suburb card.",
      do: async (h) => {
        await h.click(`${card} button:text-is("close")`);
        await h.pause(1200);
      },
    },
  ],
};
