import { Skeleton } from "@/components/ui/skeleton";

/**
 * Squelettes affichés instantanément pendant le chargement d'une page
 * (fichiers loading.tsx) : l'écran réagit au clic au lieu de rester figé.
 */
function HeaderSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-[3px] w-16" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

export function TablePageSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Chargement">
      <HeaderSkeleton />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="rounded-xl bg-white ring-1 ring-line overflow-hidden">
        <Skeleton className="h-10 w-full rounded-none" />
        <div className="divide-y divide-line">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24 hidden md:block" />
              <Skeleton className="h-5 w-20 rounded-full ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Chargement">
      <Skeleton className="h-4 w-32" />
      <HeaderSkeleton />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl bg-white ring-1 ring-line p-5 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-white ring-1 ring-line p-5 space-y-3">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function DashboardPageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Chargement">
      <HeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-white ring-1 ring-line p-5 space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </div>
  );
}
