import { createClient } from "@supabase/supabase-js";

/**
 * Supabase project used for permanent storage of engineers, claims,
 * payout logs and engineer documents.
 */
export const SUPABASE_URL =
  import.meta.env['VITE_SUPABASE_URL'] ?? "https://ebgtoagautczzfyurvvp.supabase.co";

export const SUPABASE_ANON_KEY =
  import.meta.env['VITE_SUPABASE_ANON_KEY'] ??
  "sb_publishable_OC0BcEljXaKwbuTtLDcaXA_06VmVpRA";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Storage bucket holding engineer documents (licence, photo ID, resume). */
export const DOCUMENTS_BUCKET = "engineer-documents";
