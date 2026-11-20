"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { posljiTestniOpomnik, preveriInPosljiOpomnike, razcleniEmaile } from "@/lib/opomniki";
import { createClient } from "@/lib/supabase/server";
import { NAMIG_SAMO_OGLED, prijavljeni } from "@/lib/vloga";

export type NastavitveStanje = { ok?: boolean; sporocilo?: string; napake?: Record<string, string> };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// prej = ime, kot je shranjeno v bazi (prazno pri novem); drugačno ime = preimenovanje
type ProdajalecVnos = { naziv: string; prej: string; email: string; prejema_opomnike: boolean; aktiven: boolean };

async function izvor() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

export async function shraniNastavitve(_prej: NastavitveStanje, fd: FormData): Promise<NastavitveStanje> {
  const supabase = await createClient();
  const uporabnik = await prijavljeni(supabase);
  if (uporabnik.samoOgled) return { ok: false, sporocilo: NAMIG_SAMO_OGLED };

  const napake: Record<string, string> = {};
  let prodajalci: ProdajalecVnos[] = [];
  let odstranjeni: string[] = [];
  try {
    prodajalci = JSON.parse(String(fd.get("prodajalci") ?? "[]"));
    odstranjeni = JSON.parse(String(fd.get("odstranjeni") ?? "[]"));
  } catch {
    return { ok: false, sporocilo: "Seznam prodajalcev ni berljiv." };
  }

  const imena = new Set<string>();
  prodajalci = prodajalci.map((p, i) => {
    const naziv = p.naziv.trim();
    const email = p.email.trim().toLowerCase();
    if (!naziv) napake[`prodajalec_${i}_naziv`] = "Vpiši ime.";
    else if (imena.has(naziv.toLowerCase())) napake[`prodajalec_${i}_naziv`] = "Ime se ponovi.";
    imena.add(naziv.toLowerCase());
    if (email && !EMAIL.test(email)) napake[`prodajalec_${i}_email`] = "E-mail ni veljaven.";
    if (p.prejema_opomnike && !email) napake[`prodajalec_${i}_email`] = "Za opomnike vpiši e-mail.";
    return { ...p, naziv, email };
  });

  const dni = Number(String(fd.get("opomnik_dni_pred") ?? "").trim());
  if (!Number.isInteger(dni) || dni < 0 || dni > 60) napake.opomnik_dni_pred = "Vpiši celo število dni (0-60).";
  const testniEmail = String(fd.get("opomnik_testni_email") ?? "").trim().toLowerCase();
  if (testniEmail && !EMAIL.test(testniEmail)) napake.opomnik_testni_email = "E-mail ni veljaven.";
  const testniNacin = fd.get("opomnik_testni_nacin") === "da";
  if (testniNacin && !testniEmail) napake.opomnik_testni_email = "V testnem načinu je testni naslov obvezen.";
  const vVednost = razcleniEmaile(String(fd.get("opomnik_v_vednost") ?? ""));
  const napacni = vVednost.filter((e) => !EMAIL.test(e));
  if (napacni.length) napake.opomnik_v_vednost = `Ni veljaven e-mail: ${napacni.join(", ")}`;

  if (Object.keys(napake).length > 0) return { ok: false, sporocilo: "Popravi označena polja.", napake };

  // 1) Odstranjeni: ostanejo v bazi (visible = false), pri opremi ostane ime
  if (odstranjeni.length > 0) {
    const { error } = await supabase.from("rbo_sif_prodajalec").update({ visible: false }).in("naziv", odstranjeni);
    if (error) return { ok: false, sporocilo: `Odstranitev prodajalcev ni uspela: ${error.message}` };
  }

  // 2) Preimenovani: novo ime v šifrantu in pri vsej opremi, kjer je izbran (zapiše se v dnevnik opreme)
  for (const p of prodajalci.filter((x) => x.prej && x.prej !== x.naziv)) {
    const { error } = await supabase.from("rbo_sif_prodajalec").update({ naziv: p.naziv }).eq("naziv", p.prej);
    if (error) {
      return {
        ok: false,
        sporocilo:
          error.code === "23505"
            ? `Ime »${p.naziv}« že obstaja (lahko med odstranjenimi prodajalci). Izberi drugo ime.`
            : `Preimenovanje »${p.prej}« ni uspelo: ${error.message}`,
      };
    }
    const { error: e } = await supabase
      .from("rbo_prodaja")
      .update({ imenovani_prodajalec: p.naziv })
      .eq("imenovani_prodajalec", p.prej);
    if (e) return { ok: false, sporocilo: `Ime je spremenjeno, pri opremi pa ne: ${e.message}` };
  }

  // 3) Podatki in vrstni red vseh prikazanih (novi se dodajo)
  const { error: e1 } = await supabase.from("rbo_sif_prodajalec").upsert(
    prodajalci.map((p, i) => ({
      naziv: p.naziv,
      email: p.email || null,
      prejema_opomnike: p.prejema_opomnike,
      aktiven: p.aktiven,
      visible: true,
      vrstni_red: i + 1,
    })),
    { onConflict: "naziv" },
  );
  if (e1) return { ok: false, sporocilo: `Prodajalci niso shranjeni: ${e1.message}` };

  const spremenjeno = new Date().toISOString();
  const { error: e2 } = await supabase.from("rbo_nastavitve").upsert(
    [
      { kljuc: "opomnik_dni_pred", vrednost: String(dni) },
      { kljuc: "opomnik_testni_email", vrednost: testniEmail || null },
      { kljuc: "opomnik_testni_nacin", vrednost: testniNacin ? "da" : "ne" },
      { kljuc: "opomnik_v_vednost", vrednost: vVednost.join("; ") || null },
    ].map((n) => ({ ...n, spremenjeno, spremenil: uporabnik.email })),
    { onConflict: "kljuc" },
  );
  if (e2) return { ok: false, sporocilo: `Nastavitve opomnikov niso shranjene: ${e2.message}` };

  revalidatePath("/nastavitve");
  revalidatePath("/");
  return { ok: true, sporocilo: "Nastavitve so shranjene." };
}

export async function posljiTestniEmail(): Promise<{ ok: boolean; sporocilo: string }> {
  const supabase = await createClient();
  const uporabnik = await prijavljeni(supabase);
  if (uporabnik.samoOgled) return { ok: false, sporocilo: NAMIG_SAMO_OGLED };
  const napaka = await posljiTestniOpomnik(supabase, { izvor: await izvor(), poslal: uporabnik.email ?? "" });
  revalidatePath("/nastavitve");
  return napaka
    ? { ok: false, sporocilo: `Testni e-mail ni bil poslan: ${napaka}` }
    : { ok: true, sporocilo: "Testni e-mail je predan Power Automate - preveri nabiralnik (lahko traja minuto)." };
}

export async function posljiOpomnikeZdaj(): Promise<{ ok: boolean; sporocilo: string }> {
  const supabase = await createClient();
  const uporabnik = await prijavljeni(supabase);
  if (uporabnik.samoOgled) return { ok: false, sporocilo: NAMIG_SAMO_OGLED };
  const r = await preveriInPosljiOpomnike(supabase, { izvor: await izvor(), poslal: uporabnik.email ?? "" });
  revalidatePath("/nastavitve");
  const povzetek =
    r.poslano === 0 && r.preskoceno === 0 && r.napake.length === 0
      ? "Ni opreme, ki bi ji v nastavljenem obdobju potekla posoja ali rezervacija."
      : `Poslanih opomnikov: ${r.poslano}${r.preskoceno ? `, že poslanih prej: ${r.preskoceno}` : ""}${r.testniNacin ? " (testni način - samo na testni naslov)" : ""}.`;
  return r.napake.length
    ? { ok: false, sporocilo: `${povzetek} Napake: ${r.napake.join("; ").slice(0, 300)}` }
    : { ok: true, sporocilo: povzetek };
}
