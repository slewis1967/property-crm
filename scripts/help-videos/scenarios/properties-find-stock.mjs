/** Aggregator Feed: search and filter the stock. Demo data only; every builder and estate is invented. */
import { centre } from "./lib/compliance-stock.mjs";

const group = (label, rest) => `div:has(> label:text-is("${label}")) ${rest}`;

export default {
  start: "/properties",
  steps: [
    {
      say: "This video shows how to find properties that suit a client in the Aggregator Feed.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Type a suburb, builder, estate, address or lot in the search box. The feed updates as you type.",
      do: async (h) => {
        await h.type('input[placeholder*="Search suburb"]', "Ripley");
        await h.pause(900);
      },
    },
    {
      say: "Set the price range. Type a minimum and maximum, or click one of the quick buttons.",
      do: async (h) => {
        await h.click('button:text-is("$500-700k")');
        await h.pause(700);
      },
    },
    {
      say: "Choose a state, a builder or estate, or a property type.",
      do: async (h) => {
        await h.select(group("State", "select"), "QLD");
        await h.point(group("Builder / estate", "select"), 600);
        await h.point(group("Property type", "select"), 600);
      },
    },
    {
      say: "Click a number under Bedrooms, Bathrooms or Car spaces. Four plus means four or more.",
      do: async (h) => {
        await h.click(group("Bedrooms", 'button:text-is("4+")'));
        await h.pause(700);
      },
    },
    {
      say: "Narrow further with Contract, Status or Titled. These three only filter the properties already loaded.",
      do: async (h) => {
        await h.select(group("Contract", "select"), "split");
        await h.point(group("Status", "select"), 500);
        await h.point(group("Titled", "select"), 500);
      },
    },
    {
      say: "The matching properties show underneath, with a count at the top right.",
      do: async (h) => {
        await h.scroll(420);
        await h.pause(1200);
        await h.scroll(-420);
      },
    },
    {
      say: "Click Clear all to start again.",
      do: async (h) => {
        await h.click('button:text-is("Clear all")');
        await h.pause(1200);
      },
    },
    {
      say: "Click Load more at the bottom to bring in the rest of the feed.",
      do: async (h) => {
        await centre(h, 'button:has-text("Load more")');
        await h.click('button:has-text("Load more")');
        await h.pause(1200);
      },
    },
  ],
};
