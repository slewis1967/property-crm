/** Notes archive: find an old note. All notes and people are invented. */
export default {
  start: "/notes",
  steps: [
    {
      say: "This video shows how to find an old note from the previous system. Open Notes, under Archive in the sidebar.",
      do: async (h) => h.point('nav a[href="/notes"]', 1200),
    },
    {
      say: "Click the search box and type a word from the note.",
      do: async (h) => h.type('input[name="q"]', "pre-approval"),
    },
    {
      say: "Press Enter. The search looks at the wording of the note, not the contact's name.",
      do: async (h) => {
        await h.page.keyboard.press("Enter");
        await h.page.waitForURL(/q=pre-approval/);
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Each card is one contact's notes. A card can hold several entries.",
      do: async (h) => h.point("text=2 entries", 1400),
    },
    {
      say: "Each entry shows its date and who wrote it.",
      do: async (h) => h.point("text=by Alex Morgan >> nth=0", 1400),
    },
    {
      say: "Click the contact's name at the top of a card to open their record. Write any new note there, not on this page.",
      do: async (h) => {
        await h.click('main a:has-text("Olivia Bennett") >> nth=0');
        await h.page.waitForURL(/\/contacts\//);
        await h.page.waitForLoadState("networkidle");
      },
    },
  ],
};
