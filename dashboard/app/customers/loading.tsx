export default function CustomersLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <div className="h-7 bg-gray-700 rounded w-64 mb-2" />
        <div className="h-4 bg-gray-800 rounded w-96" />
      </div>

      {/* Segment toggle skeletons */}
      <div className="flex items-center gap-3">
        <div className="h-4 bg-gray-800 rounded w-20" />
        <div className="h-9 bg-gray-700 rounded-lg w-48" />
        <div className="h-9 bg-gray-700 rounded-lg w-40" />
      </div>

      {/* Summary bar skeleton */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl px-5 py-3">
        <div className="h-4 bg-gray-700 rounded w-72" />
      </div>

      {/* Chart grid skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="h-4 bg-gray-700 rounded w-32" />
              <div className="h-3 bg-gray-700 rounded w-20" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3">
                  <div className="h-3 bg-gray-700 rounded w-24 shrink-0" />
                  <div
                    className="h-6 bg-gray-700 rounded"
                    style={{ width: `${70 - j * 15}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
