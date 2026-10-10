/** Overview of Shared Folder: a tour of the page. Opens one folder and comes back; changes nothing. */
export default {
  start: "/shared-folder",
  steps: [
    {
      say: "This is the Shared Folder. It is one library of files that everyone who can sign in to the CRM can see and add to.",
      do: async (h) => h.point("h1", 1500),
    },
    {
      say: "These two buttons add things to the folder you are in. Upload files, and New folder.",
      do: async (h) => {
        await h.point('button:has-text("Upload files")', 900);
        await h.point('button:has-text("New folder")', 900);
      },
    },
    {
      say: "The search box finds a file by name, wherever it is filed.",
      do: async (h) => h.point('input[placeholder^="Search all folders"]', 1400),
    },
    {
      say: "Trash, on the right, holds deleted items. Anyone can restore them from there.",
      do: async (h) => h.point('button:has-text("Trash")', 1400),
    },
    {
      say: "The list shows folders first, then files, with the size, when each was last changed and who added it.",
      do: async (h) => {
        await h.point('th:has-text("Name")', 700);
        await h.point('th:has-text("Modified")', 700);
        await h.point('th:has-text("Added by")', 700);
      },
    },
    {
      say: "Click a folder to open it. The trail above the list shows where you are, and takes you back up.",
      do: async (h) => {
        await h.click('button:has-text("Builder price lists")');
        await h.page.waitForSelector("text=Kestrel Ridge Builders inclusions.pdf");
        await h.point('nav:has-text("Shared Folder") >> text=Builder price lists', 1200);
      },
    },
    {
      say: "Each row has its own actions. View, Download, Rename, Move and Delete.",
      do: async (h) => {
        await h.point('tbody tr >> nth=0 >> button:text-is("View")', 800);
        await h.point('tbody tr >> nth=0 >> button:text-is("Delete")', 800);
      },
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => {
        await h.click('nav:has-text("Shared Folder") >> button:text-is("Shared Folder")');
        await h.pause(500);
      },
    },
  ],
};
