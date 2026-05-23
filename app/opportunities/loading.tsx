export default function OpportunitiesLoading() {
  return (
    <div className="p-6">
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-28 bg-gray-100 rounded-md animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse"
          >
            <div className="h-4 bg-gray-100 rounded w-3/4 mb-3" />
            <div className="h-3 bg-gray-100 rounded w-1/2 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-2/3 mb-3" />
            <div className="flex justify-between">
              <div className="h-5 bg-gray-100 rounded w-16" />
              <div className="h-5 bg-gray-100 rounded w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
