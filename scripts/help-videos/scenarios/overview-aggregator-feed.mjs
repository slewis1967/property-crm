/** Overview of the Aggregator Feed: a tour of the page. Changes nothing. Demo data only. */
import { centre } from "./lib/compliance-stock.mjs";

const END = "For step by step help with a task here, pick it from the list under this overview.";
const group = (label) => `div:has(> label:text-is("${label}"))`;
const card = 'div.rounded-xl:has-text("Bluegum Homes"):has(a:has-text("Detail"))';

export default {
  start: "/properties",
  steps: [
    {
      say: "This is the Aggregator Feed. It lists all the stock we currently hold from builders.",
      do: async (h) => h.pause(600),
    },
    {
      say: "Map view, at the top right, opens the same stock on the Stock Map.",
      do: async (h) => h.point('main a[href="/properties/map"]', 1300),
    },
    {
      say: "The search box finds stock by suburb, builder, estate or lot. The count on the right shows how many are showing.",
      do: async (h) => {
        await h.point('input[placeholder*="Search suburb"]', 900);
        await h.point("text=total active", 900);
      },
    },
    {
      say: "The filters narrow the feed by price, state, builder, property type, bedrooms and more.",
      do: async (h) => {
        await h.point(`${group("Price range")} input >> nth=0`, 500);
        await h.point(`${group("Builder / estate")} select`, 500);
        await h.point(`${group("Bedrooms")} button >> nth=0`, 500);
        await h.point(`${group("Contract")} select`, 500);
      },
    },
    {
      say: "Select all, and the tick box on each card, bring up Send to client, Compare and Delete.",
      do: async (h) => {
        await h.point('label:has-text("Select all")', 800);
        await centre(h, `${card} >> nth=0`);
        await h.point(`${card} >> nth=0 >> div.absolute.top-2.left-2`, 800);
      },
    },
    {
      say: "Each card shows the builder, suburb, status, price and size.",
      do: async (h) => {
        await h.point(`${card} >> nth=0 >> h3`, 1500);
      },
    },
    {
      say: "Detail opens the full page for a property. Open War Room gives a quick cashflow estimate.",
      do: async (h) => {
        await h.point(`${card} >> nth=0 >> a:has-text("Detail")`, 900);
        await h.point(`${card} >> nth=0 >> button:has-text("Open War Room")`, 900);
      },
    },
    {
      say: "Load more, at the bottom, brings in the rest. New stock arrives from builder stocklists and the Review Queue.",
      do: async (h) => {
        await centre(h, 'button:has-text("Load more")');
        await h.point('button:has-text("Load more")', 1300);
      },
    },
    { say: END, do: async (h) => h.pause(600) },
  ],
};
