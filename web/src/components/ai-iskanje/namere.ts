// Namere v vprašanju (»poceni«, »malo rabljena«, »novejša«, »pod 5000 €«, »z garancijo« ...).
// AI model dobro razume, KAJ kdo išče (peč, napa), slabo pa cene, ocene in letnice - te razberemo tu,
// iz vprašanja jih odstranimo (model išče samo predmet) in jih uporabimo kot filter / razvrščanje.
// Nova pravila dodajaj v PRAVILA spodaj.

import { STATUS_POSOJENO } from "@/lib/sifranti";
import type { OpremaVrstica } from "@/lib/types";

export type Kljuc = "cena" | "ocena" | "leto" | "prejem";

export type Razvrscanje = { po: Kljuc; narascajoce: boolean; opis: string };

export type Filter = {
  opis: string;
  /** Vrednost, po kateri se filtrira (null = podatek ni vpisan - oprema ne ustreza). */
  vrednost?: Kljuc;
  ustreza: (o: OpremaVrstica) => boolean;
};

export type Namera = {
  /** Vprašanje brez besed namer - to dobi AI model. */
  predmet: string;
  razvrscanje: Razvrscanje | null;
  filtri: Filter[];
};

export const normaliziraj = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const vrednostKljuca = (o: OpremaVrstica, k: Kljuc): number | null =>
  k === "cena"
    ? o.prodajna_cena
    : k === "ocena"
      ? o.ocena
      : k === "leto"
        ? o.leto_proizvodnje
        : o.datum_prejema
          ? Date.parse(o.datum_prejema)
          : null;

// datum (LLLL-MM-DD) pred n dnevi
const predDnevi = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const prejetoOd = (od: string, opis: string): Filter => ({
  opis,
  vrednost: "prejem",
  ustreza: (o) => !!o.datum_prejema && o.datum_prejema >= od,
});

const status = (s: string, opis: string): Filter => ({ opis, ustreza: (o) => o.status_prodaje === s });

// »5000«, »5.000«, »5 000«, »5k«, »5 tisoč« -> 5000
const stevilo = (s: string, tisoc?: string) => {
  const n = Number(s.replace(/[.\s]/g, "").replace(",", "."));
  return tisoc ? n * 1000 : n;
};

type Pravilo = {
  vzorec: RegExp;
  uporabi: (m: RegExpMatchArray, n: Namera) => void;
};

const razvrsti = (po: Kljuc, narascajoce: boolean, opis: string) => (_: RegExpMatchArray, n: Namera) => {
  n.razvrscanje ??= { po, narascajoce, opis };
};

const filter = (f: Filter) => (_: RegExpMatchArray, n: Namera) => {
  n.filtri.push(f);
};

const ocenaVsaj = (meja: number, opis: string): Filter => ({
  opis,
  vrednost: "ocena",
  ustreza: (o) => (o.ocena ?? 0) >= meja,
});

// Vrstni red je pomemben: daljši / natančnejši izrazi pred splošnimi (npr. »najcenejša« pred »cena«).
// Vzorci delujejo na besedilu z malimi črkami brez šumnikov.
const PRAVILA: Pravilo[] = [
  // --- cena: meja v evrih (»pod 5000 €«, »do 3k«, »največ 2.000 eur«, »nad 1000 €«)
  {
    vzorec: /\b(pod|do|manj kot|najvec|max)\s*(\d[\d.\s]*\d|\d)\s*(k|tisoc)?\s*(€|eur\w*)?/,
    uporabi: (m, n) => {
      const cena = stevilo(m[2], m[3]);
      // »do 2018« je letnica, ne cena (razen če je napisan €)
      if (!m[4] && !m[3] && cena >= 1950 && cena <= 2100) return pravilaLeta(m, n, "do");
      n.filtri.push({ opis: `cena do ${cena.toLocaleString("sl-SI")} €`, vrednost: "cena", ustreza: (o) => o.prodajna_cena != null && o.prodajna_cena <= cena });
      n.razvrscanje ??= { po: "cena", narascajoce: true, opis: "od najcenejše" };
    },
  },
  {
    vzorec: /\b(nad|vec kot|vsaj)\s*(\d[\d.\s]*\d|\d)\s*(k|tisoc)?\s*(€|eur\w*)/,
    uporabi: (m, n) => {
      const cena = stevilo(m[2], m[3]);
      n.filtri.push({ opis: `cena nad ${cena.toLocaleString("sl-SI")} €`, vrednost: "cena", ustreza: (o) => o.prodajna_cena != null && o.prodajna_cena >= cena });
    },
  },
  // --- cena: smer
  { vzorec: /\b(najcenejs\w*|poceni\w*|cenejs\w*|ugodn\w*|nizk\w* cen\w*|po nizki ceni)\b/, uporabi: razvrsti("cena", true, "od najcenejše") },
  { vzorec: /\b(najdrazj\w*|najdraz\w*|drazj\w*|draz\w*)\b/, uporabi: razvrsti("cena", false, "od najdražje") },

  // --- stanje (ocena 1-5)
  { vzorec: /\b(kot nov\w*|nerabljen\w*|nov\w* stanj\w*)\b/, uporabi: (m, n) => { filter(ocenaVsaj(5, "stanje: kot novo (5)"))(m, n); razvrsti("ocena", false, "od najboljšega stanja")(m, n); } },
  {
    vzorec: /\b(malo rabljen\w*|skoraj nov\w*|dobro ohranjen\w*|lepo ohranjen\w*|ohranjen\w*|v dobrem stanju|dobr\w* stanj\w*|ociscen\w*|brezhibn\w*)\b/,
    uporabi: (m, n) => {
      filter(ocenaVsaj(4, "stanje: skoraj novo ali kot novo (4-5)"))(m, n);
      razvrsti("ocena", false, "od najboljšega stanja")(m, n);
    },
  },
  { vzorec: /\b(ocen\w*|stanj\w*)\s*(vsaj|najmanj|nad|od)?\s*([1-5])\b/, uporabi: (m, n) => filter(ocenaVsaj(Number(m[3]), `ocena vsaj ${m[3]}`))(m, n) },
  { vzorec: /\b(zelo rabljen\w*|za dele|za rezervne dele|pokvarjen\w*|za popravilo|v slabem stanju)\b/, uporabi: razvrsti("ocena", true, "od najslabšega stanja") },
  { vzorec: /\b(najboljs\w* stanj\w*|najboljs\w*)\b/, uporabi: razvrsti("ocena", false, "od najboljšega stanja") },

  // --- leto proizvodnje
  { vzorec: /\b(od|po|novejs\w* od|mlajs\w* od|letnik od)\s*((19|20)\d\d)\b/, uporabi: (m, n) => pravilaLeta(m, n, "od") },
  { vzorec: /\b(pred|starejs\w* od)\s*((19|20)\d\d)\b/, uporabi: (m, n) => pravilaLeta(m, n, "do") },
  { vzorec: /\b(letnik|iz leta|leto|letnika)\s*((19|20)\d\d)\b/, uporabi: (m, n) => pravilaLeta(m, n, "je") },
  { vzorec: /\b(najnovejs\w*|novejs\w*|mlajs\w*|mlad\w*|novej\w*)\b/, uporabi: razvrsti("leto", false, "od najnovejše") },
  { vzorec: /\b(najstarejs\w*|starejs\w*)\b/, uporabi: razvrsti("leto", true, "od najstarejše") },

  // --- datum prejema: »nova oprema«, »zadnje dodano«, »ta mesec«, »najdlje na zalogi«
  {
    vzorec: /\b(ta teden|ta mesec|zadnj\w* teden|zadnj\w* mesec|letos|zadnjih (\d+) dni)\b/,
    uporabi: (m, n) => {
      const dni = m[2] ? Number(m[2]) : /teden/.test(m[1]) ? 7 : /mesec/.test(m[1]) ? 31 : null;
      const od = dni ? predDnevi(dni) : `${new Date().getFullYear()}-01-01`;
      n.filtri.push(prejetoOd(od, `prejeto ${m[1]}`));
      n.razvrscanje ??= { po: "prejem", narascajoce: false, opis: "od zadnje prejete" };
    },
  },
  {
    vzorec: /\b(zadnj\w* dodan\w*|nazadnje dodan\w*|zadnj\w* prejet\w*|nazadnje prejet\w*|na novo dodan\w*|novo dodan\w*|nedavno\w*|pred kratkim|novo prispel\w*|sveze\w*|novost\w*|novitet\w*)\b/,
    uporabi: razvrsti("prejem", false, "od zadnje prejete"),
  },
  {
    vzorec: /\b(najdlje na zalogi|dolgo na zalogi|najdlje|stara zaloga|stare zaloge|staro zalogo|lezi\w*)\b/,
    uporabi: razvrsti("prejem", true, "od najdlje na zalogi"),
  },
  // »nova oprema«, »nove peči« = zadnje prejeto (»kot nova« in »skoraj nova« sta stanje - pravili zgoraj)
  { vzorec: /\b(nov|nova|novo|nove|novi|novih)\b/, uporabi: razvrsti("prejem", false, "od zadnje prejete") },

  // --- manjkajoči podatki (za urejanje) in status
  { vzorec: /\bbrez cen\w*\b/, uporabi: filter({ opis: "brez vpisane cene", ustreza: (o) => o.prodajna_cena == null }) },
  { vzorec: /\b(s ceno|z ceno|s cenami)\b/, uporabi: filter({ opis: "z vpisano ceno", ustreza: (o) => o.prodajna_cena != null }) },
  { vzorec: /\bbrez slik\w*\b/, uporabi: filter({ opis: "brez predstavne slike", ustreza: (o) => !o.predstavna_slika }) },
  { vzorec: /\bbrez ocen\w*\b/, uporabi: filter({ opis: "brez ocene stanja", ustreza: (o) => o.ocena == null }) },
  { vzorec: /\bni urejen\w*( za prodajo)?\b/, uporabi: filter(status("1. NI UREJENO ZA PRODAJO", "status: ni urejeno za prodajo")) },
  { vzorec: /\bni za prodajo\b/, uporabi: filter(status("0. NI ZA PRODAJO", "status: ni za prodajo")) },

  // --- garancija, razpoložljivost
  { vzorec: /\b(z garancij\w*|garancij\w*)\b/, uporabi: filter({ opis: "z garancijo", ustreza: (o) => (o.garancijski_rok_meseci ?? 0) > 0 }) },
  {
    vzorec: /\b(na voljo|naprodaj|za prodajo|takoj|prost\w*)\b/,
    uporabi: filter({ opis: "na voljo (neprodano, ni rezervirano)", ustreza: (o) => o.status_prodaje === "2. NEPRODANO" && !o.rezervirano }),
  },
  { vzorec: /\b(posojen\w*|na posoji|izposojen\w*)\b/, uporabi: filter({ opis: "posojeno", ustreza: (o) => o.status_prodaje === STATUS_POSOJENO }) },
  { vzorec: /\b(rezervir\w*)\b/, uporabi: filter({ opis: "rezervirano", ustreza: (o) => !!o.rezervirano }) },
];

function pravilaLeta(m: RegExpMatchArray, n: Namera, kako: "od" | "do" | "je") {
  const leto = Number(m[2]);
  const opis = kako === "od" ? `letnik od ${leto}` : kako === "do" ? `letnik do ${leto}` : `letnik ${leto}`;
  n.filtri.push({
    opis,
    vrednost: "leto",
    ustreza: (o) =>
      o.leto_proizvodnje != null &&
      (kako === "od" ? o.leto_proizvodnje >= leto : kako === "do" ? o.leto_proizvodnje <= leto : o.leto_proizvodnje === leto),
  });
  if (kako !== "je") n.razvrscanje ??= { po: "leto", narascajoce: false, opis: "od najnovejše" };
}

// Besede brez pomena za iskanje predmeta (ostanejo po odstranitvi namer)
const MASILA = /\b(koliko|imamo|pokazi|prikazi|vse|vsi|vseh|vsa|kateri\w*|katera|katere|kje|isc\w*|rabim|potrebujem|imate|imas|ali|je|so|kaj|kak\w*|neka\w*|eno|ena|en|za|in|z|s|v|na|pa|ki|mi|prosim|oprema|opreme|opremo|rabljen\w*|stanju|cena|ceni|eur|€)\b/g;

/** Razbere namere iz vprašanja. */
export function razberiNamere(vprasanje: string): Namera {
  let besedilo = normaliziraj(vprasanje);
  const n: Namera = { predmet: "", razvrscanje: null, filtri: [] };
  for (const p of PRAVILA) {
    const m = besedilo.match(p.vzorec);
    if (!m) continue;
    p.uporabi(m, n);
    besedilo = besedilo.replace(m[0], " ");
  }
  n.predmet = besedilo.replace(MASILA, " ").replace(/[^\p{L}\p{N}-]+/gu, " ").trim();
  return n;
}

/** Razvrsti (stabilno): oprema brez podatka na konec, sicer ostane vrstni red po podobnosti. */
export function razvrstiPoNameri<T extends OpremaVrstica>(oprema: T[], r: Razvrscanje): T[] {
  return oprema
    .map((o, i) => ({ o, i, v: vrednostKljuca(o, r.po) }))
    .sort((a, b) => {
      if (a.v == null || b.v == null) return a.v == null && b.v == null ? a.i - b.i : a.v == null ? 1 : -1;
      return a.v === b.v ? a.i - b.i : r.narascajoce ? a.v - b.v : b.v - a.v;
    })
    .map((x) => x.o);
}

export const brezPodatka = (oprema: OpremaVrstica[], k: Kljuc) => oprema.filter((o) => vrednostKljuca(o, k) == null).length;

// --- Skupina opreme iz vprašanja (»peč« -> vse peči, »etažna« -> Peč etažna, »napa« -> Napa)
// koren zaradi sklonov: »napa« -> »nap« (napa, nape), »pice« -> »pic«, »konvekcijska« -> »konve«
const korenBesede = (b: string) => (b.length >= 5 ? b.slice(0, 5) : b.length === 4 ? b.slice(0, 3) : b);
const besedePredmeta = (predmet: string) => predmet.split(/\s+/).filter((b) => b.length >= 3 && !/^\d/.test(b));
const ujemanje = (besede: string[], besedilo: string) => {
  const w = normaliziraj(besedilo).split(/[^\p{L}\p{N}]+/u).filter((x) => x.length >= 3 && x !== "ostalo");
  return besede.some((b) => w.some((x) => x.startsWith(korenBesede(b))));
};

/**
 * Koliko besed vprašanja se ujema s skupino ali nazivom opreme (»etažna peč« -> Peč etažna 2, Peč hitra 1).
 * Obdržimo opremo z največ ujemanji - tako »etažna peč« ne vrne vseh peči, »napa« pa vrne samo nape.
 */
export function tockePredmeta(o: OpremaVrstica, predmet: string): number {
  const besede = besedePredmeta(predmet);
  const besedilo = `${o.skupina_opreme ?? ""} ${o.oprema_naziv}`;
  return besede.filter((b) => ujemanje([b], besedilo)).length;
}
