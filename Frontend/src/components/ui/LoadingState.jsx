export function CaseCardSkeleton() {
  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 animate-pulse">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="space-y-2 flex-1">
          <div className="h-4 w-1/3 rounded bg-stone-300 dark:bg-stone-700" />
          <div className="h-3 w-1/4 rounded bg-stone-300 dark:bg-stone-700" />
        </div>
        <div className="h-5 w-16 rounded-full bg-stone-300 dark:bg-stone-700" />
      </div>
      <div className="h-3 w-full rounded bg-stone-300 dark:bg-stone-700 mb-2" />
      <div className="h-3 w-2/3 rounded bg-stone-300 dark:bg-stone-700" />
    </div>
  );
}

export function CaseListSkeleton({ count = 3 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <CaseCardSkeleton key={i} />
      ))}
    </div>
  );
}
