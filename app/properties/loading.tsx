export default function PropertiesLoading() {
  return (
    <div className="p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse"
          >
            <div className="h-48 bg-gray-100 rounded-lg mb-3" />
            <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-1/2 mb-3" />
            <div className="flex gap-2">
              <div className="h-6 bg-gray-100 rounded w-16" />
              <div className="h-6 bg-gray-100 rounded w-16" />
              <div className="h-6 bg-gray-100 rounded w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
