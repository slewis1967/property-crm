/**
 * Root Suspense fallback. Server components that await Supabase now show
 * this instead of a blank frame during the data fetch.
 */
export default function Loading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-[#0F4C5C] animate-spin"
          aria-hidden="true"
        />
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    </div>
  );
}
