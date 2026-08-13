"use client";

/**
 * Portal header — brand, who's signed in, and sign-out.
 *
 * Sign-out POSTs rather than clearing the cookie in the browser, because the
 * server-side session must be revoked too: a cookie cleared locally leaves a
 * still-valid token behind on anything that copied it.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PortalHeader({
  firmName,
  userName,
}: {
  firmName: string;
  userName: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/introducer/logout", { method: "POST" });
    } finally {
      router.push("/introducer");
      router.refresh();
    }
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/introducer/clients" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/portal/logo" alt="Springboard Homes" className="h-7 w-auto" />
          <span className="border-l border-gray-200 pl-3">
            <span className="block text-sm font-semibold" style={{ color: "#020e40" }}>
              Introducer Portal
            </span>
            <span className="block text-xs text-gray-500">{firmName}</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          {userName && <span className="hidden text-sm text-gray-600 sm:inline">{userName}</span>}
          <button
            onClick={signOut}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
