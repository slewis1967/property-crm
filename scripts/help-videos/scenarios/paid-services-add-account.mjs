/** Paid Accounts: add a new account. The service is invented. */
const form = 'div:has(> h3:text-is("New paid account"))';
const field = (label) => `${form} div:has(> label:has-text("${label}"))`;
const due = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
export default {
  start: "/paid-services",
  steps: [
    {
      say: "This video shows how to add a new paid account. Click Add account, at the top right of the page.",
      do: async (h) => h.click('button:has-text("Add account")'),
    },
    {
      say: "Type the name in Service name. This is the only box you must fill in.",
      do: async (h) => h.type(`${field("Service name")} input`, "Example Print Shop"),
    },
    {
      say: "Enter the cost for one billing cycle, then choose how often it is billed.",
      do: async (h) => {
        await h.type(`${field("Cost")} input >> nth=0`, "120");
        await h.select(`${form} div:has(> label:has-text("Billing cycle")) select`, "quarterly");
      },
    },
    {
      say: "Pick the next due date. The reminders count down to this date.",
      do: async (h) => {
        const sel = `${field("Next due date")} input`;
        await h.click(sel);
        await h.page.locator(sel).fill(due);
        await h.pause(500);
      },
    },
    {
      say: "In Pays with, type a label for the card. Never type a full card number or a password.",
      do: async (h) => h.type(`${field("Pays with")} input`, "Visa ••4821"),
    },
    {
      say: "Paste the supplier's billing page into Billing page URL. This gives you a one click link to it later.",
      do: async (h) => h.type(`${field("Billing page URL")} input`, "https://billing.example.com/print"),
    },
    {
      say: "Click Save.",
      do: async (h) => {
        await h.click(`${form} button:text-is("Save")`);
        await h.page.waitForSelector('text="Saved."');
      },
    },
    {
      say: "To see the new account, scroll down to the register and click All.",
      do: async (h) => {
        await h.click('button:has-text("All (")');
        await h.point('tr:has-text("Example Print Shop") td >> nth=0', 1500);
      },
    },
  ],
};
