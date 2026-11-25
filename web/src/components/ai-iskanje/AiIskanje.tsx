"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ChevronDown, ChevronUp, ImageOff, Search, Sparkles, X } from "lucide-react";
import { Button, ErrorText, Score, StatusBadge } from "@/components/ui";
import { prikazDatuma } from "@/lib/datum";
import { createClient } from "@/lib/supabase/client";
import type { OpremaSSliko } from "@/lib/types";
import { imaOznake, jeStetje, oznakeVprasanja, razsiriVprasanje } from "./iskanje";
import { brezPodatka, razberiNamere, razvrstiPoNameri, tockePredmeta, type Kljuc } from "./namere";
import { besediloOpreme, naloziModel, vektorji } from "./model";

// AI iskanje (poskusno). Odstranitev: glej README.md v tej mapi.

const PRODANO = "3. PRODANO";
const PAKET = 8; // koliko opreme naenkrat pretvori v vektorje (manjši paketi = odzivnejša stran)
const ST_ZADETKOV = 8;
// Brez ujemanja skupine / naziva: prikaži samo zadetke, ki so blizu najboljšemu (model sicer vedno vrne vse)
const RAZLIKA_PODOBNOSTI = 0.035;
const IMENA_KLJUCEV = { cena: "vpisane cene", ocena: "vpisane ocene", leto: "vpisanega leta proizvodnje", prejem: "vpisanega datuma prejema" } as const;
// Primeri pod iskalnim poljem (klik poišče)
const PRIMERI = ["poceni peč", "malo rabljena etažna peč", "nova oprema", "napa pod 3000 €", "najdlje na zalogi", "koliko je posojenih", "brez cene"];

const postavk = (n: number) => {
  const r = n % 100;
  return `${n} ${r === 1 ? "postavka" : r === 2 ? "postavki" : r === 3 || r === 4 ? "postavke" : "postavk"}`;
};

const evri = (n: number) => n.toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

export function AiIskanje({ oprema }: { oprema: OpremaSSliko[] }) {
  const [vprasanje, setVprasanje] = useState("");
  const [stanje, setStanje] = useState<string | null>(null); // besedilo med delom (nalaganje, priprava, iskanje)
  const [napaka, setNapaka] = useState<string | null>(null);
  const [zadetki, setZadetki] = useState<OpremaSSliko[] | null>(null);
  const [upostevano, setUpostevano] = useState<string[]>([]);
  const [vse, setVse] = useState(false);
  const [prikazi, setPrikazi] = useState<Kljuc | null>(null); // podatek, po katerem je razvrščeno (prikazan na zadetku)
  const [povzetek, setPovzetek] = useState<string | null>(null);

  function isci(e: FormEvent) {
    e.preventDefault();
    void poisci(vprasanje);
  }

  /** Model pretvori opremo v vektorje (novo / spremenjeno se shrani v bazo) in vrne opremo po podobnosti. */
  async function poPodobnosti(predmet: string, naVoljo: OpremaSSliko[]) {
    setStanje("Nalagam AI model ...");
    await naloziModel((p) => setStanje(`Nalagam AI model (samo prvič, ~120 MB): ${p} %`));
    const supabase = createClient();
    const { data: shranjeni, error } = await supabase.from("rbo_ai_vektor").select("id_oprema, besedilo");
    if (error) throw new Error(error.message);
    const obstojeci = new Map((shranjeni ?? []).map((r): [number, string] => [r.id_oprema, r.besedilo]));
    const zaPripravo = oprema.filter((o) => obstojeci.get(o.id_oprema) !== besediloOpreme(o));
    for (let i = 0; i < zaPripravo.length; i += PAKET) {
      setStanje(`Pripravljam opremo za iskanje: ${i} / ${zaPripravo.length}`);
      const paket = zaPripravo.slice(i, i + PAKET);
      const v = await vektorji(paket.map((o) => `passage: ${besediloOpreme(o)}`));
      const { error: napakaZapisa } = await supabase.from("rbo_ai_vektor").upsert(
        paket.map((o, j) => ({ id_oprema: o.id_oprema, besedilo: besediloOpreme(o), vektor: v[j], posodobljeno: new Date().toISOString() })),
        { onConflict: "id_oprema" },
      );
      if (napakaZapisa) throw new Error(napakaZapisa.message);
    }
    setStanje("Iščem ...");
    const [poizvedba] = await vektorji([`query: ${razsiriVprasanje(predmet)}`]);
    const { data, error: napakaIskanja } = await supabase.rpc("rbo_ai_isci", { poizvedba, stevilo: oprema.length });
    if (napakaIskanja) throw new Error(napakaIskanja.message);
    const poId = new Map(naVoljo.map((o) => [o.id_oprema, o]));
    return ((data ?? []) as { id_oprema: number; podobnost: number }[])
      .map((r) => ({ o: poId.get(r.id_oprema)!, p: r.podobnost }))
      .filter((r) => !!r.o);
  }

  async function poisci(vnos: string) {
    const besedilo = vnos.trim();
    if (!besedilo || stanje) return;
    setVprasanje(besedilo);
    setNapaka(null);
    setZadetki(null);
    try {
      // 1) Namere (cena, stanje, leto, datum prejema, status ...) in predmet iskanja
      const namera = razberiNamere(besedilo);
      const naVoljo = oprema.filter((o) => o.status_prodaje !== PRODANO);
      const oznake = oznakeVprasanja(besedilo, oprema);
      const tocke = new Map(naVoljo.map((o) => [o.id_oprema, namera.predmet ? tockePredmeta(o, namera.predmet) : 0]));
      const najvec = Math.max(0, ...tocke.values());

      // 2) Kaj iščemo: oznaka (FBM) > besede v skupini / nazivu (napa, etažna peč) > AI model (opis) > vse.
      //    AI model se naloži samo, ko je treba razumeti opis (npr. »nekaj za pekarno«).
      const upost: string[] = [];
      let kandidati: OpremaSSliko[];
      if (oznake.length > 0) {
        kandidati = naVoljo.filter((o) => imaOznake(o, oznake));
        upost.push(`oznaka ${oznake.map((z) => z.toUpperCase()).join(" + ")}`);
      } else if (najvec > 0) {
        kandidati = naVoljo.filter((o) => tocke.get(o.id_oprema) === najvec);
        const skupine = [...new Set(kandidati.map((o) => o.skupina_opreme).filter(Boolean))];
        upost.push(
          skupine.length === 0
            ? `naziv: ${kandidati.length === 1 ? kandidati[0].oprema_naziv : postavk(kandidati.length)}`
            : `skupina: ${skupine.slice(0, 3).join(", ")}${skupine.length > 3 ? ` in še ${skupine.length - 3}` : ""}`,
        );
      } else if (namera.predmet) {
        const podobni = await poPodobnosti(namera.predmet, naVoljo);
        const najboljsa = podobni[0]?.p ?? 0;
        // brez filtrov in razvrščanja samo najbližji; z njimi širši nabor, ki ga filtri nato zožijo
        const meja = namera.filtri.length > 0 || namera.razvrscanje ? RAZLIKA_PODOBNOSTI * 2 : RAZLIKA_PODOBNOSTI;
        kandidati = podobni.filter((r) => r.p >= najboljsa - meja).map((r) => r.o);
        upost.push(`AI: podobno »${namera.predmet}«`);
      } else {
        kandidati = naVoljo;
        upost.push("vsa oprema (brez prodane)");
      }

      // 3) Filtri (cena do, ocena vsaj, letnik, prejeto ...) - oprema brez vpisanega podatka ne ustreza; to povemo
      const opombe: string[] = [];
      for (const f of namera.filtri) {
        const pred = kandidati;
        kandidati = kandidati.filter(f.ustreza);
        upost.push(f.opis);
        if (f.vrednost) {
          const brez = brezPodatka(pred, f.vrednost);
          if (brez > 0) opombe.push(`${postavk(brez)} brez ${IMENA_KLJUCEV[f.vrednost]} ni upoštevanih`);
        }
      }
      // 4) Razvrščanje (poceni, malo rabljeno, nova oprema ...) - brez podatka na konec
      if (namera.razvrscanje) {
        kandidati = razvrstiPoNameri(kandidati, namera.razvrscanje);
        upost.push(`razvrščeno ${namera.razvrscanje.opis}`);
        const brez = brezPodatka(kandidati, namera.razvrscanje.po);
        if (brez > 0) opombe.push(`${postavk(brez)} brez ${IMENA_KLJUCEV[namera.razvrscanje.po]} je na koncu`);
      }

      const kolicina = kandidati.reduce((v, o) => v + (o.kolicina ?? 0), 0);
      setPovzetek(
        (jeStetje(besedilo)
          ? `Odgovor: ${postavk(kandidati.length)}` + (kolicina !== kandidati.length ? `, skupna količina ${kolicina}` : "")
          : `Najdeno: ${postavk(kandidati.length)}`) +
          " (brez prodane opreme)" +
          (opombe.length ? `. ${opombe.join("; ")}.` : "."),
      );
      setUpostevano(upost);
      setPrikazi(namera.razvrscanje?.po ?? null);
      setVse(false);
      setZadetki(kandidati);
    } catch (err) {
      setNapaka(`AI iskanje ni uspelo: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setStanje(null);
    }
  }

  return (
    <section aria-label="AI iskanje opreme" className="fp-card flex flex-col gap-3 p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fines-50 text-fines-500">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-base font-bold text-ink-900">Iščeš rabljeno opremo?</h2>
          <p className="text-sm text-ink-500">Napiši s svojimi besedami, kaj iščeš, AI poišče najbolj ustrezno opremo.</p>
        </div>
      </div>

      <form onSubmit={isci} className="flex flex-wrap items-end gap-3">
        <span className="relative min-w-0 flex-1 basis-64">
          <Search className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-ink-400" aria-hidden />
          <input
            type="search"
            value={vprasanje}
            onChange={(e) => setVprasanje(e.target.value)}
            placeholder="npr. konvekcijska peč za pekarno, malo rabljena"
            title="Opiši opremo, ki jo iščeš"
            aria-label="Kaj iščeš"
            disabled={!!stanje}
            suppressHydrationWarning
            className="h-10 w-full rounded-lg border border-ink-200 bg-white pl-8 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100 disabled:bg-ink-100"
          />
        </span>
        <Button type="submit" icon={Sparkles} disabled={!!stanje || !vprasanje.trim()} hint="Poišči opremo, ki ustreza opisu">
          Poišči
        </Button>
        {zadetki && (
          <Button variant="neutral" icon={X} onClick={() => setZadetki(null)} hint="Skrij rezultate AI iskanja">
            Počisti
          </Button>
        )}
      </form>

      {!zadetki && !stanje && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-ink-500">Primeri:</span>
          {PRIMERI.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => void poisci(p)}
              title={`Poišči: ${p}`}
              className="rounded-full border border-ink-200 bg-white px-2.5 py-0.5 text-xs font-medium text-ink-700 hover:border-fines-500 hover:text-fines-600"
            >
              {p}
            </button>
          ))}
        </div>
      )}
      {stanje && (
        <p role="status" className="text-sm font-medium text-sync-600">
          {stanje}
        </p>
      )}
      {napaka && <ErrorText>{napaka}</ErrorText>}

      {zadetki && upostevano.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" title="Kako je AI iskanje razumelo vprašanje">
          <span className="text-xs font-semibold text-ink-500">Upoštevano:</span>
          {upostevano.map((u) => (
            <span key={u} className="rounded-full border border-fines-200 bg-fines-50 px-2 py-0.5 text-xs font-semibold text-fines-700">
              {u}
            </span>
          ))}
        </div>
      )}

      {zadetki &&
        (zadetki.length === 0 ? (
          <p className="text-sm text-ink-500">{povzetek ?? "Ni opreme, ki bi ustrezala opisu."}</p>
        ) : (
          <>
            <p className="text-sm font-medium text-ink-700">{povzetek}</p>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {(vse ? zadetki : zadetki.slice(0, ST_ZADETKOV)).map((o) => (
                <li key={o.id_oprema}>
                  <Zadetek o={o} prikazi={prikazi} />
                </li>
              ))}
            </ul>
            {zadetki.length > ST_ZADETKOV && (
              <div>
                <Button
                  variant="neutral"
                  icon={vse ? ChevronUp : ChevronDown}
                  onClick={() => setVse((v) => !v)}
                  hint={vse ? "Prikaži samo najboljše zadetke" : "Prikaži vse najdene zadetke"}
                >
                  {vse ? "Prikaži manj" : `Prikaži vse (${zadetki.length})`}
                </Button>
              </div>
            )}
          </>
        ))}
    </section>
  );
}

function Zadetek({ o, prikazi }: { o: OpremaSSliko; prikazi: Kljuc | null }) {
  return (
    <Link
      href={`/oprema/${o.id_oprema}`}
      title={`Odpri opremo ID ${o.id_oprema}`}
      className="flex h-full gap-3 rounded-lg border border-ink-200 bg-white p-2 transition hover:border-fines-500 hover:shadow-md"
    >
      <span className="relative h-20 w-24 shrink-0 overflow-hidden rounded-md bg-ink-100">
        {o.slika_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- podpisani Supabase URL-ji
          <img src={o.slika_url} alt={o.oprema_naziv} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-ink-400">
            <ImageOff size={20} />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold text-ink-500">ID {o.id_oprema}</span>
          <StatusBadge status={o.status_prodaje} />
        </span>
        <span className="break-words text-sm font-bold leading-snug text-ink-900">{o.oprema_naziv}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {o.prodajna_cena != null && <span className="font-bold tabular-nums text-fines-600">{evri(o.prodajna_cena)}</span>}
          <Score value={o.ocena} />
          {o.leto_proizvodnje != null && (
            <span className={`tabular-nums ${prikazi === "leto" ? "font-bold text-ink-900" : "text-ink-500"}`} title="Leto proizvodnje">
              {o.leto_proizvodnje}
            </span>
          )}
        </span>
        {prikazi === "prejem" && o.datum_prejema && (
          <span className="text-xs text-ink-500">Prejeto {prikazDatuma(o.datum_prejema)}</span>
        )}
      </span>
    </Link>
  );
}
