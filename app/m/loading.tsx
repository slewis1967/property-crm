/**
 * Phone-view loading state. Sits inside app/m/layout.tsx, so the bottom tab
 * bar stays on screen while the next page loads; without it, the root
 * loading.tsx replaced the whole screen with a spinner on every tap.
 */
export default function PhoneLoading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="h-[calc(3.25rem+env(safe-area-inset-top))] bg-[#0F4C5C]" />
      <div className="space-y-3 px-4 pt-5">
        <div className="h-3 w-24 animate-pulse rounded bg-gray-200" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-white shadow-sm" />
        ))}
      </div>
    </div>
  );
}
