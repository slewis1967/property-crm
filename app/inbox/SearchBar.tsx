"use client";

/**
 * SearchBar — full-text search input that round-trips through the URL.
 *
 * Why a client component for a single input: typing into the search box
 * needs immediate visual feedback (`value` is local state) but the
 * results come from the server render, so we navigate on submit instead
 * of fetching client-side. Submit on Enter or after a 400ms idle pause.
 *
 * The `search` URL param is read by app/inbox/page.tsx and threaded into
 * the supabase query via .textSearch('body_search', search).
 */
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function SearchBar({ initial }: { initial: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local state in sync if the URL changes from elsewhere (e.g. switching
  // folders should reset the search box).
  useEffect(() => {
    queueMicrotask(() => setValue(initial));
  }, [initial]);

  function navigate(next: string) {
    const sp = new URLSearchParams(params.toString());
    if (next.trim()) sp.set("search", next.trim());
    else sp.delete("search");
    const qs = sp.toString();
    router.push(qs ? `/inbox?${qs}` : "/inbox");
  }

  function onChange(v: string) {
    setValue(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate(v), 400);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    navigate(value);
  }

  function clear() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setValue("");
    navigate("");
  }

  return (
    <form onSubmit={onSubmit} className="relative w-full max-w-md">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
        🔍
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search mail…"
        className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:border-[#0F4C5C] focus:ring-1 focus:ring-[#0F4C5C]/30 transition"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 text-xs flex items-center justify-center"
          title="Clear search"
        >
          ✕
        </button>
      )}
    </form>
  );
}
