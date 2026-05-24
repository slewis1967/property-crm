"use client";

/**
 * Route-segment error boundary. Catches errors thrown while rendering any
 * page below the root layout and shows a friendly retry instead of a bare
 * 500. Layout-level throws are handled by app/global-error.tsx instead.
 *
 * NOTE: Next.js passes this component a prop named `reset` (not
 * `resetError`). The previous version destructured `resetError`, so the
 * "Try again" button called `undefined()` and threw — fixed here.
 */
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces in Netlify function logs for diagnosis.
    console.error("Route render error:", error);
  }, [error]);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-50 p-6">
      <h1 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h1>
      <p className="text-center text-gray-600 mb-2 max-w-xl">
        A temporary error occurred while loading this view. Your session is
        still active — you can retry or navigate elsewhere.
      </p>
      {error?.digest && (
        <p className="text-xs text-gray-400 mb-6">Reference: {error.digest}</p>
      )}
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-[#0F4C5C] text-white rounded-md hover:bg-[#0B3D4A] transition"
      >
        Try again
      </button>
    </div>
  );
}
