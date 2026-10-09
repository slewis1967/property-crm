/** Lender Policy: look up what a lender publishes. Reads only; no client records on screen. */
export default {
  start: "/lenders",
  noClientData: true,
  steps: [
    {
      say: "This is the Lender Policy library. Here is how to look up what a lender publishes.",
      do: async (h) => h.pause(600),
    },
    {
      say: "Start typing a lender's name in the search box. The list updates as you type.",
      do: async (h) => h.type('input[placeholder^="Search lenders"]', "Macquarie"),
    },
    {
      say: "You can also narrow the list by lender type, or show only lenders that hold a certain figure.",
      do: async (h) => {
        await h.point("select >> nth=0");
        await h.point("select >> nth=1");
      },
    },
    {
      say: "Click a lender to open its record.",
      do: async (h) => {
        await h.click('a[href^="/lenders/"]:has-text("Macquarie Bank")');
        await h.page.waitForURL(/\/lenders\/[^/]+$/);
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Read the box headed What this record does not establish. It lists what is still missing for this lender.",
      do: async (h) => h.point("text=What this record does not establish", 1500),
    },
    {
      say: "Each figure carries a label, such as Verified or Unverified, so you know how far to trust it.",
      do: async (h) => {
        await h.scroll(380);
        await h.pause(800);
      },
    },
    {
      say: "The blue source link under a figure opens the lender's own page, so you can confirm it before you rely on it.",
      do: async (h) => h.point('main a[target="_blank"] >> nth=3', 1500),
    },
  ],
};
