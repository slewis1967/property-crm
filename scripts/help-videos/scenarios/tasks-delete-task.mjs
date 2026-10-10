/**
 * Tasks: delete a task entered twice. Real delete (demo database); the seed puts it back.
 * The browser's "are you sure" pop-up is accepted by the recorder and is not seen in the video.
 */
const TITLE = "Call Olivia Bennett about her pre-approval (entered twice)";

export default {
  start: "/tasks",
  steps: [
    {
      say: "This video shows how to delete a task that was added by mistake.",
      do: async (h) => h.pause(600),
    },
    {
      say: "Find the task in the list. Click All if you cannot see it.",
      do: async (h) => {
        await h.point('button:has-text("All (")', 800);
        await h.point(`p:text-is("${TITLE}")`, 1300);
      },
    },
    {
      say: "Click the cross at the right end of the task.",
      do: async (h) => {
        await h.click(`button[aria-label="Delete ${TITLE}"]`);
      },
    },
    {
      say: "You are asked to confirm. Click OK and the task is removed.",
      do: async (h) => {
        await h.page.waitForSelector(`p:text-is("${TITLE}")`, { state: "detached" });
        await h.pause(600);
      },
    },
    {
      say: "A deleted task cannot be recovered. If the work is simply finished, tick it off instead.",
      do: async (h) => h.point('button[aria-label="Mark as done"] >> nth=0', 1500),
    },
  ],
};
