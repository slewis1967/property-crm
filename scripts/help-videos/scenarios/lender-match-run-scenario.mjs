/** Lender Match: enter a client scenario and run the match. Nothing is saved; the figures typed in are made up. */
const field = (label) => `label:has(> span:text-is("${label}"))`;

export default {
  start: "/lenders/match",
  steps: [
    {
      say: "This is Lender Match. Here is how to match a client to the lenders whose policy they fit.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Choose the purpose of the loan at the top of the Scenario panel.",
      do: async (h) => h.select(`${field("Purpose")} select`, "purchase_owner_occupied"),
    },
    {
      say: "Type the loan amount and the property value. Leave the loan amount empty to test the most the client could borrow.",
      do: async (h) => {
        await h.type(`${field("Loan amount")} input`, "520000");
        await h.type(`${field("Property value")} input`, "650000");
      },
    },
    {
      say: "Type the incomes, the number of dependents and the monthly living expenses.",
      do: async (h) => {
        await h.type(`${field("Applicant income")} input`, "92000");
        await h.type(`${field("Partner income")} input`, "78000");
        await h.type(`${field("Living expenses / mo")} input`, "3200");
      },
    },
    {
      say: "Type the deposit and any credit card limits.",
      do: async (h) => {
        await h.type(`${field("Deposit")} input`, "130000");
        await h.type(`${field("Card limits")} input`, "5000");
      },
    },
    {
      say: "Under Applicant, choose the employment basis and residency, and add the months in the role if you know them.",
      do: async (h) => {
        await h.select(`${field("Employment basis")} select`, "permanent_full_time");
        await h.type(`${field("Months in role")} input`, "36");
        await h.select(`${field("Residency")} select`, "australian_citizen");
      },
    },
    {
      say: "Under Security, choose the property type and type the postcode.",
      do: async (h) => {
        await h.select(`${field("Property type")} select`, "house");
        await h.type(`${field("Postcode")} input`, "4510");
      },
    },
    {
      say: "Under Credit file, enter any defaults and the genuine savings.",
      do: async (h) => h.type(`${field("Genuine savings evidenced")} input`, "45000"),
    },
    {
      say: "Click Match lenders. The ranked list appears on the right. Nothing is saved or sent.",
      do: async (h) => {
        await h.click('button:has-text("Match lenders")');
        await h.page.waitForSelector("text=fit policy", { timeout: 30000 });
        await h.page.mouse.wheel(0, -5000);
        await h.pause(1500);
      },
    },
  ],
};
