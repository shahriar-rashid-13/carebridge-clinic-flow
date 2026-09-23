import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"];
const supabasePublishableKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

function createMissingEnvClient(): SupabaseClient {
  // Defer the failure from module-load time (which crashes SSR/prerender of
  // the whole app) to first actual use, and only when no real client exists.
  return new Proxy({} as SupabaseClient, {
    get() {
      throw new Error("Missing Supabase environment variables.");
    },
  });
}

export const supabase: SupabaseClient =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey)
    : createMissingEnvClient();
