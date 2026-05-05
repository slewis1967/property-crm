/**
 * Helpers for Google OAuth + Calendar API access.
 *
 * Refresh tokens live in Supabase (calendar_credentials), not env vars,
 * so a new host can be authorized without redeploying. Access tokens
 * are exchanged on demand and not persisted.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  CALENDAR_SCOPE,
].join(" ");

export function getOAuthConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET;
  // Site origin for the callback — works on prod and previews
  const origin = process.env.NEXT_PUBLIC_SITE_URL
    || process.env.URL                                  // Netlify production URL
    || "https://crm.nextkey.com.au";
  const redirectUri = `${origin.replace(/\/$/, "")}/api/auth/google/callback`;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in env (or reuse GMAIL_*).",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_OAUTH_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
};

export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const { clientId, clientSecret } = getOAuthConfig();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as TokenResponse;
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

export async function fetchUserInfo(accessToken: string): Promise<{ email: string; name?: string }> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo failed: ${res.status}`);
  const data = await res.json();
  return { email: data.email, name: data.name };
}

export async function createCalendarEvent(
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    location?: string;
    start: string;            // ISO
    end: string;              // ISO
    timeZone?: string;
    attendees?: Array<{ email: string; displayName?: string }>;
    sendUpdates?: "all" | "externalOnly" | "none";
  },
): Promise<{ id: string; htmlLink: string; hangoutLink?: string }> {
  const body: any = {
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: { dateTime: event.start, timeZone: event.timeZone || "Australia/Brisbane" },
    end: { dateTime: event.end, timeZone: event.timeZone || "Australia/Brisbane" },
    attendees: event.attendees,
    conferenceData: {
      createRequest: {
        requestId: `nextkey-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
  const params = new URLSearchParams({
    conferenceDataVersion: "1",
    sendUpdates: event.sendUpdates || "all",
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`Calendar API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}
