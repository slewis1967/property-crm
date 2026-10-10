/** Shared Folder: rename, move, delete and restore. Real changes (demo database); the seed resets them. */
const OLD = "Old price list draft.pdf";
const NEW = "Price list 2025 archive.pdf";
const row = (name) => `tr:has-text("${name}")`;

export default {
  start: "/shared-folder",
  steps: [
    {
      say: "This video shows how to rename, move and delete files in the Shared Folder, and how to get a deleted file back.",
      do: async (h) => h.pause(600),
    },
    {
      say: "To rename a file, click Rename on its row, type the new name, then click Save.",
      do: async (h) => {
        await h.click(`${row(OLD)} >> button:text-is("Rename")`);
        await h.page.locator("td input").first().fill("");
        await h.type("td input", NEW);
        await h.click('td button:text-is("Save")');
        await h.page.waitForSelector(`td:has-text("${NEW}")`);
      },
    },
    {
      say: "To move a file, click Move, then pick a folder from the list. It moves as soon as you pick.",
      do: async (h) => {
        await h.click(`${row(NEW)} >> button:text-is("Move")`);
        await h.select('select:has(option[value="__root__"])', { label: "Builder price lists" });
        await h.page.waitForSelector(`td:has-text("${NEW}")`, { state: "detached" });
      },
    },
    {
      say: "To remove a file or folder, click Delete. There is no confirmation. It goes straight to the Trash.",
      do: async (h) => {
        await h.click(`${row("Office phone list.pdf")} >> button:text-is("Delete")`);
        await h.page.waitForSelector('td:has-text("Office phone list.pdf")', { state: "detached" });
      },
    },
    {
      say: "Click Trash at the top right to see deleted items.",
      do: async (h) => {
        await h.click('button:has-text("Trash")');
        await h.page.waitForSelector('button:text-is("Restore")');
      },
    },
    {
      say: "Delete forever removes an item for good and cannot be undone, so only use it if you are sure.",
      do: async (h) => h.point('button:text-is("Delete forever")', 1500),
    },
    {
      say: "Click Restore to put an item back where it was.",
      do: async (h) => {
        await h.click('button:text-is("Restore")');
        await h.page.waitForSelector("text=Nothing in the trash");
      },
    },
    {
      say: "Then click Back to files. The restored file is in the list again.",
      do: async (h) => {
        await h.click('button:has-text("Back to files")');
        await h.point('td:has-text("Office phone list.pdf")', 1200);
      },
    },
  ],
};
