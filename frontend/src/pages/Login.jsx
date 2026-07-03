import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import ClosingPlasma from "../components/ClosingPlasma";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login, isAuthenticated, ready } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (isAuthenticated) navigate(from, { replace: true });
  }, [ready, isAuthenticated, navigate, from]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email.trim().toLowerCase(), password);
      toast.success("Welcome back!");
      navigate(from, { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "Login failed";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <ClosingPlasma
        className="fixed inset-0 z-0"
        themeMode="dark"
        darkColorA="#0a0a0b"
        darkColorB="#141414"
        darkColorC="#3d1a24"
        speed={0.9}
        turbulence={1}
        mouseInfluence={0.8}
        grain={0.6}
        sparkle={0.7}
        vignette={0.9}
      />
      <div className="relative z-10 flex min-h-[70vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur">
        <h1 className="font-display text-4xl tracking-wide text-white">Log in</h1>
        <p className="mt-1 text-sm text-zinc-500">Use your Tab account</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-400">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-white focus:border-brand-red/50 focus:outline-none focus:ring-2 focus:ring-brand-red/25"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-400">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-white focus:border-brand-red/50 focus:outline-none focus:ring-2 focus:ring-brand-red/25"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand-red py-3 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          New here?{" "}
          <Link to="/register" className="font-semibold text-brand-red hover:underline">
            Create an account
          </Link>
        </p>
        </div>
      </div>
    </>
  );
}
