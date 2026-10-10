/**
 * War Room: work out stamp duty with the quick calculator. Nothing is saved.
 * The daily brief at the top of the page is a made-up stand-in; see lib/command-util.mjs.
 */
import { replace, warRoomBrief } from "../lib/command-util.mjs";

const CARD = 'div.bg-white.rounded-xl:has(> h3:has-text("Stamp duty by state"))';

export default {
  start: "/",
  steps: [
    {
      say: "This is the War Room, the home page of the CRM. Here is how to work out stamp duty while you are talking to a client.",
      do: async (h) => warRoomBrief(h),
    },
    {
      say: "Scroll down to Quick calculators and find the card called Stamp duty by state.",
      do: async (h) => {
        await h.point('h2:has-text("Quick calculators")', 800);
        await h.point(`${CARD} > h3`, 1200);
      },
    },
    {
      say: "Type the price into Purchase price.",
      do: async (h) => replace(h, `${CARD} label:has(> span:text-is("Purchase price")) input`, "650000"),
    },
    {
      say: "Choose the state. Each state has its own rates and concessions.",
      do: async (h) => h.select(`${CARD} select`, "NSW"),
    },
    {
      say: "Tick or untick First home buyer. The figures change straight away.",
      do: async (h) => {
        await h.click(`${CARD} label:has-text("First-home buyer") input`);
        await h.pause(900);
        await h.click(`${CARD} label:has-text("First-home buyer") input`);
      },
    },
    {
      say: "Read Duty payable. The figure is indicative, so check it with the state revenue office before a contract.",
      do: async (h) => h.point(`${CARD} span:text-is("Duty payable")`, 2000),
    },
  ],
};
