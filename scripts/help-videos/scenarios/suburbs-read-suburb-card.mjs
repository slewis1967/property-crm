/** Suburb Intelligence: read a suburb card. Read only; the figures are invented for the demo. */
const card = 'div.rounded-xl:has(h3:text-is("Caboolture"))';

export default {
  start: "/suburbs",
  steps: [
    {
      say: "This video shows how to look up the numbers for a suburb in Suburb Intelligence.",
      do: async (h) => h.pause(600),
    },
    {
      say: "There is one card for each suburb. The count at the top right shows how many there are.",
      do: async (h) => {
        await h.point('main span.rounded-full:has-text("Suburbs")', 900);
        await h.point(`${card} h3`, 900);
      },
    },
    {
      say: "The percentage at the top right of the card is price growth. Green is up and red is down.",
      do: async (h) => h.point(`${card} span.rounded-full`, 1500),
    },
    {
      say: "Read the median price and the population.",
      do: async (h) => {
        await h.point(`${card} >> text=Median Price`, 800);
        await h.point(`${card} >> text=Population`, 800);
      },
    },
    {
      say: "Last updated shows when the figures were last refreshed.",
      do: async (h) => h.point(`${card} >> text=Last Updated`, 1300),
    },
    {
      say: "The Infrastructure list shows up to three items, when we hold them. The Elvis brief button underneath gives a written summary.",
      do: async (h) => h.point(`${card} >> text=Infrastructure`, 1500),
    },
  ],
};
