import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useMyList } from "../hooks/useMyList";
import { fetchMovie } from "../services/api";

export default function MovieDetail() {
  const { id } = useParams();
  const { isInList, toggle, checkStatus } = useMyList();
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [inList, setInList] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await fetchMovie(id);
        if (!cancelled) setMovie(m);
      } catch {
        if (!cancelled) toast.error("Movie not found.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!movie) return;
    let cancelled = false;
    (async () => {
      const status = await checkStatus(movie.id);
      if (!cancelled) setInList(status);
    })();
    return () => {
      cancelled = true;
    };
  }, [movie, checkStatus]);

  useEffect(() => {
    if (movie) setInList(isInList(movie.id));
  }, [movie, isInList]);

  const handleToggleList = async () => {
    if (!movie) return;
    setListLoading(true);
    try {
      const added = await toggle(movie.id);
      setInList(added);
      toast.success(added ? "Added to My List" : "Removed from My List");
    } catch {
      toast.error("Could not update list");
    } finally {
      setListLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 py-12 md:px-10">
        <div className="mx-auto max-w-5xl animate-pulse">
          <div className="aspect-video w-full rounded-xl bg-zinc-800" />
          <div className="mt-6 h-8 w-2/3 rounded bg-zinc-800" />
          <div className="mt-4 h-4 w-full rounded bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="px-4 py-20 text-center md:px-10">
        <p className="text-zinc-400">Movie not found.</p>
        <Link to="/" className="mt-4 inline-block text-brand-red hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 pb-16 pt-4 md:px-10">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
        <div
          className="aspect-[21/9] min-h-[200px] bg-cover bg-center md:aspect-[2.4/1]"
          style={{
            backgroundImage: `linear-gradient(180deg, transparent 20%, #0a0a0b 100%), url(${movie.poster_url})`,
          }}
        />
        <div className="relative -mt-16 flex flex-col gap-6 bg-gradient-to-b from-transparent to-brand-dark px-6 pb-8 md:flex-row md:items-end md:px-10">
          <img
            src={movie.poster_url}
            alt=""
            className="mx-auto w-44 shrink-0 rounded-lg shadow-xl ring-2 ring-white/10 md:mx-0 md:w-52"
          />
          <div className="flex-1 pb-2">
            <h1 className="font-display text-4xl text-white md:text-5xl">{movie.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
              <span className="font-semibold text-emerald-400">★ {Number(movie.rating).toFixed(1)}</span>
              <span>{movie.release_year}</span>
            </div>
            <p className="mt-4 max-w-3xl text-zinc-300">{movie.description}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-bold text-black hover:bg-zinc-200"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Play
              </button>
              <button
                type="button"
                disabled={listLoading}
                onClick={handleToggleList}
                className={`rounded-lg border px-5 py-2.5 text-sm font-semibold transition ${
                  inList
                    ? "border-brand-red bg-brand-red/20 text-brand-red"
                    : "border-white/20 bg-white/5 text-white hover:bg-white/10"
                }`}
              >
                {inList ? "✓ In My List" : "+ My List"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
