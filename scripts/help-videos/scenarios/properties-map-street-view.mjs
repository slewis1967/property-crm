/**
 * Stock Map: switch to satellite and find the Street View links. Demo data only.
 * The map backgrounds are the public street and satellite maps the page always loads.
 */
import { clickInside, centre } from "./lib/compliance-stock.mjs";

export default {
  start: "/properties/map",
  steps: [
    {
      say: "This video shows how to look at a suburb in satellite view or Street View.",
      do: async (h) => {
        await h.page.waitForSelector(".leaflet-container canvas", { timeout: 20000 });
        await h.pause(1500);
      },
    },
    {
      say: "Use the buttons at the top right of the map to switch between Streets, Satellite, and Satellite with labels.",
      do: async (h) => {
        await centre(h, ".leaflet-container");
        await h.click('button:text-is("Satellite")');
        await h.pause(1500);
        await h.click('button:text-is("Satellite + labels")');
        await h.pause(1500);
      },
    },
    {
      say: "Your choice is remembered for next time.",
      do: async (h) => {
        await h.click('button:text-is("Streets")');
        await h.pause(900);
      },
    },
    {
      say: "Find the suburb you want and click its bubble on the map.",
      do: async (h) => {
        await h.type('input[placeholder^="Search suburb"]', "Ripley");
        await h.pause(2000);
        await centre(h, ".leaflet-container");
        await clickInside(h, ".leaflet-container");
        await h.page.waitForSelector("text=All suburbs", { timeout: 10000 });
      },
    },
    {
      say: "Click Street View, suburb centre. It opens in a new tab at the middle of the suburb, not at a particular property.",
      do: async (h) => h.point('a:has-text("suburb centre")', 1800),
    },
    {
      say: "A property with a street address on file has its own Street View link underneath it.",
      do: async (h) => h.point('a:text-is("Street View ↗")', 1800),
    },
  ],
};
