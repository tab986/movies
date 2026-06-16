import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register, isAuthenticated, ready } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (isAuthenticated) navigate("/", { replace: true });
  }, [ready, isAuthenticated, navigate]);

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-red border-t-transparent" />
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { needsEmailConfirmation } = await register(
        username.trim(),
        email.trim().toLowerCase(),
        password
      );
      if (needsEmailConfirmation) {
        toast.success("Check your email to confirm your account, then log in.");
        navigate("/login", { replace: true });
      } else {
        toast.success("Account created!");
        navigate("/", { replace: true });
      }
    } catch (err) {
      const msg = err?.message || err.response?.data?.error || "Registration failed";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur">
        <h1 className="font-display text-4xl tracking-wide text-white">Sign up</h1>
        <p className="mt-1 text-sm text-zinc-500">Username, email & password</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-zinc-400">
              Username
            </label>
            <input
              id="username"
              autoComplete="username"
              required
              minLength={3}
              maxLength={32}
              pattern="[a-zA-Z0-9_]{3,32}"
              title="3–32 characters: letters, numbers, underscore"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-white focus:border-brand-red/50 focus:outline-none focus:ring-2 focus:ring-brand-red/25"
            />
          </div>
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
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-white focus:border-brand-red/50 focus:outline-none focus:ring-2 focus:ring-brand-red/25"
            />
            <p className="mt-1 text-xs text-zinc-600">At least 8 characters</p>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand-red py-3 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-brand-red hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
