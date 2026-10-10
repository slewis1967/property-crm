/** Overview of Notes (archive). A tour only. All notes and people are invented. */
export default {
  start: "/notes",
  steps: [
    {
      say: "Notes is a view only record of the notes written against contacts in the previous system.",
      do: async (h) => h.point('h1:has-text("Notes")', 1500),
    },
    {
      say: "The count beside the heading shows how many old notes are held.",
      do: async (h) => h.point("text=/\\d+ records?/", 1400),
    },
    {
      say: "The search box finds notes by a word in the note. It does not search by name.",
      do: async (h) => h.point('input[name="q"]', 1700),
    },
    {
      say: "Each card is one contact's notes. The top line has their name and email, and the date the note was last edited.",
      do: async (h) => {
        await h.point('main a:has-text("Olivia Bennett") >> nth=0', 1200);
        await h.point("text=/Last edit:/ >> nth=0", 1200);
      },
    },
    {
      say: "A pinned label shows the note was pinned. Clicking the name opens that person on Contacts.",
      do: async (h) => h.point("text=pinned >> nth=0", 1500),
    },
    {
      say: "A card can hold several entries. Each one shows what was written, the date, and who wrote it.",
      do: async (h) => {
        await h.point("text=2 entries", 1000);
        await h.point("text=by Alex Morgan >> nth=0", 1300);
      },
    },
    {
      say: "New notes are not written here. They go on the contact's own record.",
      do: async (h) => h.pause(600),
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(600),
    },
  ],
};
