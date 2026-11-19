import type { SupabaseClient } from "@supabase/supabase-js";

export const STATUSI = [
  "0. NI ZA PRODAJO",
  "1. NI UREJENO ZA PRODAJO",
  "2. NEPRODANO",
  "3. PRODANO",
  "4. POSOJENO",
] as const;

export const STATUS_PRODANO = "3. PRODANO";

// Ob prodaji sta obvezna kupec in datum prodaje (preprečuje dvojno prodajo iste opreme).
// Izjema: oprema, ki je bila prodana že prej in podatka nima - stare zapise se lahko ureja brez iskanja kupca za nazaj.
export const OBVEZNO_OB_PRODAJI = [
  { kljuc: "kupec", oznaka: "Kupec" },
  { kljuc: "datum_prodaje", oznaka: "Datum prodaje" },
] as const;

export function obveznoObProdaji(
  kljuc: (typeof OBVEZNO_OB_PRODAJI)[number]["kljuc"],
  novStatus: string | null,
  prej: { status_prodaje?: string | null; kupec?: string | null; datum_prodaje?: string | null } | null | undefined,
) {
  if (novStatus !== STATUS_PRODANO) return false;
  return !(prej?.status_prodaje === STATUS_PRODANO && !prej?.[kljuc]);
}

export const ENOTE_MERE = ["kos", "kpl"];

// Ocena stanja 1–5 in njen opis (prikaz ob oceni, filter, PDF)
export const OCENE: Record<number, string> = {
  1: "Uničeno, neuporabno, neurejeno",
  2: "Zelo rabljeno",
  3: "Vidno rabljeno",
  4: "Očiščeno, skoraj novo, malo rabljeno",
  5: "Kot novo",
};
export const NAJVISJA_OCENA = 5;
export const opisOcene = (ocena: number | null) => (ocena ? (OCENE[ocena] ?? "") : "");

// Garancijski rok v mesecih (0 = brez garancije)
export const GARANCIJE = [6, 12, 24] as const;

export type Sifranti = {
  skupina: string[];
  lastnistvo: string[];
  skladisce: string[];
  prodajalec: string[];
};

const TABELE: Record<keyof Sifranti, { tabela: string; stolpec: string; pogled: string }> = {
  skupina: { tabela: "rbo_sif_skupina_opreme", stolpec: "skupina_opreme", pogled: "rbo_oprema" },
  lastnistvo: { tabela: "rbo_sif_lastnistvo", stolpec: "lastnistvo", pogled: "rbo_oprema" },
  skladisce: { tabela: "rbo_sif_skladisce", stolpec: "skladisce", pogled: "rbo_oprema" },
  prodajalec: { tabela: "rbo_sif_prodajalec", stolpec: "imenovani_prodajalec", pogled: "rbo_prodaja" },
};

// Vrednosti iz šifrantov + vrednosti, ki so že v podatkih (da se obstoječa vrednost vedno prikaže).
// Če šifrant še ne obstaja, ostanejo samo vrednosti iz podatkov.
export async function naloziSifrante(supabase: SupabaseClient): Promise<Sifranti> {
  const vnosi = await Promise.all(
    (Object.keys(TABELE) as (keyof Sifranti)[]).map(async (kljuc) => {
      const { tabela, stolpec, pogled } = TABELE[kljuc];
      const [sif, podatki] = await Promise.all([
        supabase.from(tabela).select("naziv").order("vrstni_red").order("naziv"),
        supabase.from(pogled).select(stolpec).not(stolpec, "is", null),
      ]);
      const izSifranta = (sif.data ?? []).map((r: { naziv: string }) => r.naziv);
      const izPodatkov = ((podatki.data ?? []) as unknown as Record<string, string>[])
        .map((r) => r[stolpec])
        .filter((v) => v && !izSifranta.includes(v));
      const dodatni = [...new Set(izPodatkov)].sort((a, b) => a.localeCompare(b, "sl"));
      return [kljuc, [...izSifranta, ...dodatni]] as const;
    }),
  );
  return Object.fromEntries(vnosi) as Sifranti;
}
