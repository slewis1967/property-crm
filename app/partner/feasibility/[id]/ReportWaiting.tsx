"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Shown while the background function writes the report. Polls every 5s and
 * re-renders the page once it is ready. Gives up polling after 12 minutes
 * (the server marks a stuck job failed after 10).
 */
export default function ReportWaiting({ id, address }: { id: string; address: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    const started = Date.now();
    const tick = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`/api/partner/feasibility/${id}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (json.status === "ready") {
          router.refresh();
          return;
        }
        if (json.status === "failed") {
          setError(typeof json.error === "string" ? json.error : "The report couldn't be written.");
          return;
        }
      } catch {
        /* keep polling */
      }
      if (Date.now() - started < 12 * 60_000) setTimeout(tick, 5000);
      else setError("This is taking much longer than usual. Please check back later or contact NextKey.");
    };
    const t = setTimeout(tick, 5000);
    return () => {
      stopped = true;
      clearTimeout(t);
    };
  }, [id, router]);

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">{error}</div>;
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-700">
      <div className="font-semibold text-gray-900">Writing the report for {address}</div>
      <p className="mt-1">This usually takes about a minute. You can leave this page; the report will be in your list when it&apos;s done.</p>
    </div>
  );
}
