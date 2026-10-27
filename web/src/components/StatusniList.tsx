"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, Printer, Tag } from "lucide-react";
import { Button, Modal, useToast } from "@/components/ui";
import {
  A4_MM,
  BARVE,
  KARTICA,
  MM_V_PX,
  OZNAKA,
  POLJA,
  POSTAVITEV as P,
  SIRINA_OPISA,
  STANJA,
  VREDNOST_Y,
  podatkiStatusnegaLista,
  potKljukice,
  potPolnila,
  stolpecStanja,
  velikeCrke,
  visinaVrstice,
  type Okvir,
  type PodatkiStatusnegaLista,
} from "@/lib/statusniList";
import type { OpremaVrstica } from "@/lib/types";

const PISAVA = 'Calibri, Carlito, "Segoe UI", Arial, sans-serif';

const mm = (v: number) => `${v}mm`;

// Besedilo, postavljeno v mm (vrstica visoka visinaVrstice(pt), besedilo navpično na sredini vrstice)
function Tekst({
  x,
  y,
  pt,
  children,
  style,
}: {
  x: number;
  y: number;
  pt: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: mm(x),
        top: mm(y),
        fontSize: `${pt}pt`,
        lineHeight: mm(visinaVrstice(pt)),
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Besedilo, omejeno na število vrstic (preostanek se skrije s tropičjem)
const omejeno = (vrstic: number, pt: number): CSSProperties => ({
  display: "-webkit-box",
  WebkitLineClamp: vrstic,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  whiteSpace: "pre-line",
  overflowWrap: "anywhere",
  fontSize: `${pt}pt`,
  lineHeight: mm(visinaVrstice(pt)),
});

const SENCA = `0 ${mm(KARTICA.sencaY)} ${mm(1.2)} rgb(0 0 0 / ${KARTICA.sencaMoc + 0.04})`;

// Zaobljena kartica z rahlo senco (absolutno postavljena v mm)
function Kartica({
  o,
  barva = BARVE.kartica,
  rob = BARVE.karticaRob,
  debelinaRoba = KARTICA.rob,
  r = KARTICA.r,
  senca = true,
  children,
}: {
  o: Okvir;
  barva?: string;
  rob?: string | null;
  debelinaRoba?: number;
  r?: number;
  senca?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: mm(o.x),
        top: mm(o.y),
        width: mm(o.w),
        height: mm(o.h),
        background: barva,
        border: rob ? `${mm(debelinaRoba)} solid ${rob}` : undefined,
        borderRadius: mm(r),
        boxShadow: senca ? SENCA : undefined,
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}

// Oznaka v kartici zgoraj levo (velike črke, siva, krepko); koordinate so relativne na kartico
function Oznaka({ children, barva = BARVE.oznaka, x = OZNAKA.x }: { children: string; barva?: string; x?: number }) {
  return (
    <Tekst x={x} y={OZNAKA.y} pt={OZNAKA.pt} style={{ color: barva, fontWeight: 700, letterSpacing: "0.04em" }}>
      {velikeCrke(children)}
    </Tekst>
  );
}

/** Statusni list v merilu 1:1 (A4 v mm) – isti element za predogled (pomanjšan) in tisk. */
export function StatusniListA4({ p }: { p: PodatkiStatusnegaLista }) {
  const n = P.nalepka;
  const r = P.razdelek;
  return (
    <div
      style={{
        position: "relative",
        width: mm(A4_MM.w),
        height: mm(A4_MM.h - 0.5), // brez prazne druge strani zaradi zaokroževanja pri tisku
        overflow: "hidden",
        background: "#fff",
        color: BARVE.besedilo,
        fontFamily: PISAVA,
      }}
    >
      {/* Glava: logo, naslov podjetja, kontakt */}
      {/* eslint-disable-next-line @next/next/no-img-element -- natisne se brez optimizacije slik */}
      <img
        src="/fines-logo.png"
        alt="FINES"
        style={{ position: "absolute", left: mm(P.logo.x), top: mm(P.logo.y), width: mm(P.logo.w), height: mm(P.logo.h) }}
      />
      <Tekst x={P.geslo.x} y={P.geslo.y} pt={P.geslo.pt} style={{ color: BARVE.oranzna, letterSpacing: "0.02em" }}>
        {P.geslo.besedilo}
      </Tekst>
      {P.naslov.vrstice.map((v, i) => (
        <Tekst
          key={v}
          x={P.naslov.x}
          y={P.naslov.y + i * visinaVrstice(P.naslov.pt)}
          pt={P.naslov.pt}
          style={{ fontWeight: 700, color: BARVE.glava }}
        >
          {v}
        </Tekst>
      ))}
      {P.kontakt.vrstice.map(([crka, v], i) => (
        <Tekst
          key={v}
          x={P.kontakt.x}
          y={P.kontakt.y + i * visinaVrstice(P.kontakt.pt)}
          pt={P.kontakt.pt}
          style={{ fontWeight: 700, color: BARVE.glava }}
        >
          <span style={{ display: "inline-block", width: mm(5), color: BARVE.oranzna }}>{crka}</span>
          {v}
        </Tekst>
      ))}

      {/* Rumen pas z naslovom */}
      <Kartica o={P.pas} barva={BARVE.pas} rob={null} r={P.pas.r}>
        <div
          style={{
            display: "flex",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
            fontSize: `${P.pas.pt}pt`,
            fontWeight: 700,
            color: BARVE.temna,
            letterSpacing: "0.02em",
          }}
        >
          {P.pas.besedilo}
        </div>
      </Kartica>

      {/* Razdelki: oranžna značka s številko, naslov, tanka črta */}
      {P.razdelki.map((raz) => (
        <div
          key={raz.besedilo}
          style={{
            position: "absolute",
            left: mm(r.x),
            top: mm(raz.y),
            width: mm(r.do - r.x),
            height: mm(r.znacka),
            display: "flex",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: mm(r.znacka),
              height: mm(r.znacka),
              borderRadius: mm(1.5),
              background: BARVE.oranzna,
              color: BARVE.bela,
              fontSize: `${r.stPt}pt`,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {raz.st}
          </div>
          <div style={{ marginLeft: mm(2.5), fontSize: `${r.pt}pt`, fontWeight: 700, whiteSpace: "nowrap" }}>{raz.besedilo}</div>
          <div style={{ marginLeft: mm(3), flex: 1, height: mm(0.3), background: BARVE.karticaRob }} />
        </div>
      ))}

      {/* Prostor za nalepko IDENT (točno 60 × 50 mm); brez nalepke ostaneta naziv in šifra */}
      <Kartica o={n.okvir}>
        <Tekst
          x={0}
          y={n.naslovY}
          pt={n.naslovPt}
          style={{ width: "100%", textAlign: "center", fontWeight: 700, color: BARVE.oznaka, letterSpacing: "0.04em" }}
        >
          {n.naslov}
        </Tekst>
        {(
          [
            [p.naziv, n.nazivY, n.nazivPt, n.nazivVrstic],
            [p.ident, n.sifraY, n.sifraPt, n.sifraVrstic],
          ] as const
        ).map(([besedilo, y, pt, vrstic]) => (
          <div
            key={y}
            style={{
              position: "absolute",
              left: mm(OZNAKA.x),
              right: mm(OZNAKA.x),
              top: mm(y),
              textAlign: "center",
              fontWeight: 700,
              ...omejeno(vrstic, pt),
            }}
          >
            {besedilo}
          </div>
        ))}
      </Kartica>

      {/* Polja: oznaka zgoraj, vrednost krepko */}
      {POLJA.map(({ oznaka, kljuc, okvir: o, pt, vrstic }) => (
        <Kartica key={kljuc} o={o}>
          <Oznaka>{oznaka}</Oznaka>
          <div
            style={{
              position: "absolute",
              left: mm(OZNAKA.x),
              right: mm(OZNAKA.x),
              top: mm(VREDNOST_Y),
              fontWeight: 700,
              ...omejeno(vrstic, pt),
            }}
          >
            {String(p[kljuc] ?? "")}
          </div>
        </Kartica>
      ))}

      {/* Stanje blaga: kartica izbrane ocene je zelena s kljukico */}
      {STANJA.map((s, i) => {
        const st = stolpecStanja(i);
        const izbrana = p.ocena === s.ocena;
        const k = st.krog;
        const kl = st.kljukica;
        return (
          <div key={s.ocena}>
            <Kartica
              o={st.kartica}
              barva={izbrana ? BARVE.izbranaOzadje : BARVE.kartica}
              rob={izbrana ? BARVE.izbranaRob : BARVE.karticaRob}
              debelinaRoba={izbrana ? 0.6 : KARTICA.rob}
            />
            <svg
              style={{ position: "absolute", left: 0, top: 0, width: mm(A4_MM.w), height: mm(A4_MM.h), overflow: "visible" }}
              viewBox={`0 0 ${A4_MM.w} ${A4_MM.h}`}
              aria-hidden
            >
              <g transform={`translate(${k.cx} ${k.cy})`}>
                <circle r={k.r} fill={BARVE.krog} />
                {s.polnilo >= 1 ? <circle r={k.r} fill={BARVE.polnilo} /> : <path d={potPolnila(k.r, s.polnilo)} fill={BARVE.polnilo} />}
                <circle r={k.r} fill="none" stroke={BARVE.krogRob} strokeWidth={0.4} />
              </g>
              {izbrana && (
                <g transform={`translate(${kl.cx} ${kl.cy})`}>
                  <circle r={kl.r} fill={BARVE.izbranaRob} />
                  <path d={potKljukice(kl.r)} fill="none" stroke={BARVE.bela} strokeWidth={0.5} strokeLinecap="round" strokeLinejoin="round" />
                </g>
              )}
            </svg>
            <Tekst
              x={st.besediloX - SIRINA_OPISA / 2}
              y={st.stevilkaY}
              pt={P.stanje.stevilkaPt}
              style={{
                width: mm(SIRINA_OPISA),
                textAlign: "center",
                fontWeight: 700,
                color: izbrana ? BARVE.izbranaRob : BARVE.besedilo,
              }}
            >
              {s.ocena}
            </Tekst>
            {s.opis.map((v, j) => (
              <Tekst
                key={v}
                x={st.besediloX - SIRINA_OPISA / 2}
                y={st.opisY[j]}
                pt={P.stanje.opisPt + 0.5} // Calibri je ožja od DejaVu v PDF
                style={{ width: mm(SIRINA_OPISA), textAlign: "center" }}
              >
                {v}
              </Tekst>
            ))}
          </div>
        );
      })}

      {/* ID opreme v temni kartici */}
      <Kartica o={P.id} barva={BARVE.temna} rob={null} r={P.id.r}>
        <Oznaka barva={BARVE.oranznaSvetla} x={4}>
          {P.id.oznaka}
        </Oznaka>
        <Tekst x={4} y={VREDNOST_Y - 0.5} pt={P.id.pt} style={{ color: BARVE.bela, fontWeight: 700 }}>
          {p.id}
        </Tekst>
      </Kartica>

      <div
        style={{
          position: "absolute",
          left: mm(r.x),
          top: mm(P.noga.crtaY),
          width: mm(r.do - r.x),
          height: mm(0.25),
          background: BARVE.karticaRob,
        }}
      />
      <Tekst x={r.x} y={P.noga.y} pt={P.noga.pt} style={{ color: BARVE.oznaka }}>
        {P.noga.levo}
      </Tekst>
      <Tekst x={r.do - 30} y={P.noga.y} pt={P.noga.pt} style={{ width: mm(30), textAlign: "right", color: BARVE.oznaka }}>
        {P.noga.desno}
      </Tekst>
    </div>
  );
}

// Predogled: list se pomanjša na širino okna (ohrani razmerje A4)
function Predogled({ p }: { p: PodatkiStatusnegaLista }) {
  const ref = useRef<HTMLDivElement>(null);
  const [skala, setSkala] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSkala(e.contentRect.width / (A4_MM.w * MM_V_PX)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="mx-auto w-full max-w-[794px]">
      <div
        className="relative overflow-hidden rounded-sm shadow-md ring-1 ring-ink-200"
        style={{ height: A4_MM.h * MM_V_PX * skala }}
      >
        {skala > 0 && (
          <div style={{ transform: `scale(${skala})`, transformOrigin: "top left" }}>
            <StatusniListA4 p={p} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Gumb "Statusni list" na strani opreme: odpre predogled s Prenesi PDF in Natisni. */
export function StatusniListGumb({ oprema }: { oprema: OpremaVrstica }) {
  const [odprt, setOdprt] = useState(false);
  const [delam, setDelam] = useState(false);
  const obvesti = useToast();
  // datum je datum tiska: izračuna se ob odprtju predogleda
  const [p, setP] = useState<PodatkiStatusnegaLista | null>(null);

  function odpri() {
    setP(podatkiStatusnegaLista(oprema));
    setOdprt(true);
  }

  async function prenesi() {
    if (!p) return;
    setDelam(true);
    try {
      await (await import("@/lib/pdf")).prenesiStatusniList(p);
    } catch (e) {
      obvesti("error", `Ni uspelo: ${e instanceof Error ? e.message : e}`);
    } finally {
      setDelam(false);
    }
  }

  return (
    <>
      <Button variant="neutral" icon={Tag} hint="Odpri predogled statusnega lista za tisk" onClick={odpri}>
        Statusni list
      </Button>
      <Modal
        open={odprt && !!p}
        title="Statusni list"
        onClose={() => setOdprt(false)}
        sirina="max-w-3xl"
        noga={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="primary"
              icon={delam ? Loader2 : Download}
              className={delam ? "[&>svg]:animate-spin" : ""}
              disabled={delam}
              hint="Prenesi statusni list kot PDF"
              onClick={prenesi}
            >
              Prenesi PDF
            </Button>
            <Button variant="primary" icon={Printer} hint="Natisni statusni list na izbran tiskalnik" onClick={() => window.print()}>
              Natisni
            </Button>
          </div>
        }
      >
        {p && <Predogled p={p} />}
      </Modal>
      {/* Kopija za tisk v merilu 1:1; na zaslonu skrita, pri tisku edina vidna (globals.css, .fp-tisk) */}
      {odprt && p && createPortal(<div className="fp-tisk"><StatusniListA4 p={p} /></div>, document.body)}
    </>
  );
}
