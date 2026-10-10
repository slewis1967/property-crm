/**
 * Overview of the Stock Map: a tour of the page. Changes nothing. Demo data only.
 * The map background is the public street map the page always loads.
 */
import { centre } from "./lib/compliance-stock.mjs";

const END = "For step by step help with a task here, pick it from the list under this overview.";

export default {
  start: "/properties/map",
  steps: [
    {
      say: "This is the Stock Map. It puts the stock from the Aggregator Feed on a map, with one bubble for each suburb.",
      do: async (h) => {
        await h.page.waitForSelector(".leaflet-container canvas", { timeout: 20000 });
        await h.pause(1500);
      },
    },
    {
      say: "The filter bar works like the filters on the feed. Search, or choose a state, builder, type, bedrooms and price.",
      do: async (h) => {
        await h.point('input[placeholder^="Search suburb"]', 600);
        await h.point('select:has(option:text-is("All states"))', 500);
        await h.point('select:has(option:text-is("All builders"))', 500);
      },
    },
    {
      say: "The counts show how many properties are mapped, how many suburbs, and how many could not be placed.",
      do: async (h) => {
        await h.point('span:has-text("properties mapped")', 800);
        await h.point('span:has-text("not placed")', 800);
      },
    },
    {
      say: "On the map, bigger bubbles hold more properties. The buttons at the top right switch between street and satellite views.",
      do: async (h) => {
        await centre(h, ".leaflet-container");
        await h.point(".leaflet-container", 900);
        await h.point('button:text-is("Satellite")', 900);
      },
    },
    {
      say: "The key under the map explains the bubble colours, which follow the median package price.",
      do: async (h) => h.point("text=Median package price:", 1500),
    },
    {
      say: "Suburbs by volume, on the right, ranks suburbs by how many properties we hold.",
      do: async (h) => h.point('h2:has-text("Suburbs by volume")', 1500),
    },
    {
      say: "Click a bubble or a row to see the properties in that suburb, with Street View links.",
      do: async (h) => {
        await h.click('button:has-text("Ripley, QLD")');
        await h.page.waitForSelector("text=All suburbs");
        await h.point('a:has-text("suburb centre")', 1200);
      },
    },
    { say: END, do: async (h) => h.pause(600) },
  ],
};
