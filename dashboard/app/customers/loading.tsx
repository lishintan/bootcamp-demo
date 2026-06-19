export default function CustomersLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <div className="h-7 bg-gray-700 rounded w-64 mb-2" />
        <div className="h-4 bg-gray-800 rounded w-96" />
      </div>

      {/* Summary bar skeleton */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl px-5 py-3">
        <div className="h-4 bg-gray-700 rounded w-72" />
      </div>

      {/* Persona card grid skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-full bg-gray-700 shrink-0" />
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-gray-700 rounded w-40" />
                <div className="h-3 bg-gray-700 rounded w-28" />
              </div>
            </div>
            <div className="h-10 bg-gray-700/60 rounded" />
            <div className="space-y-2">
              <div className="h-3 bg-gray-700 rounded w-full" />
              <div className="h-3 bg-gray-700 rounded w-5/6" />
              <div className="h-3 bg-gray-700 rounded w-4/6" />
            </div>
            <div className="space-y-2 border-t border-gray-700/70 pt-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between">
                  <div className="h-3 bg-gray-700 rounded w-20" />
                  <div className="h-3 bg-gray-700 rounded w-16" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
