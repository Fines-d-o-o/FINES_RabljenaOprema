import { preveriInPosljiOpomnike } from "@/lib/opomniki";
import { adminKlient } from "@/lib/supabase/admin";

// Dnevno preverjanje e-mail opomnikov (Vercel Cron, vercel.json). Vercel pošlje
// "Authorization: Bearer <CRON_SECRET>"; brez pravilnega ključa se nič ne zgodi.
// Pot je izvzeta iz prijave v proxy.ts.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const skrivnost = process.env.CRON_SECRET;
  if (!skrivnost || request.headers.get("authorization") !== `Bearer ${skrivnost}`) {
    return Response.json({ napaka: "Ni dovoljeno." }, { status: 401 });
  }
  const sb = adminKlient();
  if (!sb) return Response.json({ napaka: "Manjka SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });

  const izvor = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const rezultat = await preveriInPosljiOpomnike(sb, { izvor, poslal: "samodejno" });
  console.log("[Opomniki]", JSON.stringify(rezultat));
  return Response.json(rezultat, { status: rezultat.napake.length ? 207 : 200 });
}
