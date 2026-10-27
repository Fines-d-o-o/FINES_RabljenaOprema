// Statusni list (obrazec OBR140 – Status blaga - Rabljeno): nalepi se na rabljeno opremo, ko se pakira v folijo.
// Postavitev je skupna za predogled / tisk (HTML) in PDF: mere v mm od zgornjega levega kota A4, pisave v pt.
import { danes, prikazDatuma } from "@/lib/datum";
import type { OpremaVrstica } from "@/lib/types";

export type Okvir = { x: number; y: number; w: number; h: number };

export const A4_MM = { w: 210, h: 297 };
export const MM_V_PT = 72 / 25.4;
export const MM_V_PX = 96 / 25.4;
/** Višina vrstice besedila v mm za pisavo v pt. */
export const visinaVrstice = (pt: number) => pt * 0.3528 * 1.25;

export const BARVE = {
  besedilo: "#1c1c1f",
  oznaka: "#6b6b72",
  glava: "#3a3a3f",
  oranzna: "#ca5010",
  oranznaSvetla: "#ee7a3a",
  pas: "#f9c22e", // rumen pas z naslovom, kot na papirnem obrazcu
  kartica: "#f5f5f7",
  karticaRob: "#dcdcdf",
  bela: "#ffffff",
  temna: "#2b2b2f",
  senca: "#000000",
  krog: "#e2f0d7",
  krogRob: "#9ccc7f",
  polnilo: "#7cbf4f",
  izbranaOzadje: "#eef7e8",
  izbranaRob: "#4d9a2a",
};

// Kartice: zaobljene, rahla senca pod njimi
export const KARTICA = { r: 2, rob: 0.25, sencaY: 0.6, sencaMoc: 0.08 };
// Oznaka v kartici zgoraj (velike črke), vrednost pod njo (krepko)
export const OZNAKA = { pt: 7, y: 2.2, x: 3 };
export const VREDNOST_Y = 6.8;

export const POSTAVITEV = {
  logo: { x: 15, y: 11, w: 44, h: 11.65 },
  geslo: { x: 15.6, y: 24.6, pt: 5.6, besedilo: "FINEST BAKING TECHNOLOGY" },
  naslov: { x: 113, y: 12, pt: 7.5, vrstice: ["Industrijska cesta 5", "1290 Grosuplje", "Slovenija"] },
  kontakt: {
    x: 155,
    y: 12,
    pt: 7.5,
    vrstice: [
      ["T", "+386 1 788 83 42"],
      ["E", "info@fines.si"],
      ["W", "www.fines.si"],
    ] as const,
  },
  pas: { x: 15, y: 31, w: 180, h: 14, r: 2.5, pt: 22, besedilo: "STATUS BLAGA - RABLJENO" },
  // naslovi razdelkov: oranžna oštevilčena značka, naslov in tanka črta do desnega roba
  razdelki: [
    { st: 1, besedilo: "Podatki o blagu", y: 52 },
    { st: 2, besedilo: "Skladiščenje", y: 122 },
    { st: 3, besedilo: "Stanje blaga", y: 153 },
  ],
  razdelek: { x: 15, do: 195, znacka: 7, pt: 13, stPt: 11 },
  // Prostor za nalepko IDENT: siva kartica TOČNO 60 × 50 mm (zunanja mera, z robom), ki se prelepi z nalepko.
  // Če nalepke ni, ostaneta v kartici naziv in šifra.
  nalepka: {
    okvir: { x: 15, y: 63, w: 60, h: 50 },
    naslov: "NALEPKA · IDENT",
    naslovY: 3,
    naslovPt: 10,
    nazivY: 13,
    nazivPt: 15,
    nazivVrstic: 2,
    sifraY: 32,
    sifraPt: 13,
    sifraVrstic: 2,
  },
  stanje: { x: 15, y: 164, w: 180, h: 26, razmik: 3, r: 4, stevilkaPt: 13, opisPt: 8.5 },
  id: { x: 15, y: 241, w: 60, h: 21, r: 2.5, oznaka: "ID OPREME", pt: 30 },
  noga: { crtaY: 281, y: 283, pt: 7, levo: "OBR140 – Status blaga - Rabljeno", desno: "Stran 1" },
};

export type PodatkiStatusnegaLista = {
  id: number;
  naziv: string;
  ident: string;
  serijska: string;
  lastnik: string;
  opis: string;
  skladisceErp: string;
  lokacija: string;
  ocena: number | null;
  opisStanja: string;
  datum: string;
  podpis: string;
};

// Kartice polj: oznaka v kartici zgoraj, vrednost (krepko) pod njo
export const POLJA: { oznaka: string; kljuc: keyof PodatkiStatusnegaLista; okvir: Okvir; pt: number; vrstic: number }[] = [
  { oznaka: "Serijska številka", kljuc: "serijska", okvir: { x: 81, y: 63, w: 114, h: 13 }, pt: 13, vrstic: 1 },
  { oznaka: "Lastnik", kljuc: "lastnik", okvir: { x: 81, y: 79, w: 114, h: 13 }, pt: 13, vrstic: 1 },
  { oznaka: "Opis", kljuc: "opis", okvir: { x: 81, y: 95, w: 114, h: 18 }, pt: 12, vrstic: 2 },
  { oznaka: "Skladišče (ERP SKL št.)", kljuc: "skladisceErp", okvir: { x: 15, y: 133, w: 60, h: 14 }, pt: 12, vrstic: 1 },
  { oznaka: "Lokacija (fizično)", kljuc: "lokacija", okvir: { x: 81, y: 133, w: 62, h: 14 }, pt: 12, vrstic: 1 },
  { oznaka: "Podroben opis stanja", kljuc: "opisStanja", okvir: { x: 15, y: 197, w: 180, h: 36 }, pt: 12, vrstic: 5 },
  { oznaka: "Datum", kljuc: "datum", okvir: { x: 81, y: 241, w: 52, h: 21 }, pt: 13, vrstic: 1 },
  { oznaka: "Podpis", kljuc: "podpis", okvir: { x: 137, y: 241, w: 58, h: 21 }, pt: 13, vrstic: 1 },
];

export const velikeCrke = (t: string) => t.toLocaleUpperCase("sl-SI");

// Ocene stanja kot na obrazcu (krog se polni od spodaj); opisi so enaki kot v aplikaciji (sifranti.ts)
export const STANJA: { ocena: number; opis: [string, string]; polnilo: number }[] = [
  { ocena: 1, opis: ["Uničeno,", "neuporabno"], polnilo: 0.14 },
  { ocena: 2, opis: ["Zelo", "rabljeno"], polnilo: 0.32 },
  { ocena: 3, opis: ["Vidno", "rabljeno"], polnilo: 0.52 },
  { ocena: 4, opis: ["Skoraj novo,", "malo rabljeno"], polnilo: 0.74 },
  { ocena: 5, opis: ["Kot", "novo"], polnilo: 1 },
];

export const SIRINA_OPISA = 23;

/** Postavitev kartice ene ocene (krog levo, številka in opis desno, kljukica pri izbrani oceni). */
export function stolpecStanja(i: number) {
  const { x, y, w, h, razmik, r } = POSTAVITEV.stanje;
  const sirina = (w - (STANJA.length - 1) * razmik) / STANJA.length;
  const x0 = x + i * (sirina + razmik);
  return {
    kartica: { x: x0, y, w: sirina, h },
    krog: { cx: x0 + 6, cy: y + h / 2 + 1, r },
    besediloX: x0 + 22, // sredina številke in opisa (širina SIRINA_OPISA)
    stevilkaY: y + 3,
    opisY: [y + 10, y + 14],
    kljukica: { cx: x0 + sirina - 3.3, cy: y + 3.3, r: 2.1 },
  };
}

/** SVG pot napolnjenega dela kroga (od spodaj do deleža `delez`) v koordinatah s središčem 0,0 in y navzdol. */
export function potPolnila(r: number, delez: number) {
  const gladina = r - 2 * r * delez;
  const dx = Math.sqrt(Math.max(0, r * r - gladina * gladina));
  const velik = delez > 0.5 ? 1 : 0;
  return `M ${-dx} ${gladina} A ${r} ${r} 0 ${velik} 0 ${dx} ${gladina} Z`;
}

/** Kljukica v krogu s središčem 0,0 in polmerom r (y navzdol). */
export const potKljukice = (r: number) => `M ${-0.45 * r} ${0.02 * r} L ${-0.1 * r} ${0.38 * r} L ${0.5 * r} ${-0.35 * r}`;

/** SVG pot zaobljenega pravokotnika z zgornjim levim kotom v 0,0 (y navzdol). */
export function potZaobljenega(w: number, h: number, r: number) {
  return (
    `M ${r} 0 L ${w - r} 0 A ${r} ${r} 0 0 1 ${w} ${r} L ${w} ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} ` +
    `L ${r} ${h} A ${r} ${r} 0 0 1 0 ${h - r} L 0 ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`
  );
}

// Skladišče je v šifrantu zapisano kot "ERP; 15; RABLJENO" (ERP skladišče) ali kot fizična lokacija (npr. FINES, SELA)
function razcleniSkladisce(skladisce: string | null) {
  const s = skladisce?.trim() ?? "";
  const erp = s.match(/^ERP\s*;\s*(\d+)\s*;?\s*(.*)$/i);
  if (erp) return { skladisceErp: `ERP ${erp[1]}${erp[2] ? ` – ${erp[2]}` : ""}`, lokacija: "" };
  return { skladisceErp: "", lokacija: s };
}

export function podatkiStatusnegaLista(o: OpremaVrstica): PodatkiStatusnegaLista {
  return {
    id: o.id_oprema,
    naziv: o.oprema_naziv,
    ident: o.koda ?? "",
    serijska: o.serijska_stevilka ?? "",
    lastnik: o.lastnistvo ?? "",
    opis: [o.skupina_opreme, o.leto_proizvodnje ? `Leto proizvodnje: ${o.leto_proizvodnje}` : null].filter(Boolean).join("\n"),
    ...razcleniSkladisce(o.skladisce),
    ocena: o.ocena,
    opisStanja: o.komentar ?? "",
    datum: prikazDatuma(danes()),
    podpis: "",
  };
}
