/**
 * Stock Map: read the counts and colours, and see what could not be placed. Demo data only.
 * The Locate button is pointed at, not clicked: it looks suburbs up with an
 * outside mapping service, which the demo must not call.
 */
import { centre } from "./lib/compliance-stock.mjs";

export default {
  start: "/properties/map",
  steps: [
    {
      say: "This video shows how to check what the Stock Map is showing, and how to place missing suburbs.",
      do: async (h) => {
        await h.page.waitForSelector(".leaflet-container canvas", { timeout: 20000 });
        await h.pause(1200);
      },
    },
    {
      say: "The counts above the map show how many properties are mapped, how many suburbs, and how many are not placed.",
      do: async (h) => {
        await h.point('span:has-text("properties mapped")', 900);
        await h.point('span:has-text("not placed")', 900);
      },
    },
    {
      say: "If a Locate suburbs button shows, click it. It only appears when there are suburbs the map has never looked up, and it can take a minute.",
      do: async (h) => h.point('button:has-text("Locate ")', 2000),
    },
    {
      say: "Under the map, the colours show the median package price. Each bubble is coloured by the middle price of the stock in that suburb.",
      do: async (h) => {
        await centre(h, "text=Median package price:");
        await h.point("text=Median package price:", 1800);
      },
    },
    {
      say: "At the bottom of the suburb list, Not on the map lists stock that could not be placed, and why.",
      do: async (h) => {
        await centre(h, 'p:has-text("Not on the map")');
        await h.point('p:has-text("Not on the map")', 1800);
      },
    },
  ],
};
