import { AppShell } from "@/components/AppShell";
import { ErrorText } from "@/components/ui";
import { naloziNastavitve, naloziProdajalce } from "@/lib/opomniki";
import { createClient } from "@/lib/supabase/server";
import { jeSamoOgled } from "@/lib/vloga";
import { NastavitveObrazec, type PoslanOpomnik } from "./NastavitveObrazec";

export default async function NastavitvePage() {
  const supabase = await createClient();
  const [samoOgled, prodajalci, nastavitve, opomniki] = await Promise.all([
    jeSamoOgled(supabase),
    naloziProdajalce(supabase),
    naloziNastavitve(supabase),
    supabase
      .from("rbo_opomniki")
      .select("id, vrsta, id_oprema, rok, prejemniki, testni, poslano, poslal, napaka")
      .order("poslano", { ascending: false })
      .limit(20),
  ]);

  // nazivi opreme za seznam poslanih opomnikov
  const idji = [...new Set((opomniki.data ?? []).map((o) => o.id_oprema).filter((id): id is number => id != null))];
  const { data: oprema } = idji.length
    ? await supabase.from("rbo_oprema").select("id, oprema_naziv").in("id", idji)
    : { data: [] };
  const nazivi = new Map((oprema ?? []).map((o: { id: number; oprema_naziv: string }) => [o.id, o.oprema_naziv]));
  const poslani: PoslanOpomnik[] = (opomniki.data ?? []).map((o) => ({
    ...o,
    naziv: o.id_oprema != null ? (nazivi.get(o.id_oprema) ?? null) : null,
  }));

  return (
    <AppShell
      title="Nastavitve"
      subtitle="Prodajalci, e-maili in opomniki o poteku posoje in rezervacije"
      back="/"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        {opomniki.error && (
          <ErrorText>
            Tabele nastavitev ni v bazi ({opomniki.error.message}). Poženi migracijo
            20261121000000_nastavitve_opomniki.sql v Supabase SQL Editorju.
          </ErrorText>
        )}
        <NastavitveObrazec
          prodajalci={prodajalci}
          nastavitve={nastavitve}
          poslani={poslani}
          samoOgled={samoOgled}
          povezava={{
            webhook: !!process.env.EMAIL_WEBHOOK_OPOMNIKI,
            cron: !!process.env.CRON_SECRET && !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          }}
        />
      </div>
    </AppShell>
  );
}
