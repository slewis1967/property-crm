"use client";

/** Export-to-PDF via the browser print dialog (Save as PDF). The page's
 * @media print styles hide the toolbar and lay the report out cleanly. */
export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="px-4 py-2 text-sm font-semibold bg-[#0F4C5C] text-white rounded-lg hover:bg-[#0B3D4A] transition"
    >
      Export PDF
    </button>
  );
}
