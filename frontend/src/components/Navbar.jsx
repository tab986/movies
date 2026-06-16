import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router-dom";

export default function Navbar() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setQ(searchParams.get("q") || "");
  }, [searchParams]);

  const onSearch = (e) => {
    e.preventDefault();
    const v = q.trim();
    navigate(v ? `/search?q=${encodeURIComponent(v)}` : "/search");
  };

  const navLink = ({ isActive }) =>
    `rounded-md px-3 py-2 text-sm font-medium transition ${isActive ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"}`;

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 border-b transition-colors ${
        scrolled ? "border-white/10 bg-black/90 backdrop-blur-md" : "border-transparent bg-gradient-to-b from-black/80 to-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-[1920px] items-center gap-3 px-4 py-3 md:px-10">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <svg className="h-9 w-9 text-brand-red" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <rect x="2" y="6" width="36" height="28" rx="3" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="20" r="4" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="28" cy="20" r="4" stroke="currentColor" strokeWidth="1.5" />
            <path d="M16 20h8" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span className="font-display text-2xl tracking-wide text-white">Tab</span>
        </Link>

        <button
          type="button"
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-md border border-white/15 md:hidden"
          aria-label="Menu"
          onClick={() => setOpen((o) => !o)}
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <nav
          className={`${
            open ? "flex" : "hidden"
          } absolute left-0 right-0 top-full flex-col gap-1 border-b border-white/10 bg-black/95 p-4 md:static md:flex md:flex-row md:flex-wrap md:items-center md:border-0 md:bg-transparent md:p-0`}
        >
          <NavLink to="/" end className={navLink} onClick={() => setOpen(false)}>
            Home
          </NavLink>
          <NavLink to="/search" className={navLink} onClick={() => setOpen(false)}>
            Movies
          </NavLink>
          <NavLink to="/my-list" className={navLink} onClick={() => setOpen(false)}>
            My List
          </NavLink>
        </nav>

        <form onSubmit={onSearch} className="mx-auto hidden min-w-0 flex-1 max-w-md md:mx-0 md:flex">
          <label className="relative w-full">
            <span className="sr-only">Search</span>
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="7" strokeWidth="2" />
              <path d="M20 20l-3-3" strokeWidth="2" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search titles..."
              className="w-full rounded-full border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder:text-zinc-500 focus:border-brand-red/50 focus:outline-none focus:ring-2 focus:ring-brand-red/30"
            />
          </label>
        </form>
      </div>

      <form onSubmit={onSearch} className="border-t border-white/5 px-4 py-2 md:hidden">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search..."
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
        />
      </form>
    </header>
  );
}
