// PDF dokumenti opreme (ustvarijo se v brskalniku): kartoteka opreme, tehnični list in statusni list.
// Pisava DejaVu Sans podpira č, š, ž. Podatki se naložijo iz baze ob kliku na prenos.
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { danes, prikazDatuma } from "@/lib/datum";
import { pripraviSliko } from "@/lib/pripraviSliko";
import { NAJVISJA_OCENA, opisOcene } from "@/lib/sifranti";
import { MESTA_SLIK, slikeOpreme, type ObstojecaSlika, type VrstaSlike } from "@/lib/slike";
import {
  BARVE as SL_BARVE,
  KARTICA as SL_KARTICA,
  MM_V_PT,
  OZNAKA as SL_OZNAKA,
  POLJA as SL_POLJA,
  POSTAVITEV as SL_POSTAVITEV,
  SIRINA_OPISA as SL_SIRINA_OPISA,
  STANJA as SL_STANJA,
  VREDNOST_Y as SL_VREDNOST_Y,
  potKljukice,
  potPolnila,
  potZaobljenega,
  stolpecStanja,
  velikeCrke,
  visinaVrstice,
  type Okvir,
  type PodatkiStatusnegaLista,
} from "@/lib/statusniList";
import { createClient } from "@/lib/supabase/client";
import { TL_SKLOPI, type OpremaVrstica, type TehnicniList, type ZapisKartoteke } from "@/lib/types";

const A4: [number, number] = [595.28, 841.89];
const ROB = 42;
const SIRINA = A4[0] - 2 * ROB;
const ORANZNA = rgb(232 / 255, 89 / 255, 12 / 255);
const TEMNA = rgb(0.1, 0.1, 0.1);
const SIVA = rgb(0.42, 0.42, 0.42);
const CRTA = rgb(0.86, 0.85, 0.83);
const OZADJE_SLIKE = rgb(0.95, 0.94, 0.93);

export const evri = (n: number) =>
  n.toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

// ---------------------------------------------------------------------------
// Podatki

export type PodatkiOpreme = {
  oprema: OpremaVrstica;
  kartoteka: ZapisKartoteke[];
  tehnicniList: TehnicniList | null;
  slike: Partial<Record<VrstaSlike, ObstojecaSlika>>;
};

export async function naloziPodatkeOpreme(idOprema: number): Promise<PodatkiOpreme> {
  const supabase = createClient();
  const [oprema, kartoteka, tl, slike] = await Promise.all([
    supabase.from("v_rbo_oprema_prodaja").select("*").eq("id_oprema", idOprema).single(),
    supabase
      .from("rbo_kartoteka")
      .select("id, datum_vnosa, besedilo_vnosa, strosek")
      .eq("id_oprema", idOprema)
      .eq("visible", true)
      .order("datum_vnosa", { ascending: false })
      .order("id", { ascending: false }),
    supabase.from("rbo_tehnicni_list").select("*").eq("id_oprema", idOprema).eq("visible", true).maybeSingle(),
    slikeOpreme(supabase, idOprema),
  ]);
  if (oprema.error) throw new Error(`Opreme ni bilo mogoče naložiti: ${oprema.error.message}`);
  return {
    oprema: oprema.data as OpremaVrstica,
    kartoteka: (kartoteka.data ?? []) as ZapisKartoteke[],
    tehnicniList: (tl.data as TehnicniList | null) ?? null,
    slike,
  };
}

// ---------------------------------------------------------------------------
// Pomožno

const naloziBajte = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Prenos ni uspel: ${url}`);
  return new Uint8Array(await r.arrayBuffer());
};

// Fotografije se pred vgradnjo pomanjšajo (manjši PDF); ob napaki PDF nastane brez slike
async function vgradiFotografijo(pdf: PDFDocument, url: string | null | undefined, maxStranica = 1400) {
  if (!url) return null;
  try {
    const blob = await (await fetch(url)).blob();
    const jpg = await pripraviSliko(blob, maxStranica, 0.8);
    return await pdf.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
  } catch {
    return null;
  }
}

// Razbije besedilo v vrstice, ki ustrezajo širini (upošteva tudi prelome vrstic in predolge besede)
function prelomi(besedilo: string, font: PDFFont, velikost: number, sirina: number): string[] {
  const vrstice: string[] = [];
  for (const odstavek of besedilo.replace(/\r/g, "").split("\n")) {
    let vrstica = "";
    for (const beseda of odstavek.split(/\s+/).filter(Boolean)) {
      const kandidat = vrstica ? `${vrstica} ${beseda}` : beseda;
      if (font.widthOfTextAtSize(kandidat, velikost) <= sirina) {
        vrstica = kandidat;
        continue;
      }
      if (vrstica) vrstice.push(vrstica);
      let ostanek = beseda;
      while (font.widthOfTextAtSize(ostanek, velikost) > sirina) {
        let n = ostanek.length;
        while (n > 1 && font.widthOfTextAtSize(ostanek.slice(0, n), velikost) > sirina) n--;
        vrstice.push(ostanek.slice(0, n));
        ostanek = ostanek.slice(n);
      }
      vrstica = ostanek;
    }
    vrstice.push(vrstica);
  }
  return vrstice;
}

// Piše dokument od zgoraj navzdol in sam doda novo stran, ko zmanjka prostora
class Pisec {
  stran: PDFPage;
  y: number;

  private constructor(
    readonly pdf: PDFDocument,
    readonly navadna: PDFFont,
    readonly krepka: PDFFont,
    readonly logo: PDFImage | null,
  ) {
    this.stran = pdf.addPage(A4);
    this.y = A4[1] - ROB;
  }

  static async ustvari(naslov: string) {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    pdf.setTitle(naslov);
    pdf.setAuthor("FINES d.o.o.");
    const [navadna, krepka, logo] = await Promise.all([
      naloziBajte("/fonts/DejaVuSans.ttf").then((b) => pdf.embedFont(b, { subset: true })),
      naloziBajte("/fonts/DejaVuSans-Bold.ttf").then((b) => pdf.embedFont(b, { subset: true })),
      naloziBajte("/fines-logo.png")
        .then((b) => pdf.embedPng(b))
        .catch(() => null),
    ]);
    return new Pisec(pdf, navadna, krepka, logo);
  }

  novaStran() {
    this.stran = this.pdf.addPage(A4);
    this.y = A4[1] - ROB;
  }

  prostor(visina: number) {
    if (this.y - visina < ROB + 30) this.novaStran();
  }

  tekst(t: string, x: number, velikost: number, font = this.navadna, barva = TEMNA) {
    this.stran.drawText(t, { x, y: this.y, size: velikost, font, color: barva });
  }

  desno(t: string, y: number, velikost: number, font: PDFFont, barva = TEMNA) {
    this.stran.drawText(t, { x: A4[0] - ROB - font.widthOfTextAtSize(t, velikost), y, size: velikost, font, color: barva });
  }

  glava(naslovDokumenta: string) {
    if (this.logo) {
      const s = this.logo.scaleToFit(120, 32);
      this.stran.drawImage(this.logo, { x: ROB, y: this.y - s.height, width: s.width, height: s.height });
    }
    this.desno(naslovDokumenta, this.y - 14, 16, this.krepka);
    this.desno(`Natisnjeno: ${prikazDatuma(danes())}`, this.y - 28, 9, this.navadna, SIVA);
    this.y -= 44;
    this.stran.drawRectangle({ x: ROB, y: this.y, width: SIRINA, height: 2, color: ORANZNA });
    this.y -= 26;
  }

  nazivOpreme(o: OpremaVrstica) {
    for (const v of prelomi(o.oprema_naziv, this.krepka, 18, SIRINA)) {
      this.tekst(v, ROB, 18, this.krepka);
      this.y -= 22;
    }
    this.tekst([`ID ${o.id_oprema}`, o.skupina_opreme].filter(Boolean).join("  ·  "), ROB, 10, this.navadna, SIVA);
    this.y -= 22;
  }

  // potrebno: koliko prostora mora ostati pod naslovom (da naslov ne ostane sam na dnu strani)
  podnaslov(t: string, potrebno = 50) {
    this.y -= 8;
    this.prostor(potrebno);
    this.stran.drawRectangle({ x: ROB, y: this.y - 4, width: 3, height: 16, color: ORANZNA });
    this.tekst(t, ROB + 10, 13, this.krepka);
    this.y -= 24;
  }

  // Tabela oznaka / vrednost; stolpcev = 1 ali 2
  tabela(pari: [string, string][], sirina = SIRINA, stolpcev: 1 | 2 = 1) {
    const sirinaStolpca = (sirina - (stolpcev - 1) * 20) / stolpcev;
    const sirinaOznake = Math.min(120, sirinaStolpca * 0.42);
    for (let i = 0; i < pari.length; i += stolpcev) {
      const vrsta = pari.slice(i, i + stolpcev).map(([oznaka, vrednost]) => ({
        oznaka,
        vrstice: prelomi(vrednost || "–", this.krepka, 10, sirinaStolpca - sirinaOznake),
      }));
      const visina = Math.max(...vrsta.map((c) => c.vrstice.length)) * 13;
      this.prostor(visina + 5);
      vrsta.forEach((c, j) => {
        const x = ROB + j * (sirinaStolpca + 20);
        this.stran.drawText(c.oznaka, { x, y: this.y, size: 9, font: this.navadna, color: SIVA });
        c.vrstice.forEach((v, k) =>
          this.stran.drawText(v, { x: x + sirinaOznake, y: this.y - k * 13, size: 10, font: this.krepka, color: TEMNA }),
        );
      });
      this.y -= visina + 5;
    }
  }

  odstavek(oznaka: string, besedilo: string) {
    this.prostor(30);
    this.tekst(oznaka, ROB, 9, this.navadna, SIVA);
    this.y -= 14;
    for (const v of prelomi(besedilo, this.navadna, 10, SIRINA)) {
      this.prostor(14);
      this.tekst(v, ROB, 10);
      this.y -= 14;
    }
  }

  // Slika, umeščena v okvir (ohrani razmerje stranic)
  slikaVOkvir(slika: PDFImage | null, x: number, yZgoraj: number, w: number, h: number) {
    this.stran.drawRectangle({ x, y: yZgoraj - h, width: w, height: h, color: OZADJE_SLIKE });
    if (!slika) {
      const t = "Ni slike";
      this.stran.drawText(t, {
        x: x + (w - this.navadna.widthOfTextAtSize(t, 9)) / 2,
        y: yZgoraj - h / 2 - 3,
        size: 9,
        font: this.navadna,
        color: SIVA,
      });
      return;
    }
    const s = slika.scaleToFit(w, h);
    this.stran.drawImage(slika, { x: x + (w - s.width) / 2, y: yZgoraj - h + (h - s.height) / 2, width: s.width, height: s.height });
  }

  static VISINA_VRSTE_SLIK = ((SIRINA - 16) / 2) * 0.72 + 26;

  mrezaSlik(slike: { naslov: string; slika: PDFImage | null }[]) {
    const stolpcev = 2;
    const w = (SIRINA - 16) / stolpcev;
    const h = w * 0.72;
    for (let i = 0; i < slike.length; i += stolpcev) {
      this.prostor(h + 26);
      slike.slice(i, i + stolpcev).forEach((s, j) => {
        const x = ROB + j * (w + 16);
        this.stran.drawText(s.naslov, { x, y: this.y, size: 9, font: this.krepka, color: TEMNA });
        this.slikaVOkvir(s.slika, x, this.y - 6, w, h);
      });
      this.y -= h + 26;
    }
  }

  async koncaj(nogaLevo: string) {
    const strani = this.pdf.getPages();
    strani.forEach((s, i) => {
      const desno = `Stran ${i + 1} / ${strani.length}`;
      s.drawRectangle({ x: ROB, y: ROB - 2, width: SIRINA, height: 0.5, color: CRTA });
      s.drawText(nogaLevo, { x: ROB, y: ROB - 16, size: 8, font: this.navadna, color: SIVA });
      s.drawText(desno, {
        x: A4[0] - ROB - this.navadna.widthOfTextAtSize(desno, 8),
        y: ROB - 16,
        size: 8,
        font: this.navadna,
        color: SIVA,
      });
    });
    const bajti = await this.pdf.save();
    return new Blob([bajti as BlobPart], { type: "application/pdf" });
  }
}

const osnovniPodatki = (o: OpremaVrstica): [string, string][] => [
  ["Ident (koda)", o.koda ?? ""],
  ["Serijska številka", o.serijska_stevilka ?? ""],
  ["Leto proizvodnje", o.leto_proizvodnje?.toString() ?? ""],
  ["Datum prejema", o.datum_prejema ? prikazDatuma(o.datum_prejema) : ""],
  ["Količina", `${o.kolicina} ${o.em ?? ""}`.trim()],
  ["Lastništvo", o.lastnistvo ?? ""],
  ["Skladišče", o.skladisce ?? ""],
  ["Ocena stanja", o.ocena ? `${o.ocena} / ${NAJVISJA_OCENA} – ${opisOcene(o.ocena)}` : ""],
  ["Status prodaje", o.status_prodaje ?? ""],
  ["Garancija", o.garancijski_rok_meseci ? `${o.garancijski_rok_meseci} mesecev` : "Brez garancije"],
];

// ---------------------------------------------------------------------------
// Kartoteka opreme

export async function ustvariKartotekoPdf({ oprema, kartoteka, slike }: PodatkiOpreme): Promise<Blob> {
  const p = await Pisec.ustvari(`Kartoteka opreme ${oprema.id_oprema} – ${oprema.oprema_naziv}`);
  const predstavna = await vgradiFotografijo(p.pdf, slike.Predstavna?.url, 900);

  p.glava("Kartoteka opreme");
  p.nazivOpreme(oprema);

  // osnovni podatki levo, predstavna slika desno
  const zacetekY = p.y;
  if (predstavna) p.slikaVOkvir(predstavna, A4[0] - ROB - 200, zacetekY + 8, 200, 150);
  p.tabela(osnovniPodatki(oprema), predstavna ? SIRINA - 220 : SIRINA);
  if (predstavna) p.y = Math.min(p.y, zacetekY - 160);
  if (oprema.komentar) {
    p.y -= 6;
    p.odstavek("Komentar", oprema.komentar);
  }

  p.podnaslov("Zgodovina");
  const skupaj = kartoteka.reduce((s, z) => s + (z.strosek ?? 0), 0);
  if (skupaj > 0) {
    p.tekst(`Skupni stroški: ${evri(skupaj)}`, ROB, 10, p.krepka);
    p.y -= 20;
  }
  if (kartoteka.length === 0) p.tekst("V kartoteki ni zapisov.", ROB, 10, p.navadna, SIVA);

  const urejeni = [...kartoteka].sort(
    (a, b) => b.datum_vnosa.localeCompare(a.datum_vnosa) || (b.id ?? 0) - (a.id ?? 0),
  );
  const xBesedila = ROB + 22;
  for (const z of urejeni) {
    const vrstice = prelomi(z.besedilo_vnosa, p.navadna, 10, SIRINA - 22);
    p.prostor(30);
    p.stran.drawCircle({ x: ROB + 5, y: p.y + 3.5, size: 4, color: ORANZNA });
    p.tekst(prikazDatuma(z.datum_vnosa), xBesedila, 10, p.krepka);
    if (z.strosek != null) p.desno(`Strošek: ${evri(z.strosek)}`, p.y, 10, p.krepka);
    p.y -= 15;
    for (const v of vrstice) {
      p.prostor(14);
      p.stran.drawRectangle({ x: ROB + 4.5, y: p.y - 3, width: 1, height: 15, color: CRTA });
      p.tekst(v, xBesedila, 10);
      p.y -= 14;
    }
    p.y -= 8;
  }

  return p.koncaj(`FINES d.o.o. | Rabljena oprema | Kartoteka ID ${oprema.id_oprema}`);
}

// ---------------------------------------------------------------------------
// Tehnični list

export async function ustvariTehnicniListPdf({ oprema, tehnicniList, slike }: PodatkiOpreme): Promise<Blob> {
  const p = await Pisec.ustvari(`Tehnični list ${oprema.id_oprema} – ${oprema.oprema_naziv}`);
  const fotografije = await Promise.all(
    MESTA_SLIK.map(async (m) => ({ naslov: m.naslov, slika: await vgradiFotografijo(p.pdf, slike[m.vrsta]?.url) })),
  );

  p.glava("Tehnični list");
  p.nazivOpreme(oprema);

  p.podnaslov("Podatki opreme");
  p.tabela(osnovniPodatki(oprema), SIRINA, 2);

  for (const sklop of TL_SKLOPI) {
    p.podnaslov(sklop.naslov);
    p.tabela(
      sklop.polja.map((f) => [f.oznaka, tehnicniList?.[f.kljuc]?.toString() ?? ""]),
      SIRINA,
      2,
    );
  }
  if (tehnicniList?.opis) {
    p.podnaslov("Opis");
    for (const v of prelomi(tehnicniList.opis, p.navadna, 10, SIRINA)) {
      p.prostor(14);
      p.tekst(v, ROB, 10);
      p.y -= 14;
    }
  }

  p.podnaslov("Slike", Pisec.VISINA_VRSTE_SLIK + 30);
  p.mrezaSlik(fotografije);

  return p.koncaj(`FINES d.o.o. | Rabljena oprema | Tehnični list ID ${oprema.id_oprema}`);
}

// ---------------------------------------------------------------------------
// Osnovni podatki (za kupca): brez prodajnih podatkov, statusa, lastništva, skladišča in komentarja

export async function ustvariOsnovnePodatkePdf({ oprema, slike }: PodatkiOpreme): Promise<Blob> {
  const p = await Pisec.ustvari(`Osnovni podatki ${oprema.id_oprema} – ${oprema.oprema_naziv}`);
  const mesta = MESTA_SLIK.filter((m) => m.vrsta !== "Krmiljenje" && slike[m.vrsta]?.url);
  const fotografije = (
    await Promise.all(
      mesta.map(async (m) => ({ naslov: m.naslov, slika: await vgradiFotografijo(p.pdf, slike[m.vrsta]?.url) })),
    )
  ).filter((f) => f.slika);

  p.glava("Rabljena oprema");
  p.nazivOpreme(oprema);

  p.podnaslov("Osnovni podatki");
  p.tabela(
    [
      ["Skupina opreme", oprema.skupina_opreme ?? ""],
      ["Ident (koda)", oprema.koda ?? ""],
      ["Serijska številka", oprema.serijska_stevilka ?? ""],
      ["Leto proizvodnje", oprema.leto_proizvodnje?.toString() ?? ""],
      ["Ocena stanja", oprema.ocena ? `${oprema.ocena} / ${NAJVISJA_OCENA} – ${opisOcene(oprema.ocena)}` : ""],
    ],
    SIRINA,
    2,
  );

  if (fotografije.length > 0) {
    p.podnaslov("Slike", Pisec.VISINA_VRSTE_SLIK + 30);
    p.mrezaSlik(fotografije);
  }

  return p.koncaj(`FINES d.o.o. | Rabljena oprema | ID ${oprema.id_oprema}`);
}

// ---------------------------------------------------------------------------
// Statusni list (OBR140): postavitev v lib/statusniList.ts, ista kot predogled in tisk

const hex = (h: string) =>
  rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

// Prelomljeno besedilo, omejeno na število vrstic (zadnja vrstica dobi tropičje, če je besedila več)
function omejiVrstice(besedilo: string, font: PDFFont, pt: number, sirina: number, vrstic: number) {
  const vse = prelomi(besedilo, font, pt, sirina).filter((v, i, a) => v || i < a.length - 1);
  if (vse.length <= vrstic) return vse;
  const izbrane = vse.slice(0, vrstic);
  let zadnja = izbrane[vrstic - 1];
  while (zadnja && font.widthOfTextAtSize(`${zadnja}…`, pt) > sirina) zadnja = zadnja.slice(0, -1);
  izbrane[vrstic - 1] = `${zadnja.trimEnd()}…`;
  return izbrane;
}

export async function ustvariStatusniListPdf(sl: PodatkiStatusnegaLista): Promise<Blob> {
  const p = await Pisec.ustvari(`Statusni list ${sl.id} – ${sl.naziv}`);
  const s = p.stran;
  const k = MM_V_PT;
  const H = A4[1];
  const L = SL_POSTAVITEV;

  // Besedilo v vrstici, ki se začne y mm od vrha (navpično na sredini vrstice, kot v HTML)
  const tekst = (
    t: string,
    x: number,
    y: number,
    pt: number,
    o: { font?: PDFFont; barva?: string; sredina?: number; desno?: number } = {},
  ) => {
    const font = o.font ?? p.navadna;
    const w = font.widthOfTextAtSize(t, pt);
    let xPt = x * k;
    if (o.sredina) xPt += (o.sredina * k - w) / 2;
    if (o.desno) xPt += o.desno * k - w;
    s.drawText(t, {
      x: xPt,
      y: H - (y + visinaVrstice(pt) / 2) * k - pt * 0.35,
      size: pt,
      font,
      color: hex(o.barva ?? SL_BARVE.besedilo),
    });
  };

  // Zaobljena kartica z rahlo senco
  const kartica = (
    o: Okvir,
    v: { barva?: string; rob?: string | null; debelinaRoba?: number; r?: number; senca?: boolean } = {},
  ) => {
    const r = (v.r ?? SL_KARTICA.r) * k;
    const pot = potZaobljenega(o.w * k, o.h * k, r);
    if (v.senca ?? true)
      s.drawSvgPath(pot, {
        x: o.x * k,
        y: H - (o.y + SL_KARTICA.sencaY) * k,
        color: hex(SL_BARVE.senca),
        opacity: SL_KARTICA.sencaMoc,
      });
    // Rob je znotraj okvirja (kot border-box v HTML): zunanja mera kartice je točno o.w × o.h
    const rob = v.rob === undefined ? SL_BARVE.karticaRob : v.rob;
    const debelina = rob ? (v.debelinaRoba ?? SL_KARTICA.rob) * k : 0;
    const d = debelina / 2;
    s.drawSvgPath(potZaobljenega(o.w * k - debelina, o.h * k - debelina, Math.max(0, r - d)), {
      x: o.x * k + d,
      y: H - o.y * k - d,
      color: hex(v.barva ?? SL_BARVE.kartica),
      ...(rob ? { borderColor: hex(rob), borderWidth: debelina } : {}),
    });
  };
  const oznaka = (t: string, o: Okvir, barva = SL_BARVE.oznaka, x = SL_OZNAKA.x) =>
    tekst(velikeCrke(t), o.x + x, o.y + SL_OZNAKA.y, SL_OZNAKA.pt, { font: p.krepka, barva });

  // Glava
  if (p.logo) s.drawImage(p.logo, { x: L.logo.x * k, y: H - (L.logo.y + L.logo.h) * k, width: L.logo.w * k, height: L.logo.h * k });
  tekst(L.geslo.besedilo, L.geslo.x, L.geslo.y, L.geslo.pt, { barva: SL_BARVE.oranzna });
  L.naslov.vrstice.forEach((v, i) =>
    tekst(v, L.naslov.x, L.naslov.y + i * visinaVrstice(L.naslov.pt), L.naslov.pt, { font: p.krepka, barva: SL_BARVE.glava }),
  );
  L.kontakt.vrstice.forEach(([crka, v], i) => {
    const y = L.kontakt.y + i * visinaVrstice(L.kontakt.pt);
    tekst(crka, L.kontakt.x, y, L.kontakt.pt, { font: p.krepka, barva: SL_BARVE.oranzna });
    tekst(v, L.kontakt.x + 5, y, L.kontakt.pt, { font: p.krepka, barva: SL_BARVE.glava });
  });

  // Rumen pas z naslovom
  kartica(L.pas, { barva: SL_BARVE.pas, rob: null, r: L.pas.r });
  tekst(L.pas.besedilo, L.pas.x, L.pas.y + (L.pas.h - visinaVrstice(L.pas.pt)) / 2, L.pas.pt, {
    font: p.krepka,
    barva: SL_BARVE.temna,
    sredina: L.pas.w,
  });

  // Razdelki: oranžna značka s številko, naslov, tanka črta
  const R = L.razdelek;
  for (const raz of L.razdelki) {
    const znacka = { x: R.x, y: raz.y, w: R.znacka, h: R.znacka };
    kartica(znacka, { barva: SL_BARVE.oranzna, rob: null, r: 1.5, senca: false });
    tekst(String(raz.st), R.x, raz.y + (R.znacka - visinaVrstice(R.stPt)) / 2, R.stPt, {
      font: p.krepka,
      barva: SL_BARVE.bela,
      sredina: R.znacka,
    });
    const xNaslova = R.x + R.znacka + 2.5;
    tekst(raz.besedilo, xNaslova, raz.y + (R.znacka - visinaVrstice(R.pt)) / 2, R.pt, { font: p.krepka });
    const xCrte = xNaslova + p.krepka.widthOfTextAtSize(raz.besedilo, R.pt) / k + 3;
    s.drawRectangle({
      x: xCrte * k,
      y: H - (raz.y + R.znacka / 2 + 0.15) * k,
      width: (R.do - xCrte) * k,
      height: 0.3 * k,
      color: hex(SL_BARVE.karticaRob),
    });
  }

  // Prostor za nalepko IDENT (točno 60 × 50 mm); brez nalepke ostaneta naziv in šifra
  const n = L.nalepka;
  const nz = n.okvir;
  const notranja = nz.w - 2 * SL_OZNAKA.x;
  kartica(nz);
  tekst(n.naslov, nz.x, nz.y + n.naslovY, n.naslovPt, { font: p.krepka, barva: SL_BARVE.oznaka, sredina: nz.w });
  for (const [besedilo, y, pt, vrstic] of [
    [sl.naziv, n.nazivY, n.nazivPt, n.nazivVrstic],
    [sl.ident, n.sifraY, n.sifraPt, n.sifraVrstic],
  ] as const)
    omejiVrstice(besedilo, p.krepka, pt, notranja * k, vrstic).forEach((v, i) =>
      tekst(v, nz.x + SL_OZNAKA.x, nz.y + y + i * visinaVrstice(pt), pt, { font: p.krepka, sredina: notranja }),
    );

  // Polja: oznaka zgoraj, vrednost krepko
  for (const { oznaka: t, kljuc, okvir: o, pt, vrstic } of SL_POLJA) {
    kartica(o);
    oznaka(t, o);
    omejiVrstice(String(sl[kljuc] ?? ""), p.krepka, pt, (o.w - 2 * SL_OZNAKA.x) * k, vrstic).forEach((v, i) =>
      tekst(v, o.x + SL_OZNAKA.x, o.y + SL_VREDNOST_Y + i * visinaVrstice(pt), pt, { font: p.krepka }),
    );
  }

  // Stanje blaga: kartica izbrane ocene je zelena s kljukico, krog se polni od spodaj
  SL_STANJA.forEach((st, i) => {
    const c = stolpecStanja(i);
    const izbrana = sl.ocena === st.ocena;
    kartica(c.kartica, {
      barva: izbrana ? SL_BARVE.izbranaOzadje : SL_BARVE.kartica,
      rob: izbrana ? SL_BARVE.izbranaRob : SL_BARVE.karticaRob,
      debelinaRoba: izbrana ? 0.6 : SL_KARTICA.rob,
    });
    const sredisce = { x: c.krog.cx * k, y: H - c.krog.cy * k };
    s.drawCircle({ ...sredisce, size: c.krog.r * k, color: hex(SL_BARVE.krog) });
    if (st.polnilo >= 1) s.drawCircle({ ...sredisce, size: c.krog.r * k, color: hex(SL_BARVE.polnilo) });
    else s.drawSvgPath(potPolnila(c.krog.r * k, st.polnilo), { ...sredisce, color: hex(SL_BARVE.polnilo) });
    s.drawCircle({ ...sredisce, size: c.krog.r * k, borderColor: hex(SL_BARVE.krogRob), borderWidth: 0.4 * k });
    if (izbrana) {
      const kl = { x: c.kljukica.cx * k, y: H - c.kljukica.cy * k };
      s.drawCircle({ ...kl, size: c.kljukica.r * k, color: hex(SL_BARVE.izbranaRob) });
      s.drawSvgPath(potKljukice(c.kljukica.r * k), { ...kl, borderColor: hex(SL_BARVE.bela), borderWidth: 0.5 * k });
    }
    const x = c.besediloX - SL_SIRINA_OPISA / 2;
    tekst(String(st.ocena), x, c.stevilkaY, L.stanje.stevilkaPt, {
      font: p.krepka,
      barva: izbrana ? SL_BARVE.izbranaRob : SL_BARVE.besedilo,
      sredina: SL_SIRINA_OPISA,
    });
    st.opis.forEach((v, j) => tekst(v, x, c.opisY[j], L.stanje.opisPt, { sredina: SL_SIRINA_OPISA }));
  });

  // ID opreme v temni kartici
  kartica(L.id, { barva: SL_BARVE.temna, rob: null, r: L.id.r });
  oznaka(L.id.oznaka, L.id, SL_BARVE.oranznaSvetla, 4);
  tekst(String(sl.id), L.id.x + 4, L.id.y + SL_VREDNOST_Y - 0.5, L.id.pt, { font: p.krepka, barva: SL_BARVE.bela });

  // Noga
  s.drawRectangle({ x: R.x * k, y: H - (L.noga.crtaY + 0.25) * k, width: (R.do - R.x) * k, height: 0.25 * k, color: hex(SL_BARVE.karticaRob) });
  tekst(L.noga.levo, R.x, L.noga.y, L.noga.pt, { barva: SL_BARVE.oznaka });
  tekst(L.noga.desno, R.do - 30, L.noga.y, L.noga.pt, { barva: SL_BARVE.oznaka, desno: 30 });

  return new Blob([(await p.pdf.save()) as BlobPart], { type: "application/pdf" });
}

export async function prenesiStatusniList(sl: PodatkiStatusnegaLista) {
  prenesiDatoteko(await ustvariStatusniListPdf(sl), asciiIme(`Statusni_list_${sl.id}_${sl.naziv}`) + ".pdf");
}

// ---------------------------------------------------------------------------
// Prenos

export type VrstaPdf = "osnovni" | "kartoteka" | "tehnicni-list";

const PREDPONA: Record<VrstaPdf, string> = {
  osnovni: "Osnovni_podatki",
  kartoteka: "Kartoteka",
  "tehnicni-list": "Tehnicni_list",
};

const USTVARI: Record<VrstaPdf, (p: PodatkiOpreme) => Promise<Blob>> = {
  osnovni: ustvariOsnovnePodatkePdf,
  kartoteka: ustvariKartotekoPdf,
  "tehnicni-list": ustvariTehnicniListPdf,
};

// Ime datoteke samo z ASCII znaki (č -> c ...), da ga razume vsak e-mail odjemalec
export const asciiIme = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/_+/g, "_");

export const imeDatotekePdf = (vrsta: VrstaPdf, o: OpremaVrstica) =>
  asciiIme(`${PREDPONA[vrsta]}_${o.id_oprema}_${o.oprema_naziv}`) + ".pdf";

// Ali ima oprema podatke za ta dokument (osnovni podatki obstajajo vedno)
const imaDokument = (vrsta: VrstaPdf, p: PodatkiOpreme) =>
  vrsta === "osnovni" || (vrsta === "tehnicni-list" ? !!p.tehnicniList : p.kartoteka.length > 0);

type Datoteka = { ime: string; bajti: Uint8Array };
type Napredek = (opravljeno: number, vseh: number) => void;

// PDF-ji izbranih vrst za več oprem (po vrsti, da brskalnik ne porabi preveč pomnilnika).
// Oprema brez podatkov za dokument se preskoči.
async function ustvariPdfje(vrste: VrstaPdf[], idji: number[], napredek?: Napredek) {
  const datoteke: Datoteka[] = [];
  const oprema: OpremaVrstica[] = [];
  for (const [i, id] of idji.entries()) {
    napredek?.(i, idji.length);
    const podatki = await naloziPodatkeOpreme(id);
    oprema.push(podatki.oprema);
    for (const v of vrste.filter((v) => imaDokument(v, podatki))) {
      datoteke.push({
        ime: imeDatotekePdf(v, podatki.oprema),
        bajti: new Uint8Array(await (await USTVARI[v](podatki)).arrayBuffer()),
      });
    }
  }
  napredek?.(idji.length, idji.length);
  return { datoteke, oprema };
}

async function zip(datoteke: Datoteka[]) {
  const { zipSync } = await import("fflate");
  // PDF in JPG sta že stisnjena: shranimo brez dodatnega stiskanja (hitreje)
  const bajti = zipSync(Object.fromEntries(datoteke.map((d) => [d.ime, [d.bajti, { level: 0 }]])));
  return new Blob([bajti as BlobPart], { type: "application/zip" });
}

const ZIP_IME: Record<VrstaPdf, string> = {
  osnovni: "Osnovni_podatki",
  kartoteka: "Kartoteke",
  "tehnicni-list": "Tehnicni_listi",
};

// ZIP s PDF-ji za vso izbrano opremo; vrne število PDF-jev v ZIP-u
export async function prenesiZipPdfjev(vrsta: VrstaPdf, idji: number[], napredek?: Napredek) {
  const { datoteke } = await ustvariPdfje([vrsta], idji, napredek);
  if (datoteke.length === 0) throw new Error("Nobena izbrana oprema nima podatkov za ta dokument.");
  prenesiDatoteko(await zip(datoteke), `${ZIP_IME[vrsta]}_${danes()}.zip`);
  return datoteke.length;
}

// ZIP vseh slik opreme (izvirna imena datotek)
export async function prenesiZipSlik(idOprema: number) {
  const supabase = createClient();
  const [oprema, slike] = await Promise.all([
    supabase.from("rbo_oprema").select("oprema_naziv").eq("id_oprema", idOprema).maybeSingle(),
    slikeOpreme(supabase, idOprema),
  ]);
  const datoteke: Datoteka[] = [];
  for (const m of MESTA_SLIK) {
    const s = slike[m.vrsta];
    if (s?.url) datoteke.push({ ime: s.ime, bajti: await naloziBajte(s.url) });
  }
  if (datoteke.length === 0) throw new Error("Oprema nima slik.");
  const naziv = (oprema.data as { oprema_naziv: string } | null)?.oprema_naziv ?? "";
  prenesiDatoteko(await zip(datoteke), asciiIme(`Slike_${idOprema}_${naziv}`) + ".zip");
}

export function prenesiDatoteko(blob: Blob, ime: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = ime;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function prenesiPdf(vrsta: VrstaPdf, idOprema: number) {
  const podatki = await naloziPodatkeOpreme(idOprema);
  prenesiDatoteko(await USTVARI[vrsta](podatki), imeDatotekePdf(vrsta, podatki.oprema));
}

// ---------------------------------------------------------------------------
// E-mail za Outlook: datoteka .eml z oznako X-Unsent, ki jo Outlook odpre kot novo (neposlano) sporočilo.
// Priponke: osnovni podatki vedno, kartoteka in tehnični list, če obstajata.

const CRLF = "\r\n";

function base64(bajti: Uint8Array) {
  let niz = "";
  for (let i = 0; i < bajti.length; i += 0x8000) niz += String.fromCharCode(...bajti.subarray(i, i + 0x8000));
  return btoa(niz);
}
const vrstice76 = (b64: string) => b64.replace(/.{1,76}/g, (m) => m + CRLF);
const utf8Glava = (t: string) => `=?UTF-8?B?${base64(new TextEncoder().encode(t))}?=`;

// En ali več kosov opreme: vse priponke (brez ZIP) v enem sporočilu
export async function pripraviEmail(idji: number | number[], napredek?: Napredek) {
  const seznam = Array.isArray(idji) ? idji : [idji];
  const { datoteke: priponke, oprema } = await ustvariPdfje(["osnovni", "tehnicni-list", "kartoteka"], seznam, napredek);
  const zadeva =
    oprema.length === 1
      ? oprema[0].oprema_naziv
      : `Rabljena oprema: ${oprema.slice(0, 3).map((o) => o.oprema_naziv).join(", ")}` +
        (oprema.length > 3 ? ` in še ${oprema.length - 3}` : "");

  const meja = `----=_RBO_${Date.now().toString(36)}`;
  const html =
    `<html><body style="font-family:Calibri,Arial,sans-serif;font-size:11pt">` +
    `<p>Pozdravljeni,</p><p>V priponki pošiljam podatke o omenjeni rabljeni opremi.</p>` +
    `</body></html>`;

  const deli = [
    "X-Unsent: 1",
    "To: ",
    `Subject: ${utf8Glava(zadeva)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${meja}"`,
    "",
    `--${meja}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    vrstice76(base64(new TextEncoder().encode(html))),
    ...priponke.flatMap((p) => [
      `--${meja}`,
      `Content-Type: application/pdf; name="${p.ime}"`,
      `Content-Disposition: attachment; filename="${p.ime}"`,
      "Content-Transfer-Encoding: base64",
      "",
      vrstice76(base64(p.bajti)),
    ]),
    `--${meja}--`,
    "",
  ];

  const ime =
    oprema.length === 1
      ? asciiIme(`E-mail_${oprema[0].id_oprema}_${oprema[0].oprema_naziv}`) + ".eml"
      : `E-mail_rabljena_oprema_${danes()}.eml`;
  prenesiDatoteko(new Blob([deli.join(CRLF)], { type: "message/rfc822" }), ime);
}
