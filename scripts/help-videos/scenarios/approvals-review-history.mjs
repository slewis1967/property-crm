/** Approval Queue: check past decisions. The history rows are invented. */
export default {
  start: "/approvals",
  steps: [
    {
      say: "This video shows how to check what was approved or rejected. On the Approval Queue page, scroll down to Approval History.",
      do: async (h) => h.point('h2:text-is("Approval History")', 1400),
    },
    {
      say: "The newest decision is at the top. The list holds the last fifty.",
      do: async (h) => h.point('p:text-is("approved") >> nth=0', 1400),
    },
    {
      say: "The colour and wording tell you what happened. Green is approved.",
      do: async (h) => h.point('p:text-is("approved") >> nth=1', 1300),
    },
    {
      say: "Red is rejected, and yellow means a revision was requested.",
      do: async (h) => {
        await h.point('p:text-is("rejected")', 1100);
        await h.point('p:text-is("revision requested")', 1300);
      },
    },
    {
      say: "The date and time on the right show when the decision was made in Telegram.",
      do: async (h) => h.point('div.justify-between:has(p:text-is("revision requested")) > div.text-right', 1600),
    },
    {
      say: "This list only shows past decisions. To approve or reject something new, use Telegram.",
      do: async (h) => h.pause(700),
    },
  ],
};
