/**
 * Minimal Google Drive client for the client document portal — service-account
 * auth, no googleapis SDK (not a dependency, and we need three calls, not a
 * framework). The account authenticates with a signed JWT exchanged for an
 * access token; `jose` (already a dependency) does the signing.
 *
 * Env (all optional — the export feature is simply unavailable without them,
 * the rest of the app is unaffected):
 *   GOOGLE_SA_EMAIL               service-account email (…@….iam.gserviceaccount.com)
 *   GOOGLE_SA_PRIVATE_KEY         the JSON key's `private_key`, PEM, newlines intact
 *   GOOGLE_DRIVE_PARENT_FOLDER_ID a NextKey-owned folder shared with the SA as Editor
 *
 * Why a service account rather than a rep's OAuth: the documents outlive any
 * individual, and no person's personal Drive should hold other people's
 * payslips and ID. The folder is owned by NextKey; the SA is granted access to
 * it by sharing, not by IAM.
 */
import { SignJWT, importPKCS8 } from "jose";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const SCOPE = "https://www.googleapis.com/auth/drive";

export type DriveConfig = {
  email: string;
  privateKey: string;
  parentFolderId: string;
};

/** Returns config, or a reason string when the feature isn't set up. */
export function driveConfig(): DriveConfig | { error: string } {
  const email = process.env.GOOGLE_SA_EMAIL;
  const rawKey = process.env.GOOGLE_SA_PRIVATE_KEY;
  const parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
  if (!email || !rawKey || !parentFolderId) {
    return {
      error:
        "Google Drive export isn't configured. Set GOOGLE_SA_EMAIL, GOOGLE_SA_PRIVATE_KEY and " +
        "GOOGLE_DRIVE_PARENT_FOLDER_ID (see docs/ACTIVATE-client-document-portal.md).",
    };
  }
  // Netlify env vars often store the PEM with literal "\n" rather than real
  // newlines — normalise so importPKCS8 can parse it.
  const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  return { email, privateKey, parentFolderId };
}

/**
 * Mint a short-lived Drive access token from the service account. No refresh
 * token: a service account signs a fresh JWT each time, so we just get a new
 * token per export run. Cached in-process for its lifetime would be a
 * micro-optimisation not worth the complexity for a manual, low-frequency
 * action.
 */
async function accessToken(cfg: DriveConfig): Promise<string> {
  const key = await importPKCS8(cfg.privateKey, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(cfg.email)
    .setSubject(cfg.email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Google token exchange failed (${res.status}): ${json.error_description || json.error || "unknown"}`,
    );
  }
  return json.access_token as string;
}

type DriveClient = {
  createFolder(name: string, parentId: string): Promise<{ id: string; webViewLink: string }>;
  uploadFile(name: string, parentId: string, bytes: ArrayBuffer, mime: string): Promise<string>;
};

async function client(cfg: DriveConfig): Promise<DriveClient> {
  const token = await accessToken(cfg);
  const authHeader = { authorization: `Bearer ${token}` };

  async function driveJson(url: string, init: RequestInit) {
    const res = await fetch(url, { ...init, headers: { ...authHeader, ...(init.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Drive API ${res.status}: ${json.error?.message || JSON.stringify(json).slice(0, 200)}`);
    }
    return json;
  }

  return {
    async createFolder(name, parentId) {
      const json = await driveJson(`${DRIVE}/files?fields=id,webViewLink&supportsAllDrives=true`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentId],
        }),
      });
      return { id: json.id as string, webViewLink: json.webViewLink as string };
    },

    async uploadFile(name, parentId, bytes, mime) {
      // Multipart upload: metadata part + media part in one request.
      const boundary = "nkportal" + Math.floor(now() * 1e6).toString(36);
      const meta = JSON.stringify({ name, parents: [parentId] });
      const enc = new TextEncoder();
      const pre = enc.encode(
        `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
          `--${boundary}\r\ncontent-type: ${mime}\r\n\r\n`,
      );
      const post = enc.encode(`\r\n--${boundary}--`);
      const body = new Uint8Array(pre.length + bytes.byteLength + post.length);
      body.set(pre, 0);
      body.set(new Uint8Array(bytes), pre.length);
      body.set(post, pre.length + bytes.byteLength);

      const json = await driveJson(
        `${UPLOAD}/files?uploadType=multipart&fields=id&supportsAllDrives=true`,
        {
          method: "POST",
          headers: { "content-type": `multipart/related; boundary=${boundary}` },
          body,
        },
      );
      return json.id as string;
    },
  };
}

// Date.now() is fine in Next.js runtime (this is NOT a workflow script); kept
// behind a tiny indirection so the boundary generator reads cleanly.
function now(): number {
  return Date.now() / 1000;
}

export type ExportInput = {
  folderName: string;
  files: { name: string; bytes: ArrayBuffer; mime: string }[];
};

export type ExportResult =
  | { ok: true; folderId: string; folderUrl: string; uploaded: number }
  | { ok: false; error: string };

/**
 * Create a per-client folder under the parent and upload every file into it.
 * One folder per submission keeps YLA's Drive tidy and gives the rep a single
 * shareable link for the Thursday calendar entry.
 */
export async function exportToDrive(input: ExportInput): Promise<ExportResult> {
  const cfg = driveConfig();
  if ("error" in cfg) return { ok: false, error: cfg.error };

  try {
    const drive = await client(cfg);
    const folder = await drive.createFolder(input.folderName, cfg.parentFolderId);
    let uploaded = 0;
    for (const f of input.files) {
      await drive.uploadFile(f.name, folder.id, f.bytes, f.mime);
      uploaded++;
    }
    return { ok: true, folderId: folder.id, folderUrl: folder.webViewLink, uploaded };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Drive export failed" };
  }
}
