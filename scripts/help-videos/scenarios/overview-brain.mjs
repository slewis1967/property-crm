/** Overview of Brain. A tour only; nothing is changed. Uses seeded demo memories. */
const CARD = 'div.rounded-lg.bg-white:has(h3:has-text("First home buyers usually ask about the deposit first"))';

export default {
  start: "/brain",
  steps: [
    {
      say: "This is the Brain. It holds the facts and lessons that the AI features in the CRM draw on.",
      do: async (h) => h.pause(500),
    },
    {
      say: "The buttons at the top narrow the list to one kind of memory, such as Knowledge, Learnings or Playbooks.",
      do: async (h) => {
        await h.point('button:text-is("All")', 600);
        await h.point('button:text-is("Knowledge")', 700);
        await h.point('button:text-is("Learnings")', 700);
        await h.point('button:text-is("Playbooks")', 700);
      },
    },
    {
      say: "Search looks through the memories for a word or phrase, and New memory opens a form to add one.",
      do: async (h) => {
        await h.point('input[placeholder^="Search memories"]', 1000);
        await h.point('button:has-text("New memory")', 1000);
      },
    },
    {
      say: "Each card is one memory. The title is the fact in one line, with the full explanation underneath.",
      do: async (h) => {
        await h.point(`${CARD} h3`, 1200);
        await h.point(`${CARD} p.whitespace-pre-wrap`, 1200);
      },
    },
    {
      say: "The line under the title shows the kind of memory, where it came from, how many times it has been used, and its score.",
      do: async (h) => h.point(`${CARD} div.flex.flex-wrap.items-center`, 2500),
    },
    {
      say: "Tags at the bottom of a card group related memories.",
      do: async (h) => h.point(`${CARD} div.flex.flex-wrap.gap-1`, 1500),
    },
    {
      say: "On the right of each card you can rate a memory up or down, edit it, or archive it so it is no longer used.",
      do: async (h) => {
        await h.point(`${CARD} button[title^="Helpful"]`, 800);
        await h.point(`${CARD} button:text-is("Edit")`, 800);
        await h.point(`${CARD} button:text-is("Archive")`, 800);
      },
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(400),
    },
  ],
};
