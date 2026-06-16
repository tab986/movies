import MovieCard from "./MovieCard";
import SkeletonCard from "./SkeletonCard";

export default function MovieRow({ title, subtitle, movies, loading }) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-end justify-between px-4 md:px-10">
        <div>
          <h2 className="font-display text-2xl tracking-wide text-white md:text-3xl">{title}</h2>
          {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      <div className="row-scroll flex gap-3 overflow-x-auto overflow-y-hidden px-4 pb-2 md:gap-4 md:px-10">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
          : movies.map((m) => <MovieCard key={m.id} movie={m} />)}
      </div>
    </section>
  );
}
