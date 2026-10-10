/** Shared Folder: make a new folder inside Client documents. Real save (demo database). */
export default {
  start: "/shared-folder",
  steps: [
    {
      say: "This video shows how to create a new folder in the Shared Folder.",
      do: async (h) => h.pause(600),
    },
    {
      say: "First open the folder that the new one should sit inside. Stay on the top level if you want it at the top.",
      do: async (h) => {
        await h.click('button:has-text("Client documents")');
        await h.page.waitForSelector("text=Liam Nguyen payslips.pdf");
      },
    },
    {
      say: "Click New folder. A small box opens under the buttons.",
      do: async (h) => h.click('button:has-text("New folder")'),
    },
    {
      say: "Type the name of the folder.",
      do: async (h) => h.type('input[placeholder="Folder name"]', "Mia Anderson"),
    },
    {
      say: "Click Create.",
      do: async (h) => {
        await h.click('button:text-is("Create")');
        await h.page.waitForSelector('td button:has-text("Mia Anderson")');
      },
    },
    {
      say: "The folder appears in the list. Click its name to open it and start adding files.",
      do: async (h) => {
        await h.click('td button:has-text("Mia Anderson")');
        await h.page.waitForSelector("text=This folder is empty");
        await h.pause(800);
      },
    },
  ],
};
