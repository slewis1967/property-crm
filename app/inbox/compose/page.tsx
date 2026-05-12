import { Suspense } from "react";
import ComposeClient from "./ComposeClient";

export const dynamic = "force-dynamic";

// Thin server wrapper — the real composer is a client component because it
// needs state, auto-save, and contentEditable focus handling. Reading the
// query params on the server lets us pass them down cleanly without a
// useSearchParams hook (which would force Suspense boundaries anyway).
export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string; reply?: string }>;
}) {
  const sp = await searchParams;
  return (
    <Suspense>
      <ComposeClient draftId={sp.draft ?? null} replyToEmailId={sp.reply ?? null} />
    </Suspense>
  );
}
