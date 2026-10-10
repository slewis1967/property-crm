/** Overview of the PIA Modeller. A tour only; nothing is saved or sent. */
const section = (title) => `div.bg-white.rounded-xl:has(> h3:text-is("${title}")) > h3`;

export default {
  start: "/pia",
  steps: [
    {
      say: "This is the PIA Modeller. It works out, year by year, how an investment property is likely to perform for a client.",
      do: async (h) => h.pause(500),
    },
    {
      say: "A notice at the top reminds you that the figures are general information, not personal financial advice.",
      do: async (h) => h.point("text=General advice only", 2000),
    },
    {
      say: "The bar of buttons lets you pick a property, save the report, print it, or email it.",
      do: async (h) => {
        await h.point('button:has-text("Pick property")', 800);
        await h.point('button:has-text("Save report")', 800);
        await h.point('button:text-is("Email")', 800);
      },
    },
    {
      say: "Down the left side are the input boxes, in groups. They run from Property and costs, through Finance, to Tax and Horizon.",
      do: async (h) => {
        await h.point(section("Property"), 800);
        await h.point(section("Operating costs (year 1)"), 800);
        await h.point(section("Finance"), 800);
        await h.point(section("Horizon"), 800);
      },
    },
    {
      say: "On the right are the result tiles, such as cash needed at the start, equity at the end, and total return. They update as you type.",
      do: async (h) => {
        await h.page.mouse.wheel(0, -6000);
        await h.pause(500);
        await h.point('p:has-text("Cash needed at start")', 900);
        await h.point('p:has-text("Equity at end")', 900);
        await h.point('p:has-text("Total return")', 900);
      },
    },
    {
      say: "Three tabs show the same result in words, as a year by year table, and as a chart.",
      do: async (h) => {
        await h.point('button:has-text("Plain-English summary")', 700);
        await h.click('button:has-text("Annual schedule")');
        await h.pause(900);
        await h.click('button:has-text("Equity chart")');
        await h.pause(900);
      },
    },
    {
      say: "Pick property lists active stock from the Aggregator Feed, and fills in its price and rent for you.",
      do: async (h) => {
        await h.click('button:has-text("Pick property")');
        await h.page.waitForSelector('h2:has-text("Pick a property")');
        await h.pause(1200);
        await h.click('h2:has-text("Pick a property") + button');
      },
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(400),
    },
  ],
};
