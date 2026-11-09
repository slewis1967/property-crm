/** Contacts: import four made-up people from a spreadsheet. Real import (demo database); the seed removes them. */
import { fixture } from "../lib-crm-b.mjs";

export default {
  start: "/contacts",
  steps: [
    {
      say: "This video shows how to import a list of contacts from a file.",
      do: async (h) => h.pause(600),
    },
    {
      say: "Click Bulk Upload at the top right.",
      do: async (h) => h.click('button:has-text("Bulk Upload")'),
    },
    {
      say: "Check the tag box first. Every person in the file gets these tags, so change or clear what is already typed there.",
      do: async (h) => {
        const tags = 'input[placeholder^="getahome"]';
        await h.click(tags);
        await h.page.locator(tags).fill("");
        await h.type(tags, "october-import");
      },
    },
    {
      say: "If everyone in the file is the same type, pick it under Assign Contact Type. This is optional.",
      do: async (h) => h.point("text=Assign Contact Type", 1500),
    },
    {
      say: "Click Choose File and pick your file. Spreadsheets and phone contact files both work.",
      do: async (h) => {
        const chooser = h.page.waitForEvent("filechooser");
        await h.click('button:text-is("Choose File")');
        await (await chooser).setFiles(fixture("demo-contacts.csv"));
        await h.page.waitForSelector('button:has-text("Preview Import")');
      },
    },
    {
      say: "Check the Maps To column. Each row shows a column from your file and where it will go. Fix any that are wrong.",
      do: async (h) => h.point('th:has-text("Maps To")', 1800),
    },
    {
      say: "Click Preview Import. You will see how many rows are valid and how many will be skipped.",
      do: async (h) => {
        await h.click('button:has-text("Preview Import")');
        await h.page.waitForSelector('button:has-text("Import 4 Contacts")');
      },
    },
    {
      say: "Click the Import button. A progress bar shows while the contacts are added.",
      do: async (h) => {
        await h.click('button:has-text("Import 4 Contacts")');
        await h.page.waitForSelector('p:text-is("Ava Mitchell")', { timeout: 30000 });
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "When it finishes, the window closes and the page reloads with the new contacts in the list.",
      do: async (h) => h.point('p:text-is("Ava Mitchell")', 1500),
    },
  ],
};
