/** Media Library archive: see which old files failed to save. All file names are invented. */
export default {
  start: "/media",
  steps: [
    {
      say: "This video shows how to see which old files were saved and which were missed. In Media Library, read the four tiles at the top.",
      do: async (h) => {
        await h.point('p:text-is("Downloaded OK")', 900);
        await h.point('p:text-is("Failed")', 900);
      },
    },
    {
      say: "They show how many files were saved, how many failed, how many were skipped, and the total size.",
      do: async (h) => {
        await h.point('p:text-is("Skipped (metadata-only)")', 900);
        await h.point('p:text-is("Total size on disk")', 900);
      },
    },
    {
      say: "Click failed, in the row of buttons under the tiles.",
      do: async (h) => {
        await h.click('a:text-is("failed")');
        await h.page.waitForURL(/status=failed/);
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "The list now shows only the files that did not save.",
      do: async (h) => h.point('td span:text-is("failed") >> nth=0', 1300),
    },
    {
      say: "The red text under the status is the reason the file could not be saved.",
      do: async (h) => h.point("text=File was no longer available to copy >> nth=0", 1500),
    },
    {
      say: "Click All to go back to the full list.",
      do: async (h) => {
        await h.click('a:text-is("All")');
        await h.page.waitForLoadState("networkidle");
        await h.pause(600);
      },
    },
  ],
};
