import ReviewQueueClient from "./ReviewQueueClient";

export const dynamic = "force-dynamic";

export default function ReviewQueuePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Review Queue</h1>
        <p className="text-sm text-gray-500 mt-1">
          Low-confidence property extractions awaiting human approval. Edit fields
          if needed, then approve to publish to the Aggregator Feed, or reject to
          discard.
        </p>
      </div>
      <ReviewQueueClient />
    </div>
  );
}
