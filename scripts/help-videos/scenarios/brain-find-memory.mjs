/** Brain: find a memory. Reads only; the memories are seeded demo data. */
export default {
  start: "/brain",
  steps: [
    {
      say: "This is the Brain. Here is how to look up what the CRM already knows about a topic.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click a type button at the top to narrow the list. Here we choose Knowledge.",
      do: async (h) => {
        await h.click('button:text-is("Knowledge")');
        await h.pause(700);
      },
    },
    {
      say: "Type a word or phrase in the search box.",
      do: async (h) => h.type('input[placeholder^="Search memories"]', "rental yield"),
    },
    {
      say: "Click Search. Pressing Enter does the same thing. Typing alone does not search.",
      do: async (h) => {
        await h.click('button:text-is("Search")');
        await h.pause(900);
      },
    },
    {
      say: "Read the matching cards. Each one shows where it came from and how many times it has been used.",
      do: async (h) => {
        await h.point('h3:has-text("Investors want the rental yield up front")', 1200);
        await h.point("text=via human >> nth=0", 1500);
      },
    },
    {
      say: "To see everything again, clear the search box and click Search.",
      do: async (h) => h.point('input[placeholder^="Search memories"]', 1200),
    },
  ],
};
