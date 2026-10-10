/**
 * Aggregator Feed: send a shortlist of properties to a client. Demo data only.
 *
 * The demo CRM has no email keys, so the browser's POST to
 * /api/property-shortlists is answered inside this scenario with a made-up
 * success (a made-up link too). Everything else on screen is the real page.
 */
import { centre } from "./lib/compliance-stock.mjs";

const tick = (n) => `div.rounded-xl:has-text("Bluegum Homes") div.absolute.top-2.left-2 >> nth=${n}`;
const modal = 'div[role="dialog"]';

export default {
  start: "/properties",
  steps: [
    {
      say: "This video shows how to send a shortlist of properties to a client.",
      do: async (h) => {
        await h.page.route("**/api/property-shortlists", (route) =>
          route.request().method() === "POST"
            ? route.fulfill({
                contentType: "application/json",
                body: JSON.stringify({
                  ok: true,
                  link: "https://crm.example.com/shortlist/demo-4f9c2e7a1b",
                  emailed: true,
                  emailError: null,
                  unavailable: [],
                }),
              })
            : route.continue(),
        );
        await h.pause(400);
      },
    },
    {
      say: "Tick the box at the top left of each property you want to send.",
      do: async (h) => {
        await h.click(tick(0));
        await h.click(tick(1));
        await h.click(tick(2));
      },
    },
    {
      say: "Click Send to client, above the cards on the right.",
      do: async (h) => {
        await centre(h, 'button:has-text("Send to client")');
        await h.click('button:has-text("Send to client")');
        await h.page.waitForSelector(modal);
      },
    },
    {
      say: "Search for the client and click their name. This fills in their name and email.",
      do: async (h) => {
        await h.type(`${modal} input[placeholder^="Search contacts"]`, "Olivia");
        await h.click(`${modal} li button:has-text("Olivia Bennett")`);
      },
    },
    {
      say: "Add a heading and a short note if you like. Do not name builders or estates.",
      do: async (h) => h.type(`${modal} input[placeholder^="Heading"]`, "Three house and land options"),
    },
    {
      say: "For each property you can add the expected rent and why you picked it.",
      do: async (h) => {
        await h.type(`${modal} input[placeholder*="ent $/wk"] >> nth=0`, "590");
        await h.type(`${modal} input[placeholder^="Why we picked it"] >> nth=0`, "Close to the train line");
      },
    },
    {
      say: "Check the report assumptions, and who the Book a call button books with.",
      do: async (h) => {
        await h.point(`${modal} h3:has-text("Report assumptions")`, 900);
        await h.point(`${modal} label:has-text("Book a call") select`, 900);
      },
    },
    {
      say: "Click Review and send, check the name and email, then click Yes, send it. This emails the client and cannot be unsent.",
      do: async (h) => {
        await h.click(`${modal} button:has-text("Review & send")`);
        await h.pause(1800);
        await h.click(`${modal} button:has-text("Yes, send it")`);
        await h.page.waitForSelector("text=Shortlist created");
      },
    },
    {
      say: "Click Copy link, then Done. The link is only shown once.",
      do: async (h) => {
        await h.click(`${modal} button:has-text("Copy link")`);
        await h.pause(700);
        await h.click(`${modal} button:text-is("Done")`);
      },
    },
  ],
};
