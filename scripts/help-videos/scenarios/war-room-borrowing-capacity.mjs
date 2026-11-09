/**
 * War Room: estimate what a client can borrow with the quick calculator.
 * Nothing is saved; the figures typed in are made up.
 * The daily brief at the top of the page is a made-up stand-in; see lib/command-util.mjs.
 */
import { replace, warRoomBrief } from "../lib/command-util.mjs";

const CARD = 'div.bg-white.rounded-xl:has(> h3:has-text("Borrowing capacity"))';
const field = (label) => `${CARD} label:has(> span:text-is("${label}")) input`;

export default {
  start: "/",
  steps: [
    {
      say: "This is the War Room. Here is how to estimate what a client can borrow while you are on a call.",
      do: async (h) => warRoomBrief(h),
    },
    {
      say: "Scroll down to Quick calculators at the bottom of the page, and find the Borrowing capacity card.",
      do: async (h) => {
        await h.point('h2:has-text("Quick calculators")', 900);
        await h.point(`${CARD} > h3`, 1200);
      },
    },
    {
      say: "Type the client's pay into Your gross annual income. Add a partner income if there are two.",
      do: async (h) => {
        await replace(h, field("Your gross annual income"), "92000");
        await replace(h, field("Partner gross income (optional)"), "78000");
      },
    },
    {
      say: "Type their savings into Savings or deposit available.",
      do: async (h) => replace(h, field("Savings / deposit available"), "90000"),
    },
    {
      say: "Choose the state for stamp duty, and tick First home buyer if it applies.",
      do: async (h) => {
        await h.select(`${CARD} label:has(> span:text-is("State (for duty)")) select`, "QLD");
        await h.click(`${CARD} label:has-text("First-home buyer (duty concession)") input`);
      },
    },
    {
      say: "Click Add existing property for each property they already own, and enter its value, loan and rent.",
      do: async (h) => {
        await h.click(`${CARD} button:has-text("Add existing property")`);
        await replace(h, `${CARD} label:has(> span:text-is("Value")) input`, "520000");
        await replace(h, `${CARD} label:has(> span:text-is("Loan balance")) input`, "310000");
        await replace(h, `${CARD} label:has(> span:text-is("Weekly rent")) input`, "540");
      },
    },
    {
      say: "Then read Estimated max loan and Max purchase price. These are estimates only, and nothing here is saved.",
      do: async (h) => {
        await h.point(`${CARD} span:text-is("Estimated max loan")`, 1500);
        await h.point(`${CARD} span:text-is("Max purchase price")`, 1500);
      },
    },
  ],
};
