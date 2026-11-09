/** Sequences: see how a follow up series is going. The sequences and people are invented. */
const card = 'div.rounded-xl:has(h3:text-is("New enquiry welcome"))';
const other = 'div.rounded-xl:has(h3:text-is("No answer follow up"))';
export default {
  start: "/sequences",
  steps: [
    {
      say: "This video shows how to see how a follow up sequence is going. Open Sequences, under Elvis in the sidebar.",
      do: async (h) => h.point('nav a[href="/sequences"]', 1200),
    },
    {
      say: "Each card under Registered sequences is one series of messages.",
      do: async (h) => {
        await h.point('h2:has-text("Registered sequences")', 800);
        await h.point(`${card} h3`, 1100);
      },
    },
    {
      say: "The label at the top right of the card shows whether it sends email, text messages, or both.",
      do: async (h) => h.point(`${card} span.rounded-full`, 1500),
    },
    {
      say: "The numbers count the people at each stage. Active, Paused, Done and Failed.",
      do: async (h) => h.point(`${card} div.grid`, 1800),
    },
    {
      say: "A red number under Failed means something needs looking at.",
      do: async (h) => h.point(`${other} p.text-red-700`, 1500),
    },
    {
      say: "The bottom of the card shows whether the sequence is switched on. This page is for viewing only.",
      do: async (h) => h.point(`${card} div.border-t span >> nth=0`, 1500),
    },
  ],
};
