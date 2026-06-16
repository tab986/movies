import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import MovieRow from "../components/MovieRow";
import { fetchMovies } from "../services/api";

function partitionMovies(movies) {
  const list = [...movies];
  const popular = [...list].sort((a, b) => b.rating - a.rating).slice(0, 10);
  const trending = [...list].sort((a, b) => b.id - a.id).slice(0, 10);
  const topRated = [...list].sort((a, b) => b.rating - a.rating).slice(0, 12);
  let upcoming = list.filter((m) => m.release_year >= 2024);
  if (upcoming.length < 4) {
    upcoming = [...list].sort((a, b) => b.release_year - a.release_year).slice(0, 10);
  } else {
    upcoming = upcoming.sort((a, b) => b.release_year - a.release_year).slice(0, 10);
  }
  const hero = popular[0] || list[0];
  return { popular, trending, topRated, upcoming, hero };
}

export default function Home() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchMovies();
        if (!cancelled) {
          setMovies(Array.isArray(data) ? data : []);
          if (!data?.length) {
            setError("No movies returned. Check TMDB API keys on the server.");
          }
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err?.response?.data?.error ||
            err?.message ||
            "Could not load movies.";
          setError(msg);
          console.error(err);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { popular, trending, topRated, upcoming, hero } = useMemo(
    () => partitionMovies(movies),
    [movies]
  );

  return (
    <div>
      {error && !loading && (
        <div className="mx-4 mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 md:mx-10">
          {error}
        </div>
      )}
      {hero && (
        <section className="relative -mt-[120px] mb-8 min-h-[62vh] md:-mt-[88px]">
          <div
            className="absolute inset-0 bg-cover bg-[center_20%]"
            style={{
              backgroundImage: `linear-gradient(90deg, rgba(10,10,11,0.95) 0%, rgba(10,10,11,0.5) 45%, rgba(10,10,11,0.7) 100%), linear-gradient(180deg, transparent 40%, #0a0a0b 100%), url(${hero.poster_url})`,
            }}
          />
          <div className="relative z-10 flex min-h-[62vh] flex-col justify-end px-4 pb-12 pt-32 md:px-10 md:pb-16">
            <span className="mb-2 inline-block w-fit rounded border border-brand-red/40 bg-brand-red/10 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-brand-red">
              Featured
            </span>
            <h1 className="max-w-3xl font-display text-5xl tracking-wide text-white md:text-6xl">{hero.title}</h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-zinc-300 md:text-base">{hero.description}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to={`/movie/${hero.id}`}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-bold text-black hover:bg-zinc-200"
              >
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Play
              </Link>
              <Link
                to="/my-list"
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur hover:bg-white/20"
              >
                My List
              </Link>
            </div>
          </div>
        </section>
      )}

      <div className="pb-8">
        <MovieRow title="Popular on Tab" subtitle="Highest audience scores" movies={popular} loading={loading} />
        <MovieRow title="Trending Now" subtitle="Recently added" movies={trending} loading={loading} />
        <MovieRow title="Top Rated" subtitle="Critics & fans agree" movies={topRated} loading={loading} />
        <MovieRow title="Upcoming & recent" subtitle="New releases" movies={upcoming} loading={loading} />
      </div>
    </div>
  );
}
