/**
 * PIA Modeller: email a report to a client.
 *
 * The demo cannot send email (no mail service key), so the browser's call to
 * /api/pia/reports/<id>/email is answered here with a made-up success. Saving
 * the report beforehand is real (the seed file removes it). The address is a
 * made-up example.com one from the demo cast.
 */
export default {
  start: "/pia?contact=d0000000-0000-4000-8000-000000000011&property=c0aa0000-0000-4000-8000-000000000103",
  steps: [
    {
      say: "This is the PIA Modeller. Here is how to email a report straight to a client.",
      do: async (h) => {
        await h.page.route("**/api/pia/reports/*/email", async (route) => {
          await new Promise((r) => setTimeout(r, 900));
          await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
        });
        await h.pause(400);
      },
    },
    {
      say: "Click Email in the bar at the top. The report is saved first if you have not already saved it.",
      do: async (h) => {
        await h.click('button:text-is("Email")');
        await h.page.waitForSelector('h2:has-text("Email this PIA report")');
      },
    },
    {
      say: "Type the client's email address in the To box.",
      do: async (h) => {
        const to = h.page.locator('input[type="email"]');
        if ((await to.inputValue()) === "") await h.type('input[type="email"]', "grace.lee@example.com");
        else await h.point('input[type="email"]', 1200);
      },
    },
    {
      say: "Check the subject line, and change it if you want to.",
      do: async (h) => h.point('div.fixed input[type="text"]', 1400),
    },
    {
      say: "Type a short note in the Message box. It appears above the report in the email.",
      do: async (h) =>
        h.type("div.fixed textarea", "Hi Grace, here is the analysis we discussed for the Logan Reserve property."),
    },
    {
      say: "Click Send. The email goes to the client straight away and cannot be recalled, so check the address first.",
      do: async (h) => {
        await h.click('div.fixed button:text-is("Send")');
        await h.page.waitForSelector("text=Emailed to");
      },
    },
    {
      say: "A green message under the buttons confirms who it was sent to.",
      do: async (h) => h.point("p.text-green-700", 1600),
    },
  ],
};
