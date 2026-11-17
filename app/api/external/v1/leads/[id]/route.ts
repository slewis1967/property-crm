/**
 * GET /api/external/v1/leads/<id>
 * One lead plus its activity timeline (lead created, email sent/received
 * metadata, appointments). Content of emails and notes is never included.
 */
import type { NextRequest } from "next/server";
import { buildActivity } from "@/utils/external-api";
import { ExternalApiError, getLead, leadActivityRows, withExternalAuth } from "@/utils/external-api-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withExternalAuth(
  "leads.get",
  async (_req: NextRequest, _client, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const found = await getLead(id);
    if (!found) throw new ExternalApiError(404, "Lead not found");
    const { lead } = found;
    const { emails, appts } = await leadActivityRows(lead.contact_id, lead.email);
    return { lead, activity: buildActivity({ createdAt: lead.created_at, emails, appointments: appts }) };
  },
);
