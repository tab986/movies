import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import MovieCard from "../components/MovieCard";
import SkeletonCard from "../components/SkeletonCard";
import { useMyList } from "../hooks/useMyList";
import { fetchMovie } from "../services/api";

export default function MyList() {
  const { ids } = useMyList();
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (ids.length === 0) {
        if (!cancelled) {
          setMovies([]);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      try {
        const results = await Promise.all(
          ids.map(async (id) => {
            try {
              return await fetchMovie(id);
            } catch {
              return null;
            }
          })
        );
        if (!cancelled) setMovies(results.filter(Boolean));
      } catch {
        if (!cancelled) toast.error("Could not load your list.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ids]);

  return (
    <div className="min-h-[60vh] px-4 pb-16 md:px-10">
      <h1 className="font-display text-3xl tracking-wide text-white md:text-4xl">My List</h1>
      <p className="mt-1 text-sm text-zinc-500">Saved on this device — no account needed.</p>

      <div className="mt-10 flex flex-wrap gap-4">
        {loading &&
          Array.from({ length: Math.min(ids.length || 4, 8) }).map((_, i) => <SkeletonCard key={i} />)}
        {!loading && movies.length === 0 && (
          <p className="text-zinc-500">Your list is empty. Add movies from a movie page.</p>
        )}
        {!loading && movies.map((m) => <MovieCard key={m.id} movie={m} />)}
      </div>
    </div>
  );
}
