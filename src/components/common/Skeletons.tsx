export function CardSkeleton() {
  return (
    <div className="w-full">
      <div className="skeleton aspect-[2/3] rounded-xl" />
      <div className="skeleton h-3 rounded mt-2 w-4/5" />
      <div className="skeleton h-2.5 rounded mt-1.5 w-3/5" />
    </div>
  )
}

export function RowSkeleton() {
  return (
    <div className="px-4 md:px-10 mt-10">
      <div className="skeleton h-6 w-48 rounded mb-4" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="shrink-0 w-36 sm:w-44">
            <CardSkeleton />
          </div>
        ))}
      </div>
    </div>
  )
}

export function HeroSkeleton() {
  return <div className="skeleton h-[58vh] min-h-[420px] w-full" />
}
