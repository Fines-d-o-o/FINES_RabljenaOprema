import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/config";

// Supabase brez prijavljenega uporabnika (samodejno dnevno preverjanje opomnikov, Vercel Cron).
// SUPABASE_SERVICE_ROLE_KEY obide RLS: samo strežnik (.env.local, Vercel), nikoli NEXT_PUBLIC_.
export function adminKlient(): SupabaseClient | null {
  const kljuc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return kljuc ? createClient(SUPABASE_URL, kljuc, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}
