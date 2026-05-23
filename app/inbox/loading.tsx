export default function InboxLoading() {
  return (
    <div className="p-6">
      <div className="flex gap-2 mb-4">
        <div className="h-9 w-24 bg-gray-100 rounded-md animate-pulse" />
        <div className="h-9 w-24 bg-gray-100 rounded-md animate-pulse" />
      </div>
      <div className="space-y-1">
        {Array.from({ length: 15 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 bg-white border border-gray-200 rounded-lg p-3 animate-pulse"
          >
            <div className="h-5 w-5 bg-gray-100 rounded" />
            <div className="flex-1">
              <div className="h-4 bg-gray-100 rounded w-1/4 mb-1" />
              <div className="h-3 bg-gray-100 rounded w-3/4" />
            </div>
            <div className="h-3 w-16 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
