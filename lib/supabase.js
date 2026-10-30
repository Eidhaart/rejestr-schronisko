import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client. NEVER import this into a client component.
// The service role key bypasses Row Level Security, which is exactly why
// every call to it lives behind server-side access checks (see lib/session.js).
let _client = null;

export function getServiceClient() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Brak konfiguracji Supabase. Ustaw SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY w .env.local"
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export const PHOTO_BUCKET = "animal-photos";
