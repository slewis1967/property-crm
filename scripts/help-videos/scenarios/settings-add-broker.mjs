/** Settings: add a broker. All brokers and firms are invented. */
const add = 'div.border-dashed:has(input[placeholder="Broker name"])';
export default {
  start: "/settings",
  steps: [
    {
      say: "This video shows how to add a broker, so they can be chosen when you submit a Fact Find. In Settings, scroll to Brokers.",
      do: async (h) => h.point('h2:text-is("Brokers")', 1300),
    },
    {
      say: "Use the empty row with the dashed border, under the existing brokers. Type the broker's name.",
      do: async (h) => h.type(`${add} input[placeholder="Broker name"]`, "Morgan Reid"),
    },
    {
      say: "Type their email address. A name and a valid email are both needed.",
      do: async (h) => h.type(`${add} input[placeholder="email@broker.com"]`, "morgan.reid@example.com"),
    },
    {
      say: "Add their company and reference code if you have them.",
      do: async (h) => {
        await h.type(`${add} input[placeholder="Company (optional)"]`, "Sample Lending Co");
        await h.type(`${add} input[placeholder="Ref / comp code"]`, "SLC-207");
      },
    },
    {
      say: "Click Add broker. It saves straight away.",
      do: async (h) => {
        await h.click('button:text-is("Add broker")');
        await h.page.waitForSelector("text=✓ Saved");
      },
    },
    {
      say: "The new broker joins the list above.",
      do: async (h) => h.point('div.space-y-2 > div:has(button:text-is("Remove")) >> nth=2', 1400),
    },
    {
      say: "To switch a broker off, untick Active. To delete one, click Remove and confirm. Both save straight away.",
      do: async (h) => {
        await h.point('label:has-text("Active") >> nth=0', 1100);
        await h.point('button:text-is("Remove") >> nth=0', 1100);
      },
    },
  ],
};
