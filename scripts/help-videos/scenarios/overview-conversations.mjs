/** Overview of Conversations (archive). A tour only. All messages and people are invented. */
export default {
  start: "/conversations",
  steps: [
    {
      say: "Conversations is a view only record of old email and text message conversations kept from the previous system.",
      do: async (h) => h.point('h1:has-text("Conversations")', 1500),
    },
    {
      say: "The count beside the heading shows how many old conversations are held.",
      do: async (h) => h.point("text=/\\d+ records?/", 1400),
    },
    {
      say: "The search box finds conversations by a word in the last message. It does not search by name.",
      do: async (h) => h.point('input[name="q"]', 1700),
    },
    {
      say: "The Contact column shows the person's name and email. Clicking the name opens their record on Contacts.",
      do: async (h) => {
        await h.point('th:text-is("Contact")', 800);
        await h.point('td a:has-text("Olivia Bennett")', 1300);
      },
    },
    {
      say: "Type shows whether it was an email, a text message or a call. Last message shows the start of what was said.",
      do: async (h) => {
        await h.point('th:text-is("Type")', 1000);
        await h.point('th:text-is("Last message")', 1200);
      },
    },
    {
      say: "When is the date of the last message. Unread shows a red number if messages were left unread.",
      do: async (h) => {
        await h.point('th:text-is("When")', 1000);
        await h.point('th:text-is("Unread")', 1200);
      },
    },
    {
      say: "The page count is at the bottom, with buttons to move on when there is more than one page.",
      do: async (h) => h.point("text=/Page 1 of/", 1500),
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(600),
    },
  ],
};
