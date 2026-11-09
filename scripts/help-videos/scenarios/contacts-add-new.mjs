/**
 * Contacts: add one new contact by hand. The save is real (demo database);
 * seed/10-crm-b.sql removes Sophie Turner again so this can be re-recorded.
 * The AI panels on the contact page are answered with made-up text (no AI key in the demo).
 */
import { mockContactAi } from "../lib-crm-b.mjs";

const field = (label) => `label:text-is("${label}") + select`;

export default {
  start: "/contacts",
  steps: [
    {
      say: "This video shows how to add a new contact by hand, for example while you are on the phone with them.",
      do: async (h) => {
        await mockContactAi(h.page);
        await h.pause(600);
      },
    },
    {
      say: "Click New Contact at the top right of the Contacts page.",
      do: async (h) => h.click('button:has-text("New Contact")'),
    },
    {
      say: "Fill in their full name and email. Both are required, because the email is how the CRM matches this person later.",
      do: async (h) => {
        await h.type('input[placeholder="e.g. Jane Citizen"]', "Sophie Turner");
        await h.type('input[placeholder="jane@example.com"]', "sophie.turner@example.com");
      },
    },
    {
      say: "Add their phone, buyer type, preferred state, timeframe and temperature if you know them. You can add these later.",
      do: async (h) => {
        await h.type('input[placeholder="0400 000 000"]', "0491 570 120");
        await h.select(field("Buyer type"), "First Home Buyer");
        await h.select(field("Preferred state"), "QLD");
        await h.type('input[placeholder="e.g. 3-6 months"]', "3-6 months");
      },
    },
    {
      say: "Click Add contact.",
      do: async (h) => {
        await h.click('button:has-text("Add contact")');
        await h.page.waitForURL(/\/contacts\/[0-9a-f-]{36}$/);
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "The new contact's page opens, ready for notes, emails and meetings.",
      do: async (h) => h.point('h1:has-text("Sophie Turner")', 1500),
    },
    {
      say: "If that email is already in the CRM, you will see a yellow message with a link to the existing contact, and no duplicate is made.",
      do: async (h) => h.pause(500),
    },
  ],
};
