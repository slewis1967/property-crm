"use client";

/** Toolbar above the printable brochure. Hidden in print by the deck's `.no-print` rule. */
export default function PrintBar({ title, note }: { title: string; note: string }) {
  return (
    <div className="no-print sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-200 px-4 py-3 flex flex-wrap gap-3 items-center">
      <button
        onClick={() => window.print()}
        className="px-4 py-2 text-sm font-semibold bg-[#1b1f44] text-white rounded-lg hover:bg-[#2a2f5e] transition"
      >
        Print / Save as PDF
      </button>
      <span className="text-sm font-medium text-gray-800">{title}</span>
      <span className="text-xs text-gray-500">Choose A4, margins “None”, and tick “Background graphics”.</span>
      {note && <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">{note}</span>}
    </div>
  );
}
