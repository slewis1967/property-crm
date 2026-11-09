/** Overview of Suburb Intelligence: a tour of the page. Read only. The figures are invented for the demo. */
const END = "For step by step help with a task here, pick it from the list under this overview.";
const card = 'div.rounded-xl:has(h3:text-is("Ripley"))';

export default {
  start: "/suburbs",
  steps: [
    {
      say: "This is Suburb Intelligence. Use it to look up a suburb before you talk to a client about it.",
      do: async (h) => h.pause(600),
    },
    {
      say: "The badge at the top right shows how many suburbs are on the page.",
      do: async (h) => h.point('main span.rounded-full:has-text("Suburbs")', 1300),
    },
    {
      say: "There is one card for each suburb, with its name and state.",
      do: async (h) => h.point(`${card} h3`, 1300),
    },
    {
      say: "The percentage is price growth. Green is up and red is down.",
      do: async (h) => {
        await h.point(`${card} span.rounded-full`, 900);
        await h.page.locator('div.rounded-xl:has(h3:text-is("Tarneit"))').evaluate((el) => el.scrollIntoView({ block: "center" }));
        await h.point('div.rounded-xl:has(h3:text-is("Tarneit")) span.rounded-full', 900);
      },
    },
    {
      say: "Median price, population and last updated are the headline figures, and when they were refreshed.",
      do: async (h) => {
        await h.page.locator(card).evaluate((el) => el.scrollIntoView({ block: "center" }));
        await h.point(`${card} >> text=Median Price`, 600);
        await h.point(`${card} >> text=Population`, 600);
        await h.point(`${card} >> text=Last Updated`, 600);
      },
    },
    {
      say: "Infrastructure lists up to three local projects or features worth mentioning.",
      do: async (h) => h.point(`${card} >> text=Infrastructure`, 1300),
    },
    {
      say: "Elvis brief, at the bottom of each card, opens a short written summary of the suburb.",
      do: async (h) => h.point(`${card} button:has-text("Elvis brief")`, 1300),
    },
    { say: END, do: async (h) => h.pause(600) },
  ],
};
