import { agreementBlocks, boldSegments } from "../../../utils/partner-agreement";

function Inline({ text }: { text: string }) {
  return (
    <>
      {boldSegments(text).map((s, i) => (s.bold ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>))}
    </>
  );
}

/** The agreement, rendered from its own small Markdown subset. Scrolls inside a box. */
export default function AgreementText({ text }: { text: string }) {
  const blocks = agreementBlocks(text);
  return (
    <div
      className="mt-5 max-h-[60vh] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)] p-5 text-sm leading-relaxed text-slate-800"
      tabIndex={0}
      aria-label="Partner agreement text"
    >
      {blocks.map((b, i) => {
        if (b.kind === "h1") return <h2 key={i} className="mb-3 text-lg font-semibold text-slate-900"><Inline text={b.text} /></h2>;
        if (b.kind === "h2") return <h3 key={i} className="mb-2 mt-5 font-semibold text-slate-900"><Inline text={b.text} /></h3>;
        if (b.kind === "hr") return <hr key={i} className="my-5 border-slate-200" />;
        if (b.kind === "table") {
          return (
            <div key={i} className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>{b.header.map((h, j) => <th key={j} className="border border-slate-200 bg-slate-50 px-2 py-1 text-left"><Inline text={h} /></th>)}</tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>{r.map((c, k) => <td key={k} className="border border-slate-200 px-2 py-1 align-top"><Inline text={c} /></td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={i} className="mb-3 whitespace-pre-line"><Inline text={b.text} /></p>;
      })}
    </div>
  );
}
