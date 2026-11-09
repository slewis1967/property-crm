/**
 * Overview of Inbox: a tour of the page. Opens one conversation to show what is
 * inside (which marks it read, the same as any visit); nothing is sent, moved or deleted.
 */
export default {
  start: "/inbox",
  steps: [
    {
      say: "This is the Inbox. It is your CRM email. What clients have sent you, what you have sent, and your drafts.",
      do: async (h) => h.point("h1", 1300),
    },
    {
      say: "Compose, at the top left, starts a new email.",
      do: async (h) => h.point('a:has-text("Compose")', 1400),
    },
    {
      say: "The Mail list switches between Inbox, Starred, Sent, Drafts, Archive, Spam and Trash. The numbers show unread mail and saved drafts.",
      do: async (h) => {
        await h.point('aside a:has-text("Inbox")', 900);
        await h.point('aside a:has-text("Drafts")', 900);
        await h.point('aside a:has-text("Trash")', 800);
      },
    },
    {
      say: "Folders are your own, for filing mail.",
      do: async (h) => h.point("aside >> text=Folders", 1400),
    },
    {
      say: "Search mail finds emails by their wording in the list you are looking at.",
      do: async (h) => h.point('input[placeholder^="Search mail"]', 1400),
    },
    {
      say: "Each row is one conversation, with its subject, who it is from, the matching contact and when the latest message arrived.",
      do: async (h) => h.point('tr:has-text("Ready to look at a third property")', 1800),
    },
    {
      say: "Click a row to read the messages underneath. There is a Reply button, and a link to that person's page in Contacts.",
      do: async (h) => {
        await h.click('p:has-text("Ready to look at a third property")');
        await h.point('button[title="Reply to this message"]', 1000);
        await h.point("text=Open contact for full context", 1000);
      },
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(400),
    },
  ],
};
