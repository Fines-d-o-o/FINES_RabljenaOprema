"use client";

// Posoja (okno ob izbiri statusa "4. POSOJENO") in rezervacija opreme v razdelku Prodaja.

import { useState, type ReactNode } from "react";
import { Bookmark, Check, Handshake, Pencil, Undo2, X } from "lucide-react";
import { Button, Field, IzbiraRoka, Modal, TextInput, WarningText, izracunajRok, useIzbiraRoka } from "@/components/ui";
import { danes, doRoka, prikazDatuma } from "@/lib/datum";

export type Posoja = {
  od: string;
  do: string;
  doPreklica: boolean;
  podjetje: string;
  kontakt: string;
};

export const PRAZNA_POSOJA: Posoja = { od: "", do: "", doPreklica: false, podjetje: "", kontakt: "" };

const imaPodatke = (p: Posoja) => !!(p.od || p.do || p.doPreklica || p.podjetje);

/** Okno za vnos posoje: od kdaj, do kdaj (datum / trajanje / do nadaljnjega), komu. */
export function PosojaOkno({
  open,
  zacetna,
  onPotrdi,
  onPreklici,
}: {
  open: boolean;
  zacetna: Posoja;
  onPotrdi: (p: Posoja) => void;
  onPreklici: () => void;
}) {
  // Osnutek se ob vsakem odprtju napolni iz zadnjih potrjenih podatkov (komponenta se ob odprtju na novo ustvari)
  if (!open) return null;
  return <PosojaOknoVsebina zacetna={zacetna} onPotrdi={onPotrdi} onPreklici={onPreklici} />;
}

function PosojaOknoVsebina({
  zacetna,
  onPotrdi,
  onPreklici,
}: {
  zacetna: Posoja;
  onPotrdi: (p: Posoja) => void;
  onPreklici: () => void;
}) {
  const [od, setOd] = useState(zacetna.od || danes());
  const rok = useIzbiraRoka({ do: zacetna.do, doPreklica: zacetna.doPreklica });
  const vrnitev = izracunajRok(rok, od);
  const [podjetje, setPodjetje] = useState(zacetna.podjetje);
  const [kontakt, setKontakt] = useState(zacetna.kontakt);
  const [poskus, setPoskus] = useState(false);

  const napake = {
    od: !od ? "Vpiši, od kdaj je oprema posojena." : "",
    podjetje: !podjetje.trim() ? "Vpiši, komu je oprema posojena." : "",
  };
  const veljavno = !napake.od && !vrnitev.napaka && !napake.podjetje;

  function potrdi() {
    setPoskus(true);
    if (!veljavno) return;
    onPotrdi({ od, do: vrnitev.do, doPreklica: vrnitev.doPreklica, podjetje: podjetje.trim(), kontakt: kontakt.trim() });
  }

  const napaka = (k: keyof typeof napake) => (poskus ? napake[k] || undefined : undefined);

  return (
    <Modal
      open
      title="Posoja opreme"
      onClose={onPreklici}
      noga={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="neutral" hint="Zapri okno brez sprememb posoje" onClick={onPreklici}>
            Prekliči
          </Button>
          <Button variant="success" icon={Check} hint="Potrdi podatke o posoji opreme" onClick={potrdi}>
            Potrdi
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Posojeno od" required error={napaka("od")}>
          <TextInput type="date" value={od} onChange={(e) => setOd(e.target.value)} title="Datum začetka posoje" />
        </Field>

        <IzbiraRoka
          stanje={rok}
          od={od}
          label="Vrnitev"
          prikaziNapako={poskus}
          doNadaljnjega
          opisPreklica="Datum vrnitve ni določen - oprema je posojena do preklica."
        />

        <Field label="Komu je posojeno (podjetje)" required error={napaka("podjetje")}>
          <TextInput
            value={podjetje}
            onChange={(e) => setPodjetje(e.target.value)}
            placeholder="npr. Pekarna Novak d.o.o."
            title="Podjetje, ki si je opremo izposodilo"
          />
        </Field>
        <Field label="Kontakt">
          <TextInput
            value={kontakt}
            onChange={(e) => setKontakt(e.target.value)}
            placeholder="Ime, telefon ali e-mail"
            title="Kontaktna oseba pri podjetju"
          />
        </Field>
      </div>
    </Modal>
  );
}

/** Kartica stanja v razdelku Prodaja (posoja: modra, rezervacija: temno siva). */
function KarticaStanja({
  barva,
  ikona: Ikona,
  vsebina,
  gumbi,
  opozorila,
}: {
  barva: "posoja" | "rezervacija";
  ikona: typeof Handshake;
  vsebina: ReactNode;
  gumbi: ReactNode;
  opozorila?: ReactNode;
}) {
  const okvir = barva === "posoja" ? "border-sync-500 bg-sync-50" : "border-ink-400 bg-ink-50";
  const ikonaBarva = barva === "posoja" ? "text-sync-600" : "text-ink-700";
  return (
    <div className={`flex flex-col gap-2 rounded-lg border border-l-4 ${okvir} p-3`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-[min(100%,16rem)] flex-1 gap-3">
          <Ikona size={20} className={`mt-0.5 shrink-0 ${ikonaBarva}`} aria-hidden />
          {vsebina}
        </div>
        <div className="flex flex-wrap gap-2">{gumbi}</div>
      </div>
      {opozorila}
    </div>
  );
}

function Napake({ napake }: { napake: (string | undefined)[] }) {
  return napake.filter(Boolean).map((b) => (
    <span key={b} className="text-xs font-semibold text-nok-600">
      {b}
    </span>
  ));
}

/** Skrita polja posoje (oddajo se z obrazcem; strežnik jih upošteva samo pri statusu POSOJENO). */
function PosojaPolja({ p }: { p: Posoja }) {
  return (
    <>
      <input type="hidden" name="posojeno_od" value={p.od} />
      <input type="hidden" name="posojeno_do" value={p.doPreklica ? "" : p.do} />
      <input type="hidden" name="posojeno_do_preklica" value={p.doPreklica ? "1" : ""} />
      <input type="hidden" name="posojeno_podjetje" value={p.podjetje} />
      <input type="hidden" name="posojeno_kontakt" value={p.kontakt} />
    </>
  );
}

/** Povzetek posoje (podatki gredo v skrita polja obrazca). Shranjeno posojo se zaključi z gumbom. */
export function PosojaPovzetek({
  posoja,
  napake,
  onUredi,
  onZakljuci,
}: {
  posoja: Posoja;
  napake: (string | undefined)[];
  onUredi: () => void;
  /** Samo pri shranjeni posoji: odklene status (posoja se zaključi ob shranjevanju). */
  onZakljuci?: () => void;
}) {
  const potekla = !posoja.doPreklica && posoja.do && posoja.do < danes();
  return (
    <>
    <PosojaPolja p={posoja} />
    <KarticaStanja
      barva="posoja"
      ikona={Handshake}
      vsebina={
        imaPodatke(posoja) ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-ink-500">Posojeno</dt>
            <dd className="font-semibold text-ink-900">
              {prikazDatuma(posoja.od || null)} → {posoja.doPreklica ? "do nadaljnjega" : prikazDatuma(posoja.do || null)}
              {!posoja.doPreklica && posoja.do && (
                <span className={`ml-2 ${potekla ? "font-bold text-nok-600" : "font-normal text-ink-500"}`}>
                  ({doRoka(posoja.do)})
                </span>
              )}
            </dd>
            <dt className="text-ink-500">Komu</dt>
            <dd className="font-semibold text-ink-900 [overflow-wrap:anywhere]">
              {posoja.podjetje || "–"}
              {posoja.kontakt && <span className="font-normal text-ink-600"> · {posoja.kontakt}</span>}
            </dd>
          </dl>
        ) : (
          <p className="text-sm text-ink-700">Podatki o posoji niso vpisani.</p>
        )
      }
      gumbi={
        <>
          <Button variant="neutral" icon={Pencil} hint="Odpri okno za urejanje posoje" onClick={onUredi}>
            {imaPodatke(posoja) ? "Uredi" : "Vpiši posojo"}
          </Button>
          {onZakljuci && (
            <Button variant="primary" icon={Undo2} hint="Oprema je vrnjena - odkleni status prodaje" onClick={onZakljuci}>
              Zaključi posojo
            </Button>
          )}
        </>
      }
      opozorila={
        <>
          {potekla && <WarningText>Rok vrnitve je potekel - preveri, ali je oprema vrnjena.</WarningText>}
          <Napake napake={napake} />
        </>
      }
    />
    </>
  );
}

export type Rezervacija = { da: boolean; do: string; podjetje: string; kontakt: string };

export const PRAZNA_REZERVACIJA: Rezervacija = { da: false, do: "", podjetje: "", kontakt: "" };

/** Skrita polja rezervacije (vedno v obrazcu, da se odstranjena rezervacija shrani kot NE). */
export function RezervacijaPolja({ r }: { r: Rezervacija }) {
  return (
    <>
      <input type="hidden" name="rezervirano" value={r.da ? "1" : ""} />
      <input type="hidden" name="rezervirano_do" value={r.da ? r.do : ""} />
      <input type="hidden" name="rezervirano_podjetje" value={r.da ? r.podjetje : ""} />
      <input type="hidden" name="rezervirano_kontakt" value={r.da ? r.kontakt : ""} />
    </>
  );
}

/** Povzetek rezervacije: do kdaj, kdo; Uredi in Odstrani. */
export function RezervacijaPovzetek({
  r,
  napake,
  odstranitev,
  onUredi,
  onOdstrani,
}: {
  r: Rezervacija;
  napake: (string | undefined)[];
  /** Razlog, zakaj se rezervacija ob shranjevanju odstrani (posoja, prodaja). */
  odstranitev?: string;
  onUredi: () => void;
  onOdstrani: () => void;
}) {
  const potekla = !!r.do && r.do < danes();
  return (
    <KarticaStanja
      barva="rezervacija"
      ikona={Bookmark}
      vsebina={
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-ink-500">Rezervirano</dt>
          <dd className="font-semibold text-ink-900">
            do {prikazDatuma(r.do || null)}
            {r.do && (
              <span className={`ml-2 ${potekla ? "font-bold text-warn-700" : "font-normal text-ink-500"}`}>
                ({doRoka(r.do)})
              </span>
            )}
          </dd>
          <dt className="text-ink-500">Kdo</dt>
          <dd className="font-semibold text-ink-900 [overflow-wrap:anywhere]">
            {r.podjetje || "–"}
            {r.kontakt && <span className="font-normal text-ink-600"> · {r.kontakt}</span>}
          </dd>
        </dl>
      }
      gumbi={
        <>
          <Button variant="neutral" icon={Pencil} hint="Odpri okno za urejanje rezervacije" onClick={onUredi}>
            Uredi
          </Button>
          <Button variant="danger" icon={X} hint="Odstrani rezervacijo opreme" onClick={onOdstrani}>
            Odstrani
          </Button>
        </>
      }
      opozorila={
        <>
          {odstranitev ? (
            <WarningText>{odstranitev}</WarningText>
          ) : (
            potekla && <WarningText>Rezervacija je potekla - podaljšaj ali odstrani.</WarningText>
          )}
          <Napake napake={napake} />
        </>
      }
    />
  );
}

/** Okno za vnos rezervacije: do kdaj (IzbiraRoka od danes), podjetje, kontakt. */
export function RezervacijaOkno({
  open,
  zacetna,
  onPotrdi,
  onPreklici,
}: {
  open: boolean;
  zacetna: Rezervacija;
  onPotrdi: (r: Rezervacija) => void;
  onPreklici: () => void;
}) {
  if (!open) return null;
  return <RezervacijaOknoVsebina zacetna={zacetna} onPotrdi={onPotrdi} onPreklici={onPreklici} />;
}

function RezervacijaOknoVsebina({
  zacetna,
  onPotrdi,
  onPreklici,
}: {
  zacetna: Rezervacija;
  onPotrdi: (r: Rezervacija) => void;
  onPreklici: () => void;
}) {
  const rok = useIzbiraRoka({ do: zacetna.do });
  const veljaDo = izracunajRok(rok, danes());
  const [podjetje, setPodjetje] = useState(zacetna.podjetje);
  const [kontakt, setKontakt] = useState(zacetna.kontakt);
  const [poskus, setPoskus] = useState(false);
  const napakaPodjetje = !podjetje.trim() ? "Vpiši, kdo je rezerviral opremo." : "";

  function potrdi() {
    setPoskus(true);
    if (veljaDo.napaka || napakaPodjetje) return;
    onPotrdi({ da: true, do: veljaDo.do, podjetje: podjetje.trim(), kontakt: kontakt.trim() });
  }

  return (
    <Modal
      open
      title={zacetna.da ? "Uredi rezervacijo" : "Rezervacija opreme"}
      onClose={onPreklici}
      noga={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="neutral" hint="Zapri okno brez sprememb rezervacije" onClick={onPreklici}>
            Prekliči
          </Button>
          <Button variant="success" icon={Check} hint="Potrdi rezervacijo opreme" onClick={potrdi}>
            Potrdi
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <IzbiraRoka stanje={rok} od={danes()} label="Rezervirano do" prikaziNapako={poskus} />
        <Field label="Rezerviral (podjetje)" required error={poskus && napakaPodjetje ? napakaPodjetje : undefined}>
          <TextInput
            value={podjetje}
            onChange={(e) => setPodjetje(e.target.value)}
            placeholder="npr. Pekarna Novak d.o.o."
            title="Podjetje, ki je opremo rezerviralo"
          />
        </Field>
        <Field label="Kontakt">
          <TextInput
            value={kontakt}
            onChange={(e) => setKontakt(e.target.value)}
            placeholder="Ime, telefon ali e-mail"
            title="Kontaktna oseba pri podjetju"
          />
        </Field>
      </div>
    </Modal>
  );
}
