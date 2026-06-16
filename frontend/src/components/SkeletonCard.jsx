export default function SkeletonCard() {
  return (
    <div className="w-[140px] shrink-0 sm:w-[160px] md:w-[180px]">
      <div className="aspect-[2/3] animate-pulse rounded-lg bg-zinc-800" />
      <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-zinc-800" />
      <div className="mt-1 h-3 w-1/3 animate-pulse rounded bg-zinc-800" />
    </div>
  );
}
