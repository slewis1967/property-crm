/** Contacts: search, filter, sort and export. Reads only (the export is a file download). */
export default {
  start: "/contacts",
  steps: [
    {
      say: "This video shows how to find the contacts you need, and save the list as a spreadsheet.",
      do: async (h) => h.pause(600),
    },
    {
      say: "Type in the search box. The list narrows as you type.",
      do: async (h) => {
        await h.type('input[placeholder^="Search name, email"]', "nguyen");
        await h.pause(1200);
        await h.page.locator('input[placeholder^="Search name, email"]').fill("");
      },
    },
    {
      say: "Click a type on the left, such as Investor, to see only those contacts.",
      do: async (h) => {
        await h.click('nav button:has-text("Investor")');
        await h.pause(800);
      },
    },
    {
      say: "Use the dropdowns to narrow by temperature, status or tag.",
      do: async (h) => {
        await h.select('select:has(option[value="hot"])', "hot");
        await h.pause(900);
        await h.select('select:has(option[value="hot"])', "all");
      },
    },
    {
      say: "Change the sort dropdown to reorder the list, for example by lead score.",
      do: async (h) => h.select('select:has(option[value="score"])', "score"),
    },
    {
      say: "Search and filters only look through contacts that are loaded. If someone is missing, use Load more at the bottom of the list.",
      do: async (h) => h.point("#contacts-page-size", 1200),
    },
    {
      say: "Click Export C S V to download the list you are looking at. Tick boxes on the left first if you only want certain rows.",
      do: async (h) => {
        await h.point("tbody input[type=checkbox] >> nth=0", 800);
        await h.click('button:has-text("Export CSV")');
      },
    },
    {
      say: "Click any row to open that contact.",
      do: async (h) => h.point('p:text-is("Mia Anderson")', 1500),
    },
  ],
};
