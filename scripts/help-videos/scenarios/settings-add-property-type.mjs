/** Settings: add a property type. */
export default {
  start: "/settings",
  steps: [
    {
      say: "This video shows how to add a property type. In Settings, scroll to Property types, the last section on the page.",
      do: async (h) => h.point('h2:text-is("Property types")', 1300),
    },
    {
      say: "Use the row with the dashed border at the bottom of the list. Type the name of the new type.",
      do: async (h) => h.type('input[placeholder^="New type name"]', "Granny Flat"),
    },
    {
      say: "Add a short description beside it. This is optional. It helps new stock get sorted into the right type.",
      do: async (h) => h.type('input[placeholder^="Description shown"]', "A small second home on the same block."),
    },
    {
      say: "Click Add. It saves straight away.",
      do: async (h) => {
        await h.click('button:text-is("+ Add")');
        await h.page.waitForSelector('button[title="Remove Granny Flat"]');
      },
    },
    {
      say: "The new type joins the list.",
      do: async (h) => h.point('div:has(> button[title="Remove Granny Flat"]) input >> nth=1', 1400),
    },
    {
      say: "To delete a type, click the cross at the end of its row, then confirm.",
      do: async (h) => h.point('button[title="Remove Granny Flat"]', 1500),
    },
  ],
};
