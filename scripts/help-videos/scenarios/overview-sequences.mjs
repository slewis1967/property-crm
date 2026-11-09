/** Overview of Sequences. A tour only. The sequences and people are invented. */
const card = 'div.rounded-xl:has(h3:text-is("New enquiry welcome"))';
export default {
  start: "/sequences",
  steps: [
    {
      say: "Sequences shows the automatic email and text message follow up series. The page heading reads Outbound Sequences.",
      do: async (h) => h.point('h1:text-is("Outbound Sequences")', 1500),
    },
    {
      say: "Under Registered sequences there is one card for each series. The label shows whether it sends email, text messages or both.",
      do: async (h) => {
        await h.point('h2:has-text("Registered sequences")', 900);
        await h.point(`${card} h3`, 900);
        await h.point(`${card} span.rounded-full`, 1000);
      },
    },
    {
      say: "The numbers show how many people are Active, Paused, Done or Failed in that series.",
      do: async (h) => h.point(`${card} div.grid`, 1700),
    },
    {
      say: "The bottom of the card shows whether the series is switched on, and the tag that adds people to it automatically.",
      do: async (h) => h.point(`${card} div.border-t`, 1700),
    },
    {
      say: "Next 20 due steps lists who gets a message next, from which series, and when. A name opens that person on Contacts.",
      do: async (h) => {
        await h.point('h2:has-text("Next 20 due steps")', 1000);
        await h.point('th:text-is("Due at")', 1200);
      },
    },
    {
      say: "Recent step activity lists the last thirty messages the system tried to send, marked sent, failed or skipped.",
      do: async (h) => {
        await h.point('h2:has-text("Recent step activity")', 1000);
        await h.point("text=Email address bounced", 1300);
      },
    },
    {
      say: "The Compliance note at the bottom covers the opt out wording added to every message.",
      do: async (h) => h.point("text=📬 Compliance", 1500),
    },
    {
      say: "This page is for viewing only. For step by step help, pick a task from the list under this overview.",
      do: async (h) => h.pause(600),
    },
  ],
};
