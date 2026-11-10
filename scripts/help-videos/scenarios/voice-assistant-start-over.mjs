/**
 * Voice assistant: clear the conversation and start again.
 *
 * NOT A REAL CONVERSATION. A headless browser cannot hear speech and the demo
 * CRM has no AI key, so the spoken lines are fed in by a stand-in microphone
 * and the browser's /api/voice/converse call is answered inside this scenario
 * with made-up replies (see lib/system-voice.mjs, which also explains why the
 * doubled bubbles of development mode are hidden). The panel and buttons are
 * the real ones. Nothing is saved or sent.
 */
import { installFakeMic, answerWith, holdAndSay } from "./lib/system-voice.mjs";

const ASK = "Find Liam";
export default {
  start: "/contacts",
  steps: [
    {
      say: "This video shows how to start a fresh conversation with the voice assistant. Click the round microphone button to open the panel.",
      do: async (h) => {
        await installFakeMic(h);
        await answerWith(h, {
          [ASK]: {
            reply: "I found Liam Nguyen, an investor in Parramatta. What would you like to do?",
            side_effects: [{ kind: "find_contact", query: "Liam", top: { name: "Liam Nguyen" } }],
          },
        });
        await h.click('button[title="Open voice assistant"]');
      },
    },
    {
      say: "Here a conversation is already under way, and the assistant remembers what has been said.",
      do: async (h) => {
        await holdAndSay(h, ASK);
        await h.page.waitForSelector("text=I found Liam Nguyen");
      },
    },
    {
      say: "If it has the wrong idea, or you are moving on to someone else, click Reset at the top right of the panel.",
      do: async (h) => h.click('button[title="Clear conversation"]'),
    },
    {
      say: "The conversation is cleared, and the assistant stops speaking.",
      do: async (h) => h.point("text=/^Try:/", 1400),
    },
    {
      say: "Press and hold the large microphone button and start again.",
      do: async (h) => h.point('button[title="Hold to talk"]', 1400),
    },
    {
      say: "Reset only clears the conversation. Notes, tasks and messages already saved or sent are not undone.",
      do: async (h) => h.pause(800),
    },
  ],
};
