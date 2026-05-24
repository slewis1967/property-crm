'use client';

export default function Error({ error, resetError }: { error: Error & { digest?: string }; resetError: () => void }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-50 p-6">
      <h1 className="text-2xl font-bold text-red-600 mb-4">
        Something went wrong
      </h1>
      <p className="text-center text-gray-600 mb-6 max-w-xl">
        {error.message ?? 'Unknown error'}
      </p>
      <button
        onClick={() => {
          resetError();
          window.location.reload();
        }}
        className="px-4 py-2 bg-[#0F4C5C] text-white rounded-md hover:bg-[#0B3D4A] transition"
      >
        Try again
      </button>
    </div>
  );
}