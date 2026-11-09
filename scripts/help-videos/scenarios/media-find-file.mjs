/** Media Library archive: find an old file. All file names are invented. */
export default {
  start: "/media",
  steps: [
    {
      say: "This video shows how to find an old file from the previous system. Open Media Library, under Archive in the sidebar.",
      do: async (h) => h.point('nav a[href="/media"]', 1200),
    },
    {
      say: "Click the search box and type part of the file name.",
      do: async (h) => h.type('input[name="q"]', "contract"),
    },
    {
      say: "Press Enter to search.",
      do: async (h) => {
        await h.page.keyboard.press("Enter");
        await h.page.waitForURL(/q=contract/);
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Check the Status column. OK means the file was saved. Failed means it could not be saved. Skipped means only its details were kept.",
      do: async (h) => {
        await h.point('th:text-is("Status")', 900);
        await h.point('td span:text-is("ok") >> nth=0', 1500);
      },
    },
    {
      say: "Files cannot be opened or downloaded from this page.",
      do: async (h) => h.point('th:text-is("Name")', 1100),
    },
    {
      say: "Note the name and the local path of the file you need, and pass them on to have the file fetched for you.",
      do: async (h) => h.point('th:text-is("Local path")', 1500),
    },
  ],
};
