/**
 * Builders: add notes and a sample stocklist to help the system read a builder's list.
 * Demo data only. The Upload sample button is pointed at, not used: the demo
 * has no file storage, and a file picker does not show in a recording anyway.
 */
import { centre, waitForApi } from "./lib/compliance-stock.mjs";

const NAME = "Ironbark Living";
const card = `div.space-y-4 > div:has(h3:text-is("${NAME}"))`;

export default {
  start: "/aggregator/builders",
  steps: [
    {
      say: "This video shows how to help the system read a builder's stocklist more accurately.",
      do: async (h) => {
        await h.page.waitForSelector(`h3:text-is("${NAME}")`);
        await h.pause(400);
      },
    },
    {
      say: "Under Stock builders, find the builder and click Edit on their card.",
      do: async (h) => {
        await centre(h, card);
        await h.click(`${card} button:text-is("Edit")`);
        await h.page.waitForSelector("text=Extraction context");
      },
    },
    {
      say: "In Notes for the extractor, describe anything unusual about their stocklist.",
      do: async (h) => {
        await centre(h, "text=Extraction context");
        await h.type("textarea", "Ignore Display Home rows. Prices are in thousands.");
      },
    },
    {
      say: "Click Upload sample and choose a PDF or Excel stocklist. It uploads as soon as you choose the file.",
      do: async (h) => h.point('span:has-text("Upload sample")', 1800),
    },
    {
      say: "When it has uploaded, this line says Sample uploaded, with links to view or remove the file.",
      do: async (h) => h.point("text=Sample PDF / Excel", 1500),
    },
    {
      say: "Click Save. Your notes are only kept when you save.",
      do: async (h) => {
        const done = waitForApi(h, "/api/aggregator/builders", "GET");
        await h.click('button:text-is("Save")');
        await done.catch(() => {});
        await h.pause(900);
      },
    },
  ],
};
