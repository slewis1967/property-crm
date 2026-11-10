/** Revenue: add a deal. Saves a real row in the demo database (the seed file removes it again). */
const iso = (days) => {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const setDate = async (h, sel, value) => {
  await h.click(sel);
  await h.page.locator(sel).first().fill(value);
  await h.pause(300);
};
const MODAL = "div.fixed.inset-0";

export default {
  start: "/revenue",
  steps: [
    {
      say: "This is the Revenue page. Here is how to add a new deal.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click Add deal at the top right.",
      do: async (h) => h.click('header button:has-text("Add deal")'),
    },
    {
      say: "Fill in the lot or address. This is the only field you must fill in.",
      do: async (h) => h.type(`${MODAL} input[placeholder^="Lot 16"]`, "Lot 12 Example Ridge Estate, Caboolture"),
    },
    {
      say: "Add the supplier and the purchaser. The supplier box suggests builders as you type.",
      do: async (h) => {
        await h.type(`${MODAL} input[list="supplier-options"]`, "Example Ridge Builders");
        await h.type(`${MODAL} input[placeholder="Client SMSF"]`, "Olivia Bennett");
      },
    },
    {
      say: "Type the remuneration and any referrer fee, and note who the fee goes to.",
      do: async (h) => {
        await h.type(`${MODAL} input[placeholder="50000"]`, "40000");
        await h.type(`${MODAL} input[placeholder="30000"]`, "5000");
        await h.type(`${MODAL} input[placeholder="to Glenn"]`, "to referring broker");
      },
    },
    {
      say: "Under Payments, enter the date and amount of the first payment.",
      do: async (h) => {
        await setDate(h, `${MODAL} input[type="date"] >> nth=0`, iso(30));
        await h.type(`${MODAL} input[placeholder="amount"] >> nth=0`, "20000");
      },
    },
    {
      say: "Click Add payment for each further instalment, and fill it in the same way.",
      do: async (h) => {
        await h.click(`${MODAL} button:has-text("Add payment")`);
        await setDate(h, `${MODAL} input[type="date"] >> nth=1`, iso(120));
        await h.type(`${MODAL} input[placeholder="amount"] >> nth=1`, "20000");
      },
    },
    {
      say: "Click Add deal. The new deal appears at the top of the table.",
      do: async (h) => {
        await h.click(`${MODAL} button:has-text("Add deal")`);
        await h.page.waitForSelector(MODAL, { state: "detached" });
        await h.point('td:has-text("Lot 12 Example Ridge Estate")', 1500);
      },
    },
  ],
};
