import BrainClient from "./BrainClient";

export const dynamic = "force-dynamic";

export default function BrainPage() {
  return (
    <div>
      <div className="mb-5 lg:mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold flex items-center gap-2 lg:gap-3">
          <span>🧠</span> Brain
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          The CRM&apos;s long-term memory. Learnings recorded by the AI agents (voice
          assistant, advisor, outreach) plus knowledge you curate here — recalled
          to make every AI feature smarter. Synced two-way with the
          NextKey&nbsp;CRM&nbsp;Brain Obsidian vault.
        </p>
      </div>
      <BrainClient />
    </div>
  );
}
