/**
 * Needs Analysis: send a Needs Analysis to the applicant for signing. Demo data only.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

// The demo cannot send email, so the browser calls that send the signing links
// (and then list them) are answered here with a made-up result. The video shows
// what staff see when the links go out.
const mockSigning = async (h, signers) => {
  let sent = false;
  await h.page.route("**/api/signature-requests**", async (route) => {
    const method = route.request().method();
    if (method === "POST") {
      sent = true;
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
    if (method === "GET" && sent) {
      const now = Date.now();
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          requests: signers.map((s, i) => ({
            id: `demo-${i}`, signer_index: i + 1, signer_name: s.name, signer_email: s.email, status: "sent",
            sent_at: new Date(now).toISOString(), viewed_at: null, signed_at: null,
            expires_at: new Date(now + 14 * 86400000).toISOString(), signed_pdf_path: null,
          })),
        }),
      });
    }
    return route.continue();
  });
};

export default {
  start: "/needs-analysis",
  steps: [
    {
      say: "This video shows how to send a Needs Analysis to the applicants for signing.",
      do: async (h) => {
        await mockSigning(h, [{ name: "Liam Nguyen", email: "liam.nguyen@example.com" }]);
        await h.pause(300);
      },
    },
    {
      say: "Click the applicant's name in the list to open it.",
      do: async (h) => {
        await h.click('a:has-text("Nguyen, Liam")');
        await h.page.waitForSelector('h3:has-text("Electronic signature")');
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Make sure your latest changes are saved. The Save button is at the right of the toolbar.",
      do: async (h) => h.point('button:text-is("Save")', 1100),
    },
    {
      say: "Click Send for signature, in the Electronic signature box.",
      do: async (h) => h.click('button:text-is("Send for signature")'),
    },
    {
      say: "Check each signer's name and email. Click Add second signer for a joint application.",
      do: async (h) => {
        await h.point('div.fixed.inset-0 input[placeholder="Signer 1 name"]', 700);
        await h.point('div.fixed.inset-0 input[type="email"] >> nth=0', 700);
      },
    },
    {
      say: "Click Send links. This emails each signer their own secure signing link straight away.",
      do: async (h) => {
        await h.click('button:text-is("Send links")');
        await h.page.waitForSelector("div.fixed.inset-0 >> text=Send for signature", { state: "detached", timeout: 10000 });
        await h.pause(500);
      },
    },
    {
      say: "The Electronic signature box now shows each signer and their status. A Download link appears beside a signer once they have signed.",
      do: async (h) => h.point('div:has(> div > h3:has-text("Electronic signature")) ul li >> nth=0', 1500),
    },

  ],
};
