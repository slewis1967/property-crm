"use client";

import { useEffect, useState } from "react";
import VideoRoom from "../../components/VideoRoom";
import { errMessage } from "../../../utils/errors";

/**
 * Guest call client. Redeems the signed guest token for a LiveKit join token,
 * then renders the conference full-viewport. Guests get publish + subscribe but
 * no Record control (that endpoint stays behind CRM auth), so we don't pass a
 * `room` to VideoRoom.
 */
export default function JoinClient({ guestToken }: { guestToken: string }) {
  const [state, setState] = useState<
    | { phase: "loading" }
    | { phase: "ready"; token: string; url: string }
    | { phase: "left" }
    | { phase: "error"; error: string }
  >({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/livekit/guest-token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ t: guestToken }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || `Couldn't join (${res.status})`);
        }
        if (!cancelled) {
          setState({ phase: "ready", token: data.token, url: data.url });
        }
      } catch (err) {
        if (!cancelled) setState({ phase: "error", error: errMessage(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guestToken]);

  const shell = (children: React.ReactNode) => (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#111",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#e5e7eb",
        textAlign: "center",
        padding: 24,
      }}
    >
      {children}
    </div>
  );

  if (state.phase === "loading") return shell("Joining the call…");
  if (state.phase === "error")
    return shell(<div>Couldn’t join the call: {state.error}</div>);
  if (state.phase === "left")
    return shell(<div>You’ve left the call. You can close this window.</div>);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#111" }}>
      <VideoRoom
        token={state.token}
        serverUrl={state.url}
        onLeave={() => setState({ phase: "left" })}
        // Guests get their room blurred, not our office wall behind them —
        // a client shouldn't look like they work here.
        background="blur"
      />
    </div>
  );
}
