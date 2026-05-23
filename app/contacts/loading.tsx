export default function ContactsLoading() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-9 w-48 bg-gray-100 rounded-md animate-pulse" />
        <div className="h-9 w-24 bg-gray-100 rounded-md animate-pulse" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 bg-white border border-gray-200 rounded-lg p-3 animate-pulse"
          >
            <div className="h-10 w-10 bg-gray-100 rounded-full" />
            <div className="flex-1">
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-1" />
              <div className="h-3 bg-gray-100 rounded w-1/4" />
            </div>
            <div className="h-6 w-16 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
