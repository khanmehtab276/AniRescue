export function CaseCardSkeleton() {
  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="space-y-2 flex-1">
          <div className="h-4 w-1/3 rounded bg-slate-300 dark:bg-slate-700" />
          <div className="h-3 w-1/4 rounded bg-slate-300 dark:bg-slate-700" />
        </div>
        <div className="h-5 w-16 rounded-full bg-slate-300 dark:bg-slate-700" />
      </div>
      <div className="h-3 w-full rounded bg-slate-300 dark:bg-slate-700 mb-2" />
      <div className="h-3 w-2/3 rounded bg-slate-300 dark:bg-slate-700" />
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
