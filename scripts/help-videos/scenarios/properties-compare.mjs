/** Aggregator Feed: compare properties side by side. Demo data only. */
import { centre } from "./lib/compliance-stock.mjs";

const tick = (n) => `div.rounded-xl:has-text("Bluegum Homes") div.absolute.top-2.left-2 >> nth=${n}`;

export default {
  start: "/properties",
  steps: [
    {
      say: "This video shows how to compare properties side by side.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Tick the box at the top left of two or more properties.",
      do: async (h) => {
        await h.click(tick(0));
        await h.click(tick(1));
      },
    },
    {
      say: "Click Compare, above the cards. It opens the Property Comparison page.",
      do: async (h) => {
        await centre(h, 'button:has-text("Compare")');
        await h.click('button:has-text("Compare")');
        await h.page.waitForURL(/\/compare/);
        await h.page.waitForSelector("text=Property Comparison");
      },
    },
    {
      say: "Read the card for each property. Each one shows the price, address, size, builder and description.",
      do: async (h) => {
        await h.scroll(330);
        await h.pause(900);
      },
    },
    {
      say: "Scroll down to the Side by Side Comparison table. It lines the properties up row by row.",
      do: async (h) => {
        await centre(h, 'h2:has-text("Side-by-Side Comparison")');
        await h.point('h2:has-text("Side-by-Side Comparison")', 1300);
      },
    },
    {
      say: "Click Detail on a card to open that property.",
      do: async (h) => {
        await centre(h, 'main a:has-text("Detail")');
        await h.point('main a:has-text("Detail")', 1200);
      },
    },
    {
      say: "Click Clear Comparison when you are finished.",
      do: async (h) => {
        await h.click('button:has-text("Clear Comparison")');
        await h.page.waitForSelector("text=Browse Properties");
      },
    },
    {
      say: "Then click Browse Properties to go back to the feed.",
      do: async (h) => h.point("text=Browse Properties", 1300),
    },
  ],
};
