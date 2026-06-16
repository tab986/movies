import { Link } from "react-router-dom";

export default function MovieCard({ movie }) {
  return (
    <article className="group relative w-[140px] shrink-0 transition-transform duration-300 hover:z-20 hover:scale-105 sm:w-[160px] md:w-[180px]">
      <Link to={`/movie/${movie.id}`} className="block">
        <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-zinc-900 shadow-xl ring-1 ring-white/5">
          <img
            src={movie.poster_url}
            alt=""
            className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />
          <div className="absolute inset-0 flex flex-col items-center justify-end gap-2 p-3 opacity-0 transition duration-300 group-hover:opacity-100">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-lg">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-white/90">Details</span>
          </div>
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-zinc-100">{movie.title}</h3>
        <p className="mt-0.5 text-xs font-medium text-emerald-400">★ {Number(movie.rating).toFixed(1)}</p>
      </Link>
    </article>
  );
}
