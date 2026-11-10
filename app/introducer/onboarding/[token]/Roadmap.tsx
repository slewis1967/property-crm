import type { RoadmapView } from "@/utils/introducer-onboarding";

/**
 * The roadmap an applicant sees at every step.
 *
 * The point of showing all six steps rather than only the current one is that
 * accreditation asks a lot of someone who has not been paid yet — an NDA, photo
 * ID, several hours of course, an exam at 100%, then two more signatures. Seeing
 * the whole shape up front, and how much of it is behind them, is the difference
 * between "one more thing" and "how much more of this is there".
 */
export default function Roadmap({
  steps,
  accreditationNo,
}: {
  steps: RoadmapView[];
  accreditationNo: string | null;
}) {
  return (
    <ol className="mt-8 space-y-0">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={step.key} className="relative flex gap-4 pb-6 last:pb-0">
            {/* Connector, drawn behind the marker so it never overlaps it. */}
            {!last && (
              <span
                aria-hidden
                className="absolute left-[0.6875rem] top-6 h-full w-px"
                style={{ backgroundColor: step.status === "done" ? "#c7894e" : "#e5e7eb" }}
              />
            )}

            <span
              aria-hidden
              className="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[0.65rem] font-bold"
              style={
                step.status === "done"
                  ? { backgroundColor: "#c7894e", borderColor: "#c7894e", color: "#fff" }
                  : step.status === "current"
                    ? { backgroundColor: "#fff", borderColor: "#020e40", color: "#020e40" }
                    : { backgroundColor: "#fff", borderColor: "#e5e7eb", color: "#9ca3af" }
              }
            >
              {step.status === "done" ? "✓" : i + 1}
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={
                  step.status === "upcoming"
                    ? "text-sm font-medium text-gray-400"
                    : "text-sm font-semibold"
                }
                style={step.status === "upcoming" ? undefined : { color: "#020e40" }}
              >
                {step.title}
                {step.status === "current" && (
                  <span
                    className="ml-2 rounded px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider"
                    style={{ backgroundColor: "#eef1f8", color: "#020e40" }}
                  >
                    You’re here
                  </span>
                )}
              </p>
              <p
                className={
                  step.status === "upcoming" ? "mt-0.5 text-sm text-gray-400" : "mt-0.5 text-sm text-gray-600"
                }
              >
                {step.detail}
              </p>

              {step.key === "certificate" && step.status === "done" && accreditationNo && (
                <p className="mt-1 text-xs text-gray-500">
                  Accreditation number{" "}
                  <span className="font-mono font-semibold tabular-nums" style={{ color: "#020e40" }}>
                    {accreditationNo}
                  </span>
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
