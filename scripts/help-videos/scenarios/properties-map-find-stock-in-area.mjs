/**
 * Stock Map: find suburbs with stock and see what is there. Demo data only.
 * The map background is the public street map the page always loads.
 */
import { clickInside, centre } from "./lib/compliance-stock.mjs";

export default {
  start: "/properties/map",
  steps: [
    {
      say: "This video shows how to use the Stock Map to see what stock we have in an area.",
      do: async (h) => {
        await h.page.waitForSelector(".leaflet-container canvas", { timeout: 20000 });
        await h.pause(1500);
        await h.pause(600);
      },
    },
    {
      say: "Set the filters above the map. You can search, or choose a state, builder, type, bedrooms and price.",
      do: async (h) => {
        await h.select('select:has(option:text-is("All states"))', "QLD");
        await h.point('select:has(option:text-is("All builders"))', 500);
        await h.select('select:has(option:text-is("Any beds"))', "4");
        await h.type('input[placeholder^="Search suburb"]', "Ripley");
        await h.pause(1800);
      },
    },
    {
      say: "Each bubble is a suburb. Bigger bubbles hold more properties. Click a bubble on the map.",
      do: async (h) => {
        await centre(h, ".leaflet-container");
        await clickInside(h, ".leaflet-container");
        await h.page.waitForSelector("text=All suburbs", { timeout: 10000 });
      },
    },
    {
      say: "The summary on the right shows how many properties are there, the price range, the median price and the builders.",
      do: async (h) => h.point("main h2.font-bold", 1800),
    },
    {
      say: "Click a property in the list to open it.",
      do: async (h) => h.point('a[href^="/properties/"]:has(span.font-medium) >> nth=0', 1500),
    },
    {
      say: "Click All suburbs to go back to the full list. You can also click a suburb in this list.",
      do: async (h) => {
        await h.click('button:has-text("All suburbs")');
        await h.point('h2:has-text("Suburbs by volume")', 900);
      },
    },
    {
      say: "Click Clear at the end of the filter bar to remove the filters.",
      do: async (h) => {
        await h.click('button:text-is("Clear")');
        await h.pause(1200);
      },
    },
  ],
};
