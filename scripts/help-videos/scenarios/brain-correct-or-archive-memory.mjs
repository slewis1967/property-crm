/** Brain: correct, rate and archive memories. Uses seeded demo memories (the seed file puts them back). */
import { replace } from "../lib/command-util.mjs";

const card = (title) => `div.rounded-lg.bg-white:has(h3:has-text("${title}"))`;
const FIX = card("Office is open Saturdays until noon");
const GOOD = card("First home buyers usually ask about the deposit first");
const OLD = card("Winter promotion ends 31 August");
const EDITOR = "div.border-2";

export default {
  start: "/brain",
  steps: [
    {
      say: "This is the Brain. Here is how to correct a memory, rate it, or stop it being used.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click Edit on the memory you want to fix.",
      do: async (h) => h.click(`${FIX} button:text-is("Edit")`),
    },
    {
      say: "Change the title, the details or the tags.",
      do: async (h) => replace(h, `${EDITOR} textarea`, "We take calls on Saturday mornings until one."),
    },
    {
      say: "Click Save.",
      do: async (h) => {
        await h.click(`${EDITOR} button:text-is("Save")`);
        await h.page.waitForSelector(EDITOR, { state: "detached" });
        await h.pause(500);
      },
    },
    {
      say: "Click the thumbs up if a memory is helpful, or the thumbs down if it is misleading. This changes its score and how often it is used.",
      do: async (h) => {
        await h.click(`${GOOD} button[title^="Helpful"]`);
        await h.pause(700);
        await h.point(`${GOOD} button[title^="Misleading"]`, 900);
      },
    },
    {
      say: "To stop a memory being used, click Archive, then OK to confirm.",
      do: async (h) => {
        await h.click(`${OLD} button:text-is("Archive")`);
        await h.page.waitForSelector(OLD, { state: "detached" });
      },
    },
    {
      say: "The memory is not deleted, but there is no button on this page to bring it back. So archive with care.",
      do: async (h) => h.pause(600),
    },
  ],
};
