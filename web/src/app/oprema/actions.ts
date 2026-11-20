"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SLIKE_BUCKET } from "@/lib/config";
import {
  NAJVISJA_OCENA,
  OBVEZNO_OB_PRODAJI,
  STATUSI,
  STATUS_POSOJENO,
  STATUS_PRODANO,
  obveznoObPosoji,
  obveznoObProdaji,
} from "@/lib/sifranti";
import { potSlike } from "@/lib/slike";
import { createClient } from "@/lib/supabase/server";
import { obvestiTeamsNovaOprema, obvestiTeamsProdano } from "@/lib/teams";
import { NAMIG_SAMO_OGLED, jeSamoOgled, prijavljeni } from "@/lib/vloga";

// Odgovor za uporabnika "samo ogled" (ustreza obema oblikama odgovorov akcij)
const ZAVRNJENO = { ok: false, sporocilo: NAMIG_SAMO_OGLED, napaka: NAMIG_SAMO_OGLED };
import { TL_SKLOPI, type TehnicniList, type ZapisKartoteke } from "@/lib/types";

export type ShraniStanje = {
  ok?: boolean;
  sporocilo?: string;
  napake?: Record<string, string>;
  idProdaja?: number; // novo ustvarjena prodaja, da naslednje shranjevanje ne ustvari še ene
};

const besedilo = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};

function stevilo(fd: FormData, k: string, napake: Record<string, string>, opis: string, min?: number, max?: number) {
  const v = besedilo(fd, k);
  if (v === null) return null;
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
    napake[k] = min !== undefined && max !== undefined ? `${opis} mora biti med ${min} in ${max}.` : `${opis} ni veljavno število.`;
    return null;
  }
  return n;
}

function datum(fd: FormData, k: string, napake: Record<string, string>, opis: string) {
  const v = besedilo(fd, k);
  if (v === null) return null;
  if (!DATUM.test(v)) {
    napake[k] = `${opis} ni veljaven datum.`;
    return null;
  }
  return v;
}

export async function shraniOpremo(_prej: ShraniStanje, fd: FormData): Promise<ShraniStanje> {
  const napake: Record<string, string> = {};
  const idOprema = besedilo(fd, "id_oprema");
  const idProdaja = besedilo(fd, "id_prodaja");

  const oprema = {
    datum_prejema: besedilo(fd, "datum_prejema"),
    kolicina: stevilo(fd, "kolicina", napake, "Količina", 0, 100000) ?? 1,
    em: besedilo(fd, "em"),
    koda: besedilo(fd, "koda"),
    oprema_naziv: besedilo(fd, "oprema_naziv"),
    serijska_stevilka: besedilo(fd, "serijska_stevilka"),
    leto_proizvodnje: stevilo(fd, "leto_proizvodnje", napake, "Leto proizvodnje", 1950, 2100),
    skupina_opreme: besedilo(fd, "skupina_opreme"),
    lastnistvo: besedilo(fd, "lastnistvo"),
    skladisce: besedilo(fd, "skladisce"),
    komentar: besedilo(fd, "komentar"),
    ocena: stevilo(fd, "ocena", napake, "Ocena", 1, NAJVISJA_OCENA),
  };
  if (!oprema.oprema_naziv) napake.oprema_naziv = "Naziv opreme je obvezen.";

  const prodaja = {
    status_prodaje: besedilo(fd, "status_prodaje"),
    imenovani_prodajalec: besedilo(fd, "imenovani_prodajalec"),
    garancijski_rok_meseci: stevilo(fd, "garancijski_rok_meseci", napake, "Garancija", 0, 120),
    cena_nove: stevilo(fd, "cena_nove", napake, "Cena nove", 0, 10_000_000),
    rabat_procent: stevilo(fd, "rabat_procent", napake, "Rabat", 0, 100),
    prodajna_cena: stevilo(fd, "prodajna_cena", napake, "Prodajna cena", 0, 10_000_000),
    datum_prodaje: besedilo(fd, "datum_prodaje"),
    kupec: besedilo(fd, "kupec"),
    komentar_ob_prodaji: besedilo(fd, "komentar_ob_prodaji"),
  };
  if (fd.get("garancijski_rok_meseci") === "") napake.garancijski_rok_meseci = "Izberi garancijski rok (6, 12 ali 24 mesecev).";
  if (prodaja.status_prodaje && !(STATUSI as readonly string[]).includes(prodaja.status_prodaje)) {
    napake.status_prodaje = "Neveljaven status prodaje.";
  }

  // Posoja: velja samo pri statusu POSOJENO, sicer se počisti (zgodovina ostane v dnevniku)
  const posojeno = prodaja.status_prodaje === STATUS_POSOJENO;
  const doPreklica = posojeno && fd.get("posojeno_do_preklica") === "1";
  const posoja = {
    posojeno_od: posojeno ? datum(fd, "posojeno_od", napake, "Posojeno od") : null,
    posojeno_do: posojeno && !doPreklica ? datum(fd, "posojeno_do", napake, "Posojeno do") : null,
    posojeno_do_preklica: doPreklica,
    posojeno_podjetje: posojeno ? besedilo(fd, "posojeno_podjetje") : null,
    posojeno_kontakt: posojeno ? besedilo(fd, "posojeno_kontakt") : null,
  };
  if (posoja.posojeno_od && posoja.posojeno_do && posoja.posojeno_do < posoja.posojeno_od) {
    napake.posojeno_do = "Datum vrnitve ne sme biti pred začetkom posoje.";
  }

  // Rezervacija: ob prodaji ali posoji se odstrani
  const rezervirano =
    fd.get("rezervirano") === "1" && prodaja.status_prodaje !== STATUS_PRODANO && prodaja.status_prodaje !== STATUS_POSOJENO;
  const rezervacija = {
    rezervirano,
    rezervirano_do: rezervirano ? datum(fd, "rezervirano_do", napake, "Rezervirano do") : null,
    rezervirano_podjetje: rezervirano ? besedilo(fd, "rezervirano_podjetje") : null,
    rezervirano_kontakt: rezervirano ? besedilo(fd, "rezervirano_kontakt") : null,
  };
  if (rezervirano && !rezervacija.rezervirano_do && !napake.rezervirano_do) {
    napake.rezervirano_do = "Vpiši, do kdaj je oprema rezervirana.";
  }
  if (rezervirano && !rezervacija.rezervirano_podjetje) napake.rezervirano_podjetje = "Vpiši, kdo je rezerviral opremo.";

  const supabase = await createClient();
  const uporabnik = await prijavljeni(supabase);
  if (uporabnik.samoOgled) return ZAVRNJENO;

  // Ob prodaji sta obvezna kupec in datum prodaje, ob posoji podatki posoje
  // (primerja se z zadnjim shranjenim stanjem v bazi)
  let prej: {
    status_prodaje: string | null;
    kupec: string | null;
    datum_prodaje: string | null;
    posojeno_do: string | null;
    posojeno_do_preklica: boolean | null;
  } | null = null;
  if (idProdaja) {
    const { data } = await supabase
      .from("rbo_prodaja")
      .select("status_prodaje, kupec, datum_prodaje, posojeno_do, posojeno_do_preklica")
      .eq("id_prodaja", Number(idProdaja))
      .maybeSingle();
    prej = data;
  }
  for (const { kljuc, oznaka } of OBVEZNO_OB_PRODAJI) {
    if (!prodaja[kljuc] && obveznoObProdaji(kljuc, prodaja.status_prodaje, prej)) {
      napake[kljuc] = `${oznaka} je obvezen podatek, ko je oprema prodana.`;
    }
  }
  if (obveznoObPosoji(prodaja.status_prodaje, prej)) {
    if (!posoja.posojeno_od && !napake.posojeno_od) napake.posojeno_od = "Vpiši, od kdaj je oprema posojena.";
    if (!posoja.posojeno_do && !doPreklica && !napake.posojeno_do) {
      napake.posojeno_do = "Vpiši datum vrnitve ali izberi »Do nadaljnjega«.";
    }
    if (!posoja.posojeno_podjetje) napake.posojeno_podjetje = "Vpiši, komu je oprema posojena.";
  }

  if (Object.keys(napake).length > 0) {
    return { ok: false, sporocilo: "Preveri označena polja.", napake };
  }

  // 1) Oprema
  let id: number;
  if (idOprema) {
    id = Number(idOprema);
    const { error } = await supabase.from("rbo_oprema").update(oprema).eq("id", id);
    if (error) return { ok: false, sporocilo: `Shranjevanje opreme ni uspelo: ${error.message}` };
  } else {
    const { data, error } = await supabase.from("rbo_oprema").insert(oprema).select("id").single();
    if (error) {
      const namig = error.code === "23505" ? " (števec ID ni nastavljen – poženi setval za rbo_oprema)" : "";
      return { ok: false, sporocilo: `Dodajanje opreme ni uspelo: ${error.message}${namig}` };
    }
    id = data.id;
  }

  // 2) Prodaja: posodobi obstoječo ali ustvari novo in jo poveži z opremo
  const imaProdajo = Object.values(prodaja).some((v) => v !== null) || rezervirano;
  const vrstica = { ...prodaja, ...posoja, ...rezervacija };
  let novaProdaja: number | undefined;
  if (idProdaja) {
    const { error } = await supabase.from("rbo_prodaja").update(vrstica).eq("id_prodaja", Number(idProdaja));
    if (error) return { ok: false, sporocilo: `Oprema je shranjena, prodaja pa ne: ${error.message}` };
  } else if (imaProdajo) {
    const { data, error } = await supabase.from("rbo_prodaja").insert(vrstica).select("id_prodaja").single();
    if (error) return { ok: false, sporocilo: `Oprema je shranjena, prodaja pa ne: ${error.message}` };
    const povezava = await supabase
      .from("ln_rbo_oprema_prodaja")
      .insert({ id_prodaja: data.id_prodaja, id_oprema: id });
    if (povezava.error) return { ok: false, sporocilo: `Povezava s prodajo ni uspela: ${povezava.error.message}` };
    novaProdaja = data.id_prodaja;
  }

  revalidatePath("/");
  revalidatePath(`/oprema/${id}`);

  const h = await headers();
  const izvor = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;

  // 3) Obvestilo v Teams ob prodaji: samo ob prehodu v PRODANO (ponovno shranjevanje ga ne pošlje znova)
  let teamsProdanoNapaka: string | null = null;
  if (prodaja.status_prodaje === STATUS_PRODANO && prej?.status_prodaje !== STATUS_PRODANO) {
    teamsProdanoNapaka = await obvestiTeamsProdano({
      id,
      naziv: oprema.oprema_naziv!,
      ident: oprema.koda,
      serijska: oprema.serijska_stevilka,
      skupina: oprema.skupina_opreme,
      skladisce: oprema.skladisce,
      kupec: prodaja.kupec,
      datumProdaje: prodaja.datum_prodaje,
      prodajnaCena: prodaja.prodajna_cena,
      prodajalec: prodaja.imenovani_prodajalec,
      garancijaMeseci: prodaja.garancijski_rok_meseci,
      komentar: prodaja.komentar_ob_prodaji,
      poslal: uporabnik.email,
      povezava: `${izvor}/oprema/${id}`,
    });
  }

  if (idOprema) {
    const sporocilo = teamsProdanoNapaka
      ? `Spremembe so shranjene, obvestilo o prodaji v Teams pa ni bilo poslano (${teamsProdanoNapaka.slice(0, 80)}). Ekipo obvesti ročno.`
      : "Spremembe so shranjene.";
    return { ok: true, sporocilo, idProdaja: novaProdaja };
  }

  // --- Nova oprema ---
  const opozorila = new URLSearchParams({ novo: "1" });
  if (teamsProdanoNapaka) opozorila.set("teams", teamsProdanoNapaka.slice(0, 120));

  // 4) Kartoteka: zapisi, dodani na obrazcu nove opreme (pri urejanju se shranjujejo sproti)
  const zapisi = preberiZapiseKartoteke(fd).map((z) => ({ ...z, id_oprema: id }));
  if (zapisi.length > 0) {
    const { error } = await supabase.from("rbo_kartoteka").insert(zapisi);
    if (error) opozorila.set("kartoteka", "napaka");
  }

  // 5) Obvestilo v Teams o novi opremi (napaka ne prepreči shranjevanja, samo opozori)
  const teamsNapaka = await obvestiTeamsNovaOprema({
    id,
    datumPrejema: oprema.datum_prejema,
    ident: oprema.koda,
    naziv: oprema.oprema_naziv!,
    serijska: oprema.serijska_stevilka,
    ocena: oprema.ocena,
    komentar: oprema.komentar,
    povezava: `${izvor}/oprema/${id}`,
  });
  if (teamsNapaka) opozorila.set("teams", teamsNapaka.slice(0, 120));

  redirect(`/oprema/${id}?${opozorila}`);
}

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

function preberiZapiseKartoteke(fd: FormData): ZapisKartoteke[] {
  try {
    const surovo = JSON.parse(String(fd.get("kartoteka") ?? "[]")) as ZapisKartoteke[];
    return surovo
      .filter((z) => DATUM.test(z.datum_vnosa) && z.besedilo_vnosa?.trim())
      .map((z) => ({
        datum_vnosa: z.datum_vnosa,
        besedilo_vnosa: z.besedilo_vnosa.trim(),
        strosek: veljavenStrosek(z.strosek) ? z.strosek : null,
      }));
  } catch {
    return [];
  }
}

// Zapis v kartoteko obstoječe opreme (gumb "Dodaj zapis" na urejanju)
const veljavenStrosek = (s: unknown): s is number => typeof s === "number" && Number.isFinite(s) && s >= 0;

export async function dodajZapisKartoteke(
  idOprema: number,
  datum: string,
  besedilo: string,
  strosek: number | null,
): Promise<{ zapis?: ZapisKartoteke; napaka?: string }> {
  if (!DATUM.test(datum)) return { napaka: "Vnesi veljaven datum." };
  if (!besedilo.trim()) return { napaka: "Zapis ne sme biti prazen." };
  if (strosek !== null && !veljavenStrosek(strosek)) return { napaka: "Strošek mora biti pozitivno število." };

  const supabase = await createClient();
  if (await jeSamoOgled(supabase)) return ZAVRNJENO;
  const { data, error } = await supabase
    .from("rbo_kartoteka")
    .insert({ id_oprema: idOprema, datum_vnosa: datum, besedilo_vnosa: besedilo.trim(), strosek })
    .select("id, datum_vnosa, besedilo_vnosa, strosek")
    .single();
  if (error) return { napaka: `Zapis ni shranjen: ${error.message}` };
  return { zapis: data };
}

// Tehnični list: en zapis na opremo (upsert po id_oprema)
export async function shraniTehnicniList(_prej: ShraniStanje, fd: FormData): Promise<ShraniStanje> {
  const idOprema = Number(fd.get("id_oprema"));
  if (!Number.isInteger(idOprema)) return { ok: false, sporocilo: "Manjka ID opreme." };

  const napake: Record<string, string> = {};
  const tl = Object.fromEntries(
    [...TL_SKLOPI.flatMap((s) => s.polja.map((p) => p.kljuc)), "opis" as const].map((k) => [k, besedilo(fd, k)]),
  ) as Record<keyof TehnicniList, string | null>;
  const leto = stevilo(fd, "leto_izdelave", napake, "Leto izdelave", 1950, 2100);
  if (Object.keys(napake).length > 0) return { ok: false, sporocilo: "Preveri označena polja.", napake };

  const supabase = await createClient();
  if (await jeSamoOgled(supabase)) return ZAVRNJENO;
  const { error } = await supabase
    .from("rbo_tehnicni_list")
    .upsert({ ...tl, leto_izdelave: leto, id_oprema: idOprema, visible: true }, { onConflict: "id_oprema" });
  if (error) return { ok: false, sporocilo: `Tehnični list ni shranjen: ${error.message}` };

  revalidatePath("/");
  revalidatePath(`/oprema/${idOprema}/tehnicni_list`);
  return { ok: true, sporocilo: "Tehnični list je shranjen." };
}

// Izbris = skrij (visible = false) opremo in njene prodaje; vrstice ostanejo v bazi.
export async function izbrisiOpremo(idOprema: number): Promise<{ napaka?: string }> {
  const supabase = await createClient();
  if (await jeSamoOgled(supabase)) return ZAVRNJENO;

  const { error } = await supabase.from("rbo_oprema").update({ visible: false }).eq("id", idOprema);
  if (error) return { napaka: `Brisanje ni uspelo: ${error.message}` };

  const povezave = await supabase.from("ln_rbo_oprema_prodaja").select("id_prodaja").eq("id_oprema", idOprema);
  const idProdaj = (povezave.data ?? []).map((p) => p.id_prodaja);
  if (idProdaj.length > 0) {
    const prodaja = await supabase.from("rbo_prodaja").update({ visible: false }).in("id_prodaja", idProdaj);
    if (prodaja.error) return { napaka: `Oprema je izbrisana, prodaja pa ne: ${prodaja.error.message}` };
  }

  revalidatePath("/");
  redirect("/");
}

// Izbris posameznega zapisa kartoteke (visible = false)
export async function izbrisiZapisKartoteke(id: number): Promise<{ napaka?: string }> {
  const supabase = await createClient();
  if (await jeSamoOgled(supabase)) return ZAVRNJENO;
  const { error } = await supabase.from("rbo_kartoteka").update({ visible: false }).eq("id", id);
  return error ? { napaka: `Zapis ni izbrisan: ${error.message}` } : {};
}

// Izbris celotne kartoteke opreme (visible = false za vse zapise)
export async function izbrisiKartoteko(idOprema: number): Promise<{ napaka?: string }> {
  const supabase = await createClient();
  if (await jeSamoOgled(supabase)) return ZAVRNJENO;
  const { error } = await supabase.from("rbo_kartoteka").update({ visible: false }).eq("id_oprema", idOprema);
  if (error) return { napaka: `Kartoteka ni izbrisana: ${error.message}` };
  revalidatePath(`/oprema/${idOprema}`);
  return {};
}

// Izbris tehničnega lista (visible = false) in slike krmiljenja (datoteka + zapis v rbo_slike)
export async function izbrisiTehnicniList(idOprema: number): Promise<{ napaka?: string }> {
  const supabase = await createClient();
  if (await jeSamoOgled(supabase)) return ZAVRNJENO;
  const { error } = await supabase.from("rbo_tehnicni_list").update({ visible: false }).eq("id_oprema", idOprema);
  if (error) return { napaka: `Tehnični list ni izbrisan: ${error.message}` };

  const { data: slika } = await supabase
    .from("rbo_slike")
    .select("ime_slike")
    .eq("id_oprema", idOprema)
    .eq("vrsta_slike", "Krmiljenje")
    .maybeSingle();
  if (slika) {
    const zapis = await supabase.from("rbo_slike").delete().eq("id_oprema", idOprema).eq("vrsta_slike", "Krmiljenje");
    if (zapis.error) return { napaka: `Tehnični list je izbrisan, slika krmiljenja pa ne: ${zapis.error.message}` };
    await supabase.storage.from(SLIKE_BUCKET).remove([potSlike(slika.ime_slike)]);
  }

  revalidatePath("/");
  revalidatePath(`/oprema/${idOprema}/tehnicni_list`);
  return {};
}
