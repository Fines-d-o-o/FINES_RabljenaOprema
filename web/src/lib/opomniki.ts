import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STATUS_POSOJENO } from "@/lib/sifranti";
import type { OpremaVrstica } from "@/lib/types";

// E-mail opomniki o poteku posoje in rezervacije.
// Aplikacija sestavi e-mail (zadeva + HTML "kartica"), Power Automate flow ga samo pošlje
// (sprožilec "When a Teams webhook request is received" -> "Send an email (V2)").
// URL flowa je skrivnost: samo EMAIL_WEBHOOK_OPOMNIKI na strežniku (Vercel), nikoli NEXT_PUBLIC_.

export type VrstaOpomnika = "posoja" | "rezervacija";

export type Prodajalec = {
  naziv: string;
  email: string | null;
  prejema_opomnike: boolean;
  aktiven: boolean;
  vrstni_red: number;
};

export type NastavitveOpomnikov = {
  dniPred: number;
  testniEmail: string;
  testniNacin: boolean; // DA = vsi opomniki gredo samo na testni naslov
  vVednost: string[]; // CC na vsakem opomniku
};

export const PRIVZETE_NASTAVITVE: NastavitveOpomnikov = {
  dniPred: 3,
  testniEmail: "",
  testniNacin: true,
  vVednost: [],
};

/** Seznam e-mailov iz besedila (ločeni s ; , presledkom ali novo vrstico), male črke, brez ponovitev. */
export const razcleniEmaile = (s: string | null | undefined) => [
  ...new Set(
    (s ?? "")
      .split(/[;,\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  ),
];

export async function naloziNastavitve(sb: SupabaseClient): Promise<NastavitveOpomnikov> {
  const { data } = await sb.from("rbo_nastavitve").select("kljuc, vrednost");
  const m = new Map((data ?? []).map((r: { kljuc: string; vrednost: string | null }) => [r.kljuc, r.vrednost]));
  const dni = Number(m.get("opomnik_dni_pred"));
  return {
    dniPred: Number.isInteger(dni) && dni >= 0 ? dni : PRIVZETE_NASTAVITVE.dniPred,
    testniEmail: m.get("opomnik_testni_email") ?? "",
    testniNacin: m.has("opomnik_testni_nacin") ? m.get("opomnik_testni_nacin") === "da" : PRIVZETE_NASTAVITVE.testniNacin,
    vVednost: razcleniEmaile(m.get("opomnik_v_vednost")),
  };
}

export async function naloziProdajalce(sb: SupabaseClient): Promise<Prodajalec[]> {
  const { data } = await sb
    .from("rbo_sif_prodajalec")
    .select("naziv, email, prejema_opomnike, aktiven, vrstni_red")
    .eq("visible", true)
    .order("vrstni_red")
    .order("naziv");
  return (data ?? []) as Prodajalec[];
}

// Danes v Ljubljani (strežnik na Vercelu teče v UTC)
export const danesLj = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Ljubljana" });
const datumSl = (d: string | null | undefined) => (d ? d.slice(0, 10).split("-").reverse().join(".") : "");
const dniMed = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const dniBesedilo = (n: number) =>
  n < 0 ? `poteklo pred ${-n} ${-n === 1 ? "dnem" : -n === 2 ? "dnevoma" : "dnevi"}` : n === 0 ? "danes" : n === 1 ? "jutri" : `čez ${n} ${n === 2 ? "dneva" : "dni"}`;

/** Prejemniki: imenovani prodajalec opreme + vsi, ki prejemajo vse opomnike (aktivni, z e-mailom). */
export function prejemnikiZa(prodajalci: Prodajalec[], imenovani: string | null): string[] {
  const izbrani = prodajalci.filter((p) => p.aktiven && p.email && (p.prejema_opomnike || p.naziv === imenovani));
  return [...new Set(izbrani.map((p) => p.email!.trim().toLowerCase()))];
}

// ---------------------------------------------------------------------------------------------
// E-mail (HTML za Outlook: tabele in vrstični slogi, brez CSS razredov in zunanjih slik)

const B = {
  oranzna: "#ca5010",
  oranznaSvetla: "#fdf3ed",
  temna: "#1c1c1f",
  siva: "#6b6b72",
  obroba: "#dcdcdf",
  ozadje: "#f7f7f8",
  rumena: "#fffbeb",
  rumenaRob: "#f59e0b",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type PodatkiOpomnika = {
  vrsta: VrstaOpomnika;
  oprema: Pick<
    OpremaVrstica,
    | "id_oprema"
    | "oprema_naziv"
    | "koda"
    | "serijska_stevilka"
    | "skupina_opreme"
    | "skladisce"
    | "imenovani_prodajalec"
    | "posojeno_od"
    | "posojeno_podjetje"
    | "posojeno_kontakt"
    | "rezervirano_podjetje"
    | "rezervirano_kontakt"
  >;
  rok: string; // LLLL-MM-DD
  danes: string;
  povezava: string;
};

export function zadevaOpomnika(p: PodatkiOpomnika, test = false) {
  const kaj = p.vrsta === "posoja" ? "posoja" : "rezervacija";
  return `${test ? "[TEST] " : ""}Rabljeni opremi se izteka ${kaj}: ${p.oprema.oprema_naziv} (rok ${datumSl(p.rok)})`;
}

export function htmlOpomnika(p: PodatkiOpomnika, test?: { prejemniki: string[]; vVednost: string[] }) {
  const o = p.oprema;
  const posoja = p.vrsta === "posoja";
  const n = dniMed(p.danes, p.rok);
  const naslov = posoja ? "Rabljeni opremi se izteka posoja" : "Rabljeni opremi se izteka rezervacija";
  const poziv = posoja
    ? "Preverite z izposojevalcem, ali bo oprema vrnjena pravočasno. Če se posoja podaljša, popravite rok vrnitve v aplikaciji; ob vrnitvi zaključite posojo."
    : "Dogovorite se s kupcem: oprema se proda, rezervacija se podaljša ali pa se rezervacija odstrani.";
  const podatki: [string, string | null | undefined][] = [
    [posoja ? "Posojeno" : "Rezervirano za", posoja ? o.posojeno_podjetje : o.rezervirano_podjetje],
    ["Kontakt", posoja ? o.posojeno_kontakt : o.rezervirano_kontakt],
    ...(posoja ? ([["Posojeno od", datumSl(o.posojeno_od)]] as [string, string][]) : []),
    [posoja ? "Rok vrnitve" : "Rezervirano do", datumSl(p.rok)],
    ["Ident", o.koda],
    ["Serijska št.", o.serijska_stevilka],
    ["Skupina", o.skupina_opreme],
    ["Skladišče", o.skladisce],
    ["Prodajalec", o.imenovani_prodajalec],
    ["ID opreme", String(o.id_oprema)],
  ];
  const vrstice = podatki
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:${B.siva};font-size:14px;white-space:nowrap;vertical-align:top;">${esc(k)}</td>` +
        `<td style="padding:6px 0;color:${B.temna};font-size:15px;font-weight:bold;vertical-align:top;">${esc(v!)}</td></tr>`,
    )
    .join("");

  const testniPas = test
    ? `<tr><td style="padding:12px 24px;background:${B.rumena};border-bottom:2px solid ${B.rumenaRob};font-size:14px;color:${B.temna};">
         <b>TESTNI E-MAIL</b> - poslan samo na testni naslov.<br>
         Prejemniki v rednem delovanju (za to opremo): ${test.prejemniki.length ? esc(test.prejemniki.join(", ")) : "<i>ni nastavljenih (dodaj e-maile prodajalcem)</i>"}<br>
         V vednost: ${test.vVednost.length ? esc(test.vVednost.join(", ")) : "<i>nihče</i>"}
       </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="sl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${B.ozadje};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${B.ozadje};padding:24px 0;font-family:Calibri,Segoe UI,Arial,sans-serif;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${B.obroba};border-radius:12px;overflow:hidden;">
  <tr><td style="background:${B.oranzna};padding:14px 24px;color:#ffffff;font-size:13px;font-weight:bold;letter-spacing:1px;">FINES · RABLJENA OPREMA</td></tr>
  ${testniPas}
  <tr><td style="padding:24px 24px 4px 24px;">
    <div style="font-size:22px;font-weight:bold;color:${B.temna};">&#9200; ${naslov}</div>
    <div style="font-size:15px;color:${B.siva};padding-top:6px;">
      ${posoja ? "Rok vrnitve" : "Rezervacija velja do"}: <b style="color:${B.oranzna};">${datumSl(p.rok)}</b> (${dniBesedilo(n)})
    </div>
  </td></tr>
  <tr><td style="padding:16px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${B.oranznaSvetla};border-left:4px solid ${B.oranzna};border-radius:8px;">
      <tr><td style="padding:16px 18px;">
        <div style="font-size:18px;font-weight:bold;color:${B.temna};padding-bottom:8px;">${esc(o.oprema_naziv)}</div>
        <table role="presentation" cellpadding="0" cellspacing="0">${vrstice}</table>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 24px 8px 24px;font-size:16px;color:${B.temna};line-height:1.45;">${poziv}</td></tr>
  <tr><td style="padding:16px 24px 24px 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="background:${B.oranzna};border-radius:8px;">
        <a href="${esc(p.povezava)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">Odpri opremo v aplikaciji</a>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:12px 24px;border-top:1px solid ${B.obroba};font-size:12px;color:${B.siva};">
    Samodejno obvestilo aplikacije Rabljena oprema, ${datumSl(p.danes)}. Prejemnike opomnikov ureja skrbnik v Nastavitvah (Prodajalci in e-maili).
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

// ---------------------------------------------------------------------------------------------
// Pošiljanje prek Power Automate

/** Vrne null ob uspehu, sicer besedilo napake. */
export async function posljiEmail(e: {
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  vrsta: string;
  test: boolean;
}) {
  const url = process.env.EMAIL_WEBHOOK_OPOMNIKI;
  if (!url) return "Povezava s Power Automate ni nastavljena (EMAIL_WEBHOOK_OPOMNIKI).";
  if (e.to.length === 0) return "Ni prejemnikov.";
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: e.to.join(";"),
        cc: e.cc.filter((x) => !e.to.includes(x)).join(";"),
        subject: e.subject,
        html: e.html,
        vrsta: e.vrsta,
        test: e.test,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (r.ok) return null;
    const odgovor = await r.text().catch(() => "");
    const koda = odgovor.match(/"code"\s*:\s*"([^"]+)"/)?.[1];
    console.error(`[E-mail opomnik] HTTP ${r.status}: ${odgovor.slice(0, 500)}`);
    return `HTTP ${r.status}${koda ? ` ${koda}` : ""}`;
  } catch (err) {
    console.error("[E-mail opomnik]", err);
    return err instanceof Error ? err.message : String(err);
  }
}

// ---------------------------------------------------------------------------------------------
// Dnevno preverjanje (Vercel Cron ali gumb v Nastavitvah)

type Kandidat = { vrsta: VrstaOpomnika; rok: string; o: OpremaVrstica };

export type RezultatPreverjanja = { poslano: number; preskoceno: number; napake: string[]; testniNacin: boolean };

export async function preveriInPosljiOpomnike(
  sb: SupabaseClient,
  { izvor, poslal }: { izvor: string; poslal: string },
): Promise<RezultatPreverjanja> {
  const danes = danesLj();
  const [nast, prodajalci] = await Promise.all([naloziNastavitve(sb), naloziProdajalce(sb)]);
  const meja = new Date(Date.parse(danes) + nast.dniPred * 86_400_000).toISOString().slice(0, 10);
  const rez: RezultatPreverjanja = { poslano: 0, preskoceno: 0, napake: [], testniNacin: nast.testniNacin };

  if (nast.testniNacin && !nast.testniEmail) {
    rez.napake.push("Testni način je vklopljen, testni e-mail naslov pa ni vpisan.");
    return rez;
  }

  const [posoje, rezervacije] = await Promise.all([
    sb
      .from("v_rbo_oprema_prodaja")
      .select("*")
      .eq("status_prodaje", STATUS_POSOJENO)
      .gte("posojeno_do", danes)
      .lte("posojeno_do", meja),
    sb.from("v_rbo_oprema_prodaja").select("*").eq("rezervirano", true).gte("rezervirano_do", danes).lte("rezervirano_do", meja),
  ]);
  if (posoje.error || rezervacije.error) {
    rez.napake.push(`Branje opreme ni uspelo: ${(posoje.error ?? rezervacije.error)!.message}`);
    return rez;
  }
  const kandidati: Kandidat[] = [
    ...((posoje.data ?? []) as OpremaVrstica[]).map((o) => ({ vrsta: "posoja" as const, rok: o.posojeno_do!, o })),
    ...((rezervacije.data ?? []) as OpremaVrstica[]).map((o) => ({ vrsta: "rezervacija" as const, rok: o.rezervirano_do!, o })),
  ];
  if (kandidati.length === 0) return rez;

  // Že poslani (isti rok, isti način) se ne pošljejo znova
  const { data: poslani } = await sb
    .from("rbo_opomniki")
    .select("id_prodaja, vrsta, rok")
    .is("napaka", null)
    .eq("testni", nast.testniNacin)
    .in("id_prodaja", kandidati.map((k) => k.o.id_prodaja!));
  const zePoslano = new Set((poslani ?? []).map((r) => `${r.id_prodaja}|${r.vrsta}|${r.rok}`));

  for (const k of kandidati) {
    if (zePoslano.has(`${k.o.id_prodaja}|${k.vrsta}|${k.rok}`)) {
      rez.preskoceno++;
      continue;
    }
    const redni = prejemnikiZa(prodajalci, k.o.imenovani_prodajalec);
    const to = nast.testniNacin ? [nast.testniEmail] : redni;
    const cc = nast.testniNacin ? [] : nast.vVednost;
    const podatki: PodatkiOpomnika = { vrsta: k.vrsta, oprema: k.o, rok: k.rok, danes, povezava: `${izvor}/oprema/${k.o.id_oprema}` };
    const napaka = await posljiEmail({
      to,
      subject: zadevaOpomnika(podatki, nast.testniNacin),
      cc,
      html: htmlOpomnika(podatki, nast.testniNacin ? { prejemniki: redni, vVednost: nast.vVednost } : undefined),
      vrsta: k.vrsta,
      test: nast.testniNacin,
    });
    await sb.from("rbo_opomniki").insert({
      vrsta: k.vrsta,
      id_oprema: k.o.id_oprema,
      id_prodaja: k.o.id_prodaja,
      rok: k.rok,
      prejemniki: [to.join("; "), cc.length ? `v vednost: ${cc.join("; ")}` : ""].filter(Boolean).join(" | "),
      testni: nast.testniNacin,
      poslal,
      napaka,
    });
    if (napaka) rez.napake.push(`${k.o.oprema_naziv}: ${napaka}`);
    else rez.poslano++;
  }
  return rez;
}

/** Testni e-mail na testni naslov: prva posojena / rezervirana oprema ali vzorčni podatki. */
export async function posljiTestniOpomnik(sb: SupabaseClient, { izvor, poslal }: { izvor: string; poslal: string }) {
  const danes = danesLj();
  const [nast, prodajalci] = await Promise.all([naloziNastavitve(sb), naloziProdajalce(sb)]);
  if (!nast.testniEmail) return "Najprej vpiši in shrani testni e-mail naslov.";

  // prava oprema za realen predogled: najprej posojena z rokom, sicer rezervirana
  const posojena = await sb
    .from("v_rbo_oprema_prodaja")
    .select("*")
    .eq("status_prodaje", STATUS_POSOJENO)
    .not("posojeno_do", "is", null)
    .limit(1);
  const rezervirana = posojena.data?.length
    ? null
    : await sb.from("v_rbo_oprema_prodaja").select("*").eq("rezervirano", true).limit(1);
  const prava = ((posojena.data?.[0] ?? rezervirana?.data?.[0]) as OpremaVrstica | undefined) ?? null;
  const vrsta: VrstaOpomnika = prava && prava.status_prodaje !== STATUS_POSOJENO ? "rezervacija" : "posoja";
  const rok =
    (prava && (vrsta === "posoja" ? prava.posojeno_do : prava.rezervirano_do)) ||
    new Date(Date.parse(danes) + nast.dniPred * 86_400_000).toISOString().slice(0, 10);
  const oprema: PodatkiOpomnika["oprema"] = prava ?? {
    id_oprema: 0,
    oprema_naziv: "Peč etažna (vzorčni podatki)",
    koda: "IDENT-123",
    serijska_stevilka: "SN 0000",
    skupina_opreme: "Peč etažna",
    skladisce: "ERP; 15; RABLJENO",
    imenovani_prodajalec: prodajalci.find((p) => p.aktiven)?.naziv ?? null,
    posojeno_od: danes,
    posojeno_podjetje: "Pekarna Vzorec d.o.o.",
    posojeno_kontakt: "Janez Vzorec, 040 000 000",
    rezervirano_podjetje: null,
    rezervirano_kontakt: null,
  };
  const podatki: PodatkiOpomnika = {
    vrsta,
    oprema,
    rok,
    danes,
    povezava: prava ? `${izvor}/oprema/${prava.id_oprema}` : izvor,
  };
  const redni = prejemnikiZa(prodajalci, oprema.imenovani_prodajalec);
  const napaka = await posljiEmail({
    to: [nast.testniEmail],
    cc: [],
    subject: zadevaOpomnika(podatki, true),
    html: htmlOpomnika(podatki, { prejemniki: redni, vVednost: nast.vVednost }),
    vrsta: "test",
    test: true,
  });
  await sb.from("rbo_opomniki").insert({
    vrsta: "test",
    id_oprema: prava?.id_oprema ?? null,
    id_prodaja: prava?.id_prodaja ?? null,
    rok,
    prejemniki: nast.testniEmail,
    testni: true,
    poslal,
    napaka,
  });
  return napaka;
}
