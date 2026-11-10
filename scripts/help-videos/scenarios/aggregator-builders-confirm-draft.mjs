/** Builders: check and confirm a builder the system created as a draft. Demo data only. */
import { centre, waitForApi } from "./lib/compliance-stock.mjs";

const draft = 'div.space-y-4 > div:has-text("DRAFT")';
const field = (label) => `label:has(span:text-is("${label}")) input`;

export default {
  start: "/aggregator/builders",
  steps: [
    {
      say: "This video shows how to confirm a new builder that is marked as a draft.",
      do: async (h) => {
        await h.page.waitForSelector("text=DRAFT");
        await h.pause(400);
      },
    },
    {
      say: "Under Stock builders, find the card marked Draft, needs review. Draft cards have an amber border.",
      do: async (h) => {
        await centre(h, draft);
        await h.point(`${draft} span:has-text("DRAFT")`, 1400);
      },
    },
    {
      say: "Click Edit.",
      do: async (h) => {
        await h.click(`${draft} button:text-is("Edit")`);
        await h.page.waitForSelector(field("Canonical name"));
      },
    },
    {
      say: "Correct the canonical name. This is the one name all of this builder's stock is grouped under.",
      do: async (h) => {
        await h.page.locator(field("Canonical name")).fill("");
        await h.type(field("Canonical name"), "Wattlebird Homes");
      },
    },
    {
      say: "Fill in aliases, which are other names the builder uses, and the sender domains their stocklists come from.",
      do: async (h) => {
        await h.type(field("Aliases (comma-separated)"), "Wattlebird");
        await h.point(field("Sender domains (comma-separated)"), 800);
      },
    },
    {
      say: "Fill in the contact email and phone.",
      do: async (h) => {
        await h.type(field("Contact email"), "stock@wattlebird.example.com");
        await h.type(field("Contact phone"), "0491 570 230");
      },
    },
    {
      say: "Click Save. Saving removes the draft label.",
      do: async (h) => {
        const done = waitForApi(h, "/api/aggregator/builders", "GET");
        await h.click('button:text-is("Save")');
        await done.catch(() => {});
        await h.page.waitForSelector('h3:text-is("Wattlebird Homes")');
        await centre(h, 'h3:text-is("Wattlebird Homes")');
        await h.point('h3:text-is("Wattlebird Homes")', 1300);
      },
    },
  ],
};
