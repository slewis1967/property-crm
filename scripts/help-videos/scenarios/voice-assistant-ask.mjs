/**
 * Voice assistant: ask it to find a contact.
 *
 * NOT A REAL CONVERSATION. A headless browser cannot hear speech and the demo
 * CRM has no AI key, so the spoken lines are fed in by a stand-in microphone
 * and the browser's /api/voice/converse call is answered inside this scenario
 * with made-up replies (see lib/system-voice.mjs, which also explains why the
 * doubled bubbles of development mode are hidden). The panel and buttons are
 * the real ones. Nothing is saved or sent.
 */
import { installFakeMic, answerWith, holdAndSay } from "./lib/system-voice.mjs";

const ASK = "Find Olivia Bennett";
export default {
  start: "/contacts",
  steps: [
    {
      say: "This video shows how to ask the voice assistant something. Click the round microphone button at the bottom right of any page.",
      do: async (h) => {
        await installFakeMic(h);
        await answerWith(h, {
          [ASK]: {
            reply:
              "I found Olivia Bennett, a first home buyer in Chermside. Her phone number is 0491 570 101. Would you like to log a call or set a reminder?",
            side_effects: [{ kind: "find_contact", query: "Olivia Bennett", top: { name: "Olivia Bennett" } }],
          },
        });
        await h.click('button[title="Open voice assistant"]');
      },
    },
    {
      say: "The voice assistant panel opens. Press and hold the large microphone button. You can hold the spacebar instead.",
      do: async (h) => h.point('button[title="Hold to talk"]', 1500),
    },
    {
      say: "While you hold it, say what you want. Your words appear in the panel as you speak.",
      do: async (h) => holdAndSay(h, ASK),
    },
    {
      say: "Let go of the button. The panel shows Thinking, then the answer is read out loud and shown in the panel.",
      do: async (h) => {
        await h.page.waitForSelector("text=I found Olivia Bennett");
        await h.point("text=I found Olivia Bennett", 1500);
      },
    },
    {
      say: "Hold the button again to reply or to ask something else. The assistant remembers the conversation so far.",
      do: async (h) => h.point('button[title="Hold to talk"]', 1500),
    },
    {
      say: "Click the cross at the top of the panel to close it. This also stops it speaking.",
      do: async (h) => h.click('button[title="Close"]'),
    },
  ],
};
