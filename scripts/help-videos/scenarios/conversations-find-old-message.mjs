/** Conversations archive: find an old conversation. All messages and people are invented. */
export default {
  start: "/conversations",
  steps: [
    {
      say: "This video shows how to find an old conversation from the previous system. Open Conversations, under Archive in the sidebar.",
      do: async (h) => h.point('nav a[href="/conversations"]', 1200),
    },
    {
      say: "Click the search box and type a word from the message.",
      do: async (h) => h.type('input[name="q"]', "brochure"),
    },
    {
      say: "Press Enter. The search looks at the wording of the last message, not the contact's name.",
      do: async (h) => {
        await h.page.keyboard.press("Enter");
        await h.page.waitForURL(/q=brochure/);
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Read the last message and when it was sent. The Type column shows whether it was an email, a text message or a call.",
      do: async (h) => {
        await h.point('th:text-is("Last message")', 900);
        await h.point('th:text-is("Type")', 900);
      },
    },
    {
      say: "When there are more results than fit on one page, use Next at the bottom of the list.",
      do: async (h) => h.point("text=/Page 1 of/", 1300),
    },
    {
      say: "Click the contact's name to open their record.",
      do: async (h) => {
        await h.click('td a:has-text("Olivia Bennett")');
        await h.page.waitForURL(/\/contacts\//);
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Nothing in the archive can be changed, and no messages can be sent from it.",
      do: async (h) => h.pause(800),
    },
  ],
};
