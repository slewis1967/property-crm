/**
 * Shared Folder: search every folder, then view or download.
 * View and Download are pointed at, not clicked: the seeded demo files are
 * list entries only, and View opens a second browser tab the recorder cannot show.
 */
const ROW = 'tr:has-text("Wattlebrook Homes price list October.pdf")';

export default {
  start: "/shared-folder",
  steps: [
    {
      say: "This video shows how to find a file in the Shared Folder, then view it or download it.",
      do: async (h) => h.pause(600),
    },
    {
      say: "Type part of the file name in the search box and press Enter. It searches every folder at once.",
      do: async (h) => {
        await h.type('input[placeholder^="Search all folders"]', "price list");
        await h.page.keyboard.press("Enter");
        await h.page.waitForSelector(ROW);
      },
    },
    {
      say: "The heading shows what you searched for, and the matching files are listed underneath.",
      do: async (h) => h.point("h1", 1500),
    },
    {
      say: "Click View on the row to open the file in a new tab. View only shows for files the browser can display, such as P D Fs and images.",
      do: async (h) => h.point(`${ROW} >> button:text-is("View")`, 2000),
    },
    {
      say: "Click Download to save a copy to your computer.",
      do: async (h) => h.point(`${ROW} >> button:text-is("Download")`, 1500),
    },
    {
      say: "When you are finished, click Clear next to the search box to go back to the folders.",
      do: async (h) => {
        await h.click('button:text-is("Clear")');
        await h.page.waitForSelector('button:has-text("Client documents")');
      },
    },
  ],
};
