/**
 * The mark inside a ticked checkbox on a printed compliance document.
 *
 * Drawn as an SVG rather than written as a character. Every one of these
 * documents used the glyph "✕", which renders fine in a browser and vanishes in
 * the PDF: the headless Chromium these are rendered with ships a minimal font
 * set that has no glyph for U+2715, so it came out blank. Nothing errored — the
 * Needs Analysis, Credit File Authorisation, Fact Find and EOI simply went to
 * YLA and to brokers with every box on every page unticked: no employment type,
 * no pay frequency, no marital status, no ownership. A form that reads as
 * half-completed is exactly what a "we run like a bank" assessor rejects.
 *
 * Geometry: 8×8 inside the 10px bordered box (1px border each side), so it fits
 * the existing box in all four documents without touching their CSS.
 */
export default function PrintTick() {
  return (
    <svg
      viewBox="0 0 10 10"
      width="8"
      height="8"
      aria-hidden="true"
      // display:block + auto margins centre it without depending on the line
      // box, which the boxes set to a fixed 9px for the old text glyph.
      style={{ display: "block", margin: "0 auto" }}
    >
      <path
        d="M2 2 L8 8 M8 2 L2 8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
