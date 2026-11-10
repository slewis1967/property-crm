/** Inbox: archive, bin and file conversations. Real changes (demo database); the seed resets them. */
const box = (subject) => `input[aria-label="Select ${subject}"]`;
const DIGEST = "This week in property: five suburbs to watch";
const AMELIA = "Can we move our catch-up to the afternoon?";
const PRICES = "Updated price list for October";

export default {
  start: "/inbox",
  steps: [
    {
      say: "This video shows how to tidy up your inbox, so it only shows what still needs you.",
      do: async (h) => h.pause(600),
    },
    {
      say: "Tick the box beside one or more conversations. A dark bar appears above the list.",
      do: async (h) => {
        await h.click(box(AMELIA));
        await h.page.waitForSelector("text=1 selected");
      },
    },
    {
      say: "Click Archive to clear them out of the inbox but keep them. You can find them later under Archive on the left.",
      do: async (h) => {
        await h.click('div.sticky button:has-text("Archive")');
        await h.page.waitForSelector(box(AMELIA), { state: "detached" });
        await h.point('aside a:has-text("Archive")', 1000);
      },
    },
    {
      say: "The same bar has Star to flag a conversation, and Mark read or Mark unread.",
      do: async (h) => {
        await h.click(box(DIGEST));
        await h.point('div.sticky button:has-text("Star") >> nth=0', 800);
        await h.point('button:text-is("Mark read")', 800);
      },
    },
    {
      say: "Click Trash or Spam to get rid of them. Trash and Spam are emptied for good after thirty days.",
      do: async (h) => {
        await h.click('div.sticky button:has-text("Trash")');
        await h.page.waitForSelector(box(DIGEST), { state: "detached" });
      },
    },
    {
      say: "To make a folder, click New beside Folders on the left, type a name, then click anywhere outside the box.",
      do: async (h) => {
        await h.click('button[title="New folder"]');
        await h.type('input[placeholder="Folder name"]', "Builders");
        // Clicking away saves it. (Pressing Enter currently saves the folder twice.)
        await h.click("h1");
        await h.page.waitForSelector('aside a:has-text("Builders")');
      },
    },
    {
      say: "Then tick a conversation, click Move to, and pick the folder. It is filed there, and it also stays in your inbox until you archive it.",
      do: async (h) => {
        await h.click(box(PRICES));
        await h.click('div.sticky button:has-text("Move to")');
        await h.click('div.absolute button:text-is("Builders")');
        // It stays in the Inbox as well; the bar closing shows the move is done.
        await h.page.waitForSelector("text=1 selected", { state: "detached" });
      },
    },
    {
      say: "Click the folder on the left to see what is filed there.",
      do: async (h) => {
        await h.click('aside a:has-text("Builders")');
        await h.page.waitForSelector(`p:has-text("${PRICES}")`);
        await h.pause(800);
      },
    },
  ],
};
