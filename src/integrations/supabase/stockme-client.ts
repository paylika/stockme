// StockMe production database client (self-managed Supabase project).
// URL and publishable (anon) key are public by design — access is protected by RLS.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export const STOCKME_SUPABASE_URL = "https://minnkepmfqnbmcreojor.supabase.co";
export const STOCKME_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pbm5rZXBtZnFuYm1jcmVvam9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1NDcyMzUsImV4cCI6MjEwMjEyMzIzNX0.qZx9_0b3Q2Js9f-kjQqirI3WElxOlV2AAdTM9FS4Esk";

function createStockmeClient() {
  return createClient<Database>(STOCKME_SUPABASE_URL, STOCKME_SUPABASE_ANON_KEY, {
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _client: ReturnType<typeof createStockmeClient> | undefined;

// import { supabase } from "@/integrations/supabase/stockme-client";
export const supabase = new Proxy({} as ReturnType<typeof createStockmeClient>, {
  get(_, prop, receiver) {
    if (!_client) _client = createStockmeClient();
    return Reflect.get(_client, prop, receiver);
  },
});
