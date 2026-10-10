/** Overview of Help requests. A tour only. Needs seed/10-help-requests.sql; every request and person is invented. */
const scenario = {
  start: "/help-requests",
  steps: [
    {
      say: "Help requests is where a super admin reviews the guides that staff have asked for. Nothing reaches other staff until it is approved here.",
      do: async (h) => h.point('h1:has-text("Help requests")', 1500),
    },
    {
      say: "This line opens the rules every request is checked against before you see it.",
      do: async (h) => {
        await h.click("summary");
        await h.pause(1800);
        await h.click("summary");
      },
    },
    {
      say: "Waiting for you lists each request that has not been decided, newest first.",
      do: async (h) => h.point("text=/Waiting for you/", 1500),
    },
    {
      say: "The label on a card tells you where it stands. Draft ready has a draft to read.",
      do: async (h) => h.point('text="Draft ready"', 1500),
    },
    {
      say: "The grey box says what the checks found. Below it is the draft, which you can change before approving.",
      do: async (h) => {
        await h.point("text=What the checks found >> nth=0", 1300);
        await h.point("textarea >> nth=0", 1300);
      },
    },
    {
      say: "A card flagged by the checks may break a rule, and one marked needs writing by hand could not be written from the existing guides.",
      do: async (h) => {
        await h.scroll(420);
        await h.point('text="Flagged by the checks"', 1400);
        await h.scroll(420);
        await h.point('text="Needs writing by hand"', 1400);
      },
    },
    {
      say: "Already decided holds the published and declined requests. A published guide can be taken down again.",
      do: async (h) => {
        await h.scroll(700);
        await h.point('text="Take down"', 1500);
      },
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(600),
    },
  ],
};
export default scenario;
