import type { SupabaseClient } from "@supabase/supabase-js";

// Uporabnik z app_metadata.vloga = "ogled" (npr. FINESVIEW) lahko samo gleda in prenaša PDF/e-mail.
// Omejitev velja tudi v bazi (RLS: rbo_lahko_ureja()), aplikacija le onemogoči polja in gumbe.
export const NAMIG_SAMO_OGLED = "Samo ogled – nimaš pravic za urejanje";

// Prijavljeni uporabnik: e-mail (glava aplikacije) in ali ima samo ogled
export async function prijavljeni(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getClaims();
  const meta = data?.claims?.app_metadata as { vloga?: string } | undefined;
  return { email: (data?.claims?.email as string | undefined) ?? null, samoOgled: meta?.vloga === "ogled" };
}

export async function jeSamoOgled(supabase: SupabaseClient) {
  return (await prijavljeni(supabase)).samoOgled;
}
