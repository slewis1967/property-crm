/** Settings: change an email signature. The two staff members shown are invented. */
const title = 'label:has(span:text-is("Title")) input';
export default {
  start: "/settings",
  steps: [
    {
      say: "This video shows how to change your email signature. Open Settings, under System in the sidebar.",
      do: async (h) => h.point('nav a[href="/settings"]', 1200),
    },
    {
      say: "Scroll down to Email signature.",
      do: async (h) => h.point('h2:has-text("Email signature")', 1200),
    },
    {
      say: "Click your name, so you are editing your own signature. Each person has their own.",
      do: async (h) => {
        await h.click('button:has-text("Sam Taylor")');
        await h.pause(900);
      },
    },
    {
      say: "Update your details. Here we change the title.",
      do: async (h) => {
        await h.click(title);
        await h.page.locator(title).fill("");
        await h.type(title, "Senior Client Services");
      },
    },
    {
      say: "The preview on the right changes as you type, so you can see what people will receive.",
      do: async (h) => h.point('p:text-is("Preview") + div', 1600),
    },
    {
      say: "To add a logo, click Upload logo and choose a picture.",
      do: async (h) => {
        await h.point('button:has-text("Upload logo")', 1300);
        await h.scroll(320);
      },
    },
    {
      say: "When you are happy, click Save signature. A green message confirms it.",
      do: async (h) => {
        await h.point('button:has-text("Save signature")', 1600);
        await h.click('button:has-text("Save signature")');
        await h.page.waitForSelector("text=Signature saved for");
      },
    },
    {
      say: "The new signature is used on every email you send from now on.",
      do: async (h) => h.point("text=Signature saved for", 1200),
    },
  ],
};
