"use client";

/**
 * Root error boundary. Catches errors thrown in the root layout itself
 * (where a module-load throw from utils/supabase.ts would surface) — the
 * one place app/error.tsx cannot reach. Renders its own <html>/<body>
 * because it replaces the whole document, so it cannot rely on the app
 * layout or Tailwind being loaded — inline styles only, brand teal.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-AU">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0F4C5C",
          color: "#fff",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: 460 }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: ".5rem" }}>
            The CRM hit an unexpected error
          </h1>
          <p style={{ opacity: 0.85, lineHeight: 1.5, marginBottom: "1.25rem" }}>
            Your session is still valid. This has been logged. If it persists,
            it usually means a backend service or configuration needs attention.
          </p>
          {error?.digest && (
            <p style={{ fontSize: 12, opacity: 0.6, marginBottom: "1.25rem" }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={() => reset()}
            style={{
              background: "#FFB627",
              color: "#0F4C5C",
              border: 0,
              borderRadius: 8,
              padding: ".6rem 1.2rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
