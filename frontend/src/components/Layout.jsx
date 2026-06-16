import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";

export default function Layout() {
  return (
    <div className="min-h-screen bg-brand-dark">
      <Navbar />
      <main className="pt-[120px] md:pt-[88px]">
        <Outlet />
      </main>
      <footer className="border-t border-white/10 bg-black/40 px-4 py-12 md:px-10">
        <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Company</h3>
            <ul className="mt-3 space-y-2 text-sm text-zinc-400">
              <li>
                <a href="#" className="hover:text-brand-red">
                  About
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-brand-red">
                  Careers
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Support</h3>
            <ul className="mt-3 space-y-2 text-sm text-zinc-400">
              <li>
                <a href="#" className="hover:text-brand-red">
                  Help Center
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-brand-red">
                  Privacy
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Follow</h3>
            <div className="mt-3 flex gap-3">
              <a href="#" className="rounded-full border border-white/10 p-2 hover:border-brand-red/50" aria-label="Twitter">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a href="#" className="rounded-full border border-white/10 p-2 hover:border-brand-red/50" aria-label="YouTube">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10 15V9l5.2 3-5.2 3zm12-4.69c0-.72-.06-1.44-.18-2.14-.16-.84-.76-1.5-1.6-1.66C18.88 6.2 12 6.2 12 6.2s-6.88 0-8.62.3c-.84.16-1.44.82-1.6 1.66C2.06 9.86 2 10.58 2 11.3v1.38c0 .72.06 1.44.18 2.14.16.84.76 1.5 1.6 1.66 1.74.3 8.62.3 8.62.3s6.88 0 8.62-.3c.84-.16 1.5-.82 1.6-1.66.12-.7.18-1.42.18-2.14v-1.38z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
        <p className="mt-10 text-center text-xs text-zinc-600">© {new Date().getFullYear()} Tab — demo app</p>
      </footer>
    </div>
  );
}
