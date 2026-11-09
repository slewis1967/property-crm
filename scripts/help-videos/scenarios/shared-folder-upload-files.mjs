/**
 * Shared Folder: upload two made-up PDFs into a folder. The upload is real, into
 * local demo storage. The page is reloaded once at the start with the local
 * upload passed through to the local file store (see allowLocalStorage in lib-crm-b.mjs).
 */
import { allowLocalStorage, fixture } from "../lib-crm-b.mjs";

export default {
  start: "/shared-folder",
  steps: [
    {
      say: "This video shows how to upload files to the Shared Folder. You will find it in the menu on the left.",
      do: async (h) => {
        await allowLocalStorage(h.page);
        await h.goto("/shared-folder");
        await h.point('nav a[href="/shared-folder"]', 1200);
      },
    },
    {
      say: "Click a folder name to open the folder you want.",
      do: async (h) => {
        await h.click('button:has-text("Builder price lists")');
        await h.page.waitForSelector("text=Kestrel Ridge Builders inclusions.pdf");
      },
    },
    {
      say: "The trail above the list shows where you are. Click a name in it to go back up.",
      do: async (h) => h.point('nav:has-text("Shared Folder") >> text=Builder price lists', 1200),
    },
    {
      say: "Click Upload files, then choose one or more files from your computer.",
      do: async (h) => {
        const chooser = h.page.waitForEvent("filechooser");
        await h.click('button:has-text("Upload files")');
        const fc = await chooser;
        await fc.setFiles([
          fixture("Wattlebrook Homes price list November.pdf"),
          fixture("Kestrel Ridge Builders site plan.pdf"),
        ]);
      },
    },
    {
      say: "Each file shows as uploading until it is finished. Then it appears in the list for the whole team.",
      do: async (h) => {
        await h.page.waitForSelector("td >> text=Wattlebrook Homes price list November.pdf", { timeout: 30000 });
        await h.point("td >> text=Wattlebrook Homes price list November.pdf", 1200);
        await h.point("td >> text=Kestrel Ridge Builders site plan.pdf", 1000);
      },
    },
    {
      say: "You can also drag files from your computer straight onto this page.",
      do: async (h) => h.pause(500),
    },
    {
      say: "The size limit for a file is shown under the list.",
      do: async (h) => h.point("text=Deleted items go to the Trash", 1500),
    },
  ],
};
