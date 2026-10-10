/**
 * Ask for a guide that is not listed. Needs seed/10-help-requests.sql.
 *
 * The recorder normally hides the help button; this scenario shows it, because
 * the button is the subject. The demo has no AI key, so the request is saved
 * for review without a draft, which reads the same to the person asking.
 */
const scenario = {
  start: "/contacts",
  steps: [
    {
      say: "This video shows how to ask for a guide when the help panel does not have one for what you are doing.",
      do: async (h) => {
        await h.page.addStyleTag({ content: "html body [data-help-button]{display:flex !important}" });
        await h.pause(600);
      },
    },
    {
      say: "Click How do I do this, the amber button at the bottom right of any page.",
      do: async (h) => h.click("[data-help-button]"),
    },
    {
      say: "Search first, in case the guide exists under another page.",
      do: async (h) => h.point('input[type="search"]', 1600),
    },
    {
      say: "If it is not there, scroll to the bottom of the panel and click Can't find it, ask for a guide.",
      do: async (h) => h.click("text=Ask for a guide"),
    },
    {
      say: "Type what you are trying to do. Describe the task, not the client. Leave out names, emails and numbers.",
      do: async (h) => h.type("#help-ask", "How do I merge two contacts that are the same person?"),
    },
    {
      say: "Click Send request. A green line confirms it was sent for review.",
      do: async (h) => {
        await h.click('button:has-text("Send request")');
        await h.page.waitForSelector("text=Sent for review", { timeout: 60000 });
        await h.point("text=Sent for review", 1500);
      },
    },
    {
      say: "Your request is listed under Your requests. It changes to Added once the guide is approved, or Not added with the reason.",
      do: async (h) => h.point('text="Being reviewed" >> nth=0', 1800),
    },
  ],
};
export default scenario;
