/** Overview of Media Library (archive). A tour only. All file names are invented. */
export default {
  start: "/media",
  steps: [
    {
      say: "Media Library is a view only list of the files that were uploaded to the previous system, such as contracts and ID documents.",
      do: async (h) => h.point('h1:text-is("Media Library")', 1500),
    },
    {
      say: "The four tiles show how many files were saved, how many failed, how many were skipped, and the total size saved.",
      do: async (h) => {
        await h.point('p:text-is("Downloaded OK")', 800);
        await h.point('p:text-is("Failed")', 800);
        await h.point('p:text-is("Skipped (metadata-only)")', 800);
        await h.point('p:text-is("Total size on disk")', 800);
      },
    },
    {
      say: "The buttons under the tiles narrow the list to files with that result.",
      do: async (h) => {
        await h.point('a:text-is("All")', 800);
        await h.point('a:text-is("failed")', 900);
      },
    },
    {
      say: "The search box finds files by part of the file name.",
      do: async (h) => h.point('input[name="q"]', 1500),
    },
    {
      say: "Name and Size show what the file was called and how big it is.",
      do: async (h) => {
        await h.point('th:text-is("Name")', 900);
        await h.point('th:text-is("Size")', 900);
      },
    },
    {
      say: "Status shows whether the file was saved. A failed file shows the reason in red underneath.",
      do: async (h) => {
        await h.point('th:text-is("Status")', 800);
        await h.point("text=File was no longer available to copy >> nth=0", 1400);
      },
    },
    {
      say: "Local path shows where the saved copy is kept, and Saved is the date. Files cannot be opened from this page.",
      do: async (h) => {
        await h.point('th:text-is("Local path")', 1000);
        await h.point('th:text-is("Saved")', 1000);
      },
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(600),
    },
  ],
};
