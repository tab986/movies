import { createBrowserClient } from "@supabase/ssr";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Browser Supabase client (Vite). Uses @supabase/ssr createBrowserClient for PKCE + session storage.
 * Next.js server/middleware helpers from Supabase docs do not apply to this SPA — session refresh is handled here + AuthContext.
 */
export const supabase = createBrowserClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
