"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ContactDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[crm] contact detail error", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-xl p-6 text-center">
        <h1 className="text-xl font-bold text-[#0F4C5C] mb-2">
          Couldn&apos;t load this contact
        </h1>
        <p className="text-sm text-gray-600 mb-1">
          The contact record failed to load. The data source may be unavailable.
        </p>
        {error.digest && (
          <p className="text-xs text-gray-400 mb-4">
            Reference: <code>{error.digest}</code>
          </p>
        )}
        <div className="flex gap-2 justify-center mt-4">
          <button
            onClick={reset}
            className="px-4 py-2 bg-[#0F4C5C] text-white rounded-lg text-sm hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/contacts"
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            Back to contacts
          </Link>
        </div>
      </div>
    </div>
  );
}
