/** PIA Modeller: model an investment property. Changes nothing; the properties are seeded demo stock. */
import { replace } from "../lib/command-util.mjs";

const field = (label) => `label:has(> span:has-text("${label}")) input`;

export default {
  start: "/pia",
  steps: [
    {
      say: "This is the PIA Modeller. Here is how to model an investment property for a client.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click Pick property in the bar at the top.",
      do: async (h) => {
        await h.click('button:has-text("Pick property")');
        await h.page.waitForSelector('h2:has-text("Pick a property")');
      },
    },
    {
      say: "Search by suburb, street, builder or estate, then click a property.",
      do: async (h) => {
        await h.type('input[type="search"]', "Caboolture");
        await h.pause(900);
        await h.click('li button:has-text("12 Sample Street")');
      },
    },
    {
      say: "The purchase price, weekly rent and stamp duty are filled in for you. Check them, or type your own figures.",
      do: async (h) => {
        await h.point(field("Purchase price"), 1000);
        await h.point(field("Weekly rent"), 1000);
      },
    },
    {
      say: "Under Finance, set the loan amount and the interest rate. The loan to value ratio and deposit show underneath.",
      do: async (h) => {
        await replace(h, field("Loan amount"), "529600");
        await h.point("text=LVR:", 1200);
      },
    },
    {
      say: "Set the client's marginal tax rate under Tax and depreciation, and the holding period under Horizon.",
      do: async (h) => {
        await h.point('label:has(> span:has-text("Marginal tax rate")) input', 1000);
        await replace(h, field("Holding period (years)"), "15");
      },
    },
    {
      say: "Read the result tiles on the right. They update as you type.",
      do: async (h) => {
        await h.page.evaluate(() => document.querySelector("main")?.scrollTo?.({ top: 0 }));
        await h.page.mouse.wheel(0, -4000);
        await h.pause(500);
        await h.point('p:has-text("Cash needed at start")', 1000);
        await h.point('p:has-text("Equity at end")', 1000);
      },
    },
    {
      say: "Then click the summary, schedule and chart tabs to see the same result in different ways.",
      do: async (h) => {
        await h.click('button:has-text("Annual schedule")');
        await h.pause(1100);
        await h.click('button:has-text("Equity chart")');
        await h.pause(1100);
      },
    },
  ],
};
