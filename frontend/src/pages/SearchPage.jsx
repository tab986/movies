import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import MovieCard from "../components/MovieCard";
import SkeletonCard from "../components/SkeletonCard";
import { useDebounce } from "../hooks/useDebounce";
import { searchMovies } from "../services/api";

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = searchParams.get("q") || "";
  const [input, setInput] = useState(initial);
  const debounced = useDebounce(input, 300);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInput(initial);
  }, [initial]);

  useEffect(() => {
    const q = debounced.trim();
    setSearchParams(q ? { q } : {}, { replace: true });

    if (!q) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await searchMovies(q);
        if (!cancelled) setResults(data);
      } catch {
        if (!cancelled) toast.error("Search failed.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debounced, setSearchParams]);

  return (
    <div className="min-h-[60vh] px-4 pb-16 md:px-10">
      <h1 className="font-display text-3xl tracking-wide text-white md:text-4xl">Search</h1>
      <p className="mt-1 text-sm text-zinc-500">Results update as you type (300ms debounce).</p>

      <div className="mt-8">
        <label className="sr-only" htmlFor="search-input">
          Search movies
        </label>
        <input
          id="search-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a movie title..."
          className="w-full max-w-xl rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-zinc-500 focus:border-brand-red/40 focus:outline-none focus:ring-2 focus:ring-brand-red/25"
        />
      </div>

      <div className="mt-10">
        {loading && (
          <div className="flex flex-wrap gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}
        {!loading && debounced.trim() && results.length === 0 && (
          <p className="text-zinc-500">No movies match “{debounced.trim()}”.</p>
        )}
        {!loading && results.length > 0 && (
          <div className="flex flex-wrap gap-4">
            {results.map((m) => (
              <MovieCard key={m.id} movie={m} />
            ))}
          </div>
        )}
        {!debounced.trim() && !loading && (
          <p className="text-zinc-600">Enter a search term to see movies from the database.</p>
        )}
      </div>
    </div>
  );
}
