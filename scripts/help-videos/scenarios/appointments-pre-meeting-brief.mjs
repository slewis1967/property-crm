/**
 * Appointments: ask for a pre-meeting brief.
 * The brief is written by the AI service, which the demo does not have, so the
 * browser's POST /api/ai/pre-meeting-brief is answered with made-up text.
 */
import { json } from "../lib-crm-b.mjs";

const BRIEF = [
  "Olivia Bennett, first home buyer, pre-approved, budget up to 700,000 dollars.",
  "Wants a house and land package north of Brisbane and hopes to buy within three months.",
  "Last email asked whether the package price includes the driveway and fencing.",
  "Suggested focus: confirm inclusions, then agree which two packages to compare.",
].join("\n");

export default {
  start: "/appointments",
  steps: [
    {
      say: "This video shows how to get a quick brief on a client before a meeting.",
      do: async (h) => {
        await h.page.route("**/api/ai/pre-meeting-brief", async (r) => {
          await new Promise((res) => setTimeout(res, 1500));
          await r.fulfill(json({ ok: true, text: BRIEF, cached: false }));
        });
        await h.pause(400);
      },
    },
    {
      say: "Find the meeting in the Upcoming list.",
      do: async (h) => h.point('span:has-text("Discovery call")', 1500),
    },
    {
      say: "Click Brief under the meeting. It takes a few seconds to write.",
      do: async (h) => {
        await h.click('button:has-text("Brief") >> nth=0');
        await h.page.waitForSelector("text=Olivia Bennett, first home buyer");
      },
    },
    {
      say: "Read the pre-meeting brief. It sums up who the client is and what to cover.",
      do: async (h) => h.point("text=Olivia Bennett, first home buyer", 2000),
    },
    {
      say: "Click close in the corner of the box when you are done.",
      do: async (h) => h.click('button:text-is("close")'),
    },
  ],
};
