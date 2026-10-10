/**
 * Voice assistant: draft a text message, then confirm to send it.
 *
 * NOT A REAL CONVERSATION. A headless browser cannot hear speech and the demo
 * CRM has no AI key, so the spoken lines are fed in by a stand-in microphone
 * and the browser's /api/voice/converse call is answered inside this scenario
 * with made-up replies (see lib/system-voice.mjs, which also explains why the
 * doubled bubbles of development mode are hidden). The panel and buttons are
 * the real ones. Nothing is saved or sent.
 */
import { installFakeMic, answerWith, holdAndSay } from "./lib/system-voice.mjs";

const ASK = "Text Olivia Bennett to confirm Saturday at ten";
const YES = "Yes, send it";
export default {
  start: "/contacts",
  steps: [
    {
      say: "This video shows how to send a text message or an email by voice. Click the round microphone button.",
      do: async (h) => {
        await installFakeMic(h);
        await answerWith(h, {
          [ASK]: {
            reply:
              "Here is the draft to Olivia Bennett. Hi Olivia, just confirming Saturday at 10am at the display home. See you then. Shall I send it?",
            side_effects: [{ kind: "draft_sms" }],
          },
          [YES]: {
            reply: "Sent. The text message has gone to Olivia Bennett.",
            side_effects: [{ kind: "send_sms" }],
          },
        });
        await h.click('button[title="Open voice assistant"]');
      },
    },
    {
      say: "Press and hold the large microphone button. Say who the message is for and what it should say.",
      do: async (h) => holdAndSay(h, ASK),
    },
    {
      say: "Let go and listen. The assistant reads the draft back to you.",
      do: async (h) => {
        await h.page.waitForSelector("text=Here is the draft");
        await h.point("text=Here is the draft", 1400);
      },
    },
    {
      say: "The tick line says the message is drafted and awaiting confirmation. Nothing has been sent yet.",
      do: async (h) => h.point("text=SMS drafted", 1600),
    },
    {
      say: "If it needs changing, hold the button and say what to change.",
      do: async (h) => h.point('button[title="Hold to talk"]', 1300),
    },
    {
      say: "When it is right, hold the button and say yes to send it.",
      do: async (h) => holdAndSay(h, YES),
    },
    {
      say: "This sends a real message to the contact and cannot be undone. The tick line then shows it was sent.",
      do: async (h) => {
        await h.page.waitForSelector("text=SMS sent");
        await h.point("text=SMS sent", 1600);
      },
    },
  ],
};
