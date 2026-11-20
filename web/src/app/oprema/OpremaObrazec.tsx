"use client";

import { useActionState, useRef, useState, useTransition, type FormEvent } from "react";
import { Bookmark, Calculator } from "lucide-react";
import {
  Button,
  DaNe,
  Field,
  IconButton,
  Lestvica,
  Podrazdelek,
  SaveBar,
  ScorePicker,
  Section,
  Select,
  TextArea,
  TextInput,
  useSpremembeObrazca,
  WarningText,
} from "@/components/ui";
import {
  ENOTE_MERE,
  GARANCIJE,
  STATUSI,
  STATUS_POSOJENO,
  STATUS_PRODANO,
  obveznoObProdaji,
  type Sifranti,
} from "@/lib/sifranti";
import { danes } from "@/lib/datum";
import { NAMIG_SAMO_OGLED } from "@/lib/vloga";
import type { OpremaVrstica, ZapisDnevnika, ZapisKartoteke } from "@/lib/types";
import { shraniOpremo, type ShraniStanje } from "./actions";
import { Kartoteka } from "./Kartoteka";
import {
  PRAZNA_POSOJA,
  PRAZNA_REZERVACIJA,
  PosojaOkno,
  PosojaPovzetek,
  RezervacijaOkno,
  RezervacijaPolja,
  RezervacijaPovzetek,
  type Posoja,
  type Rezervacija,
} from "./PosojaRezervacija";
import { SkenNalepke } from "@/components/sken-nalepke/SkenNalepke";

const GARANCIJE_MOZNOSTI = GARANCIJE.map((m) => ({ value: m as number, label: `${m} mes.`, hint: `Garancija ${m} mesecev` }));

const niz = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));
// Število za vnosno polje: decimalna vejica, brez ločila tisočic (npr. 4,5)
const formatVnos = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

export function OpremaObrazec({
  oprema,
  sifranti,
  kartoteka,
  dnevnik,
  samoOgled = false,
}: {
  oprema?: OpremaVrstica;
  sifranti: Sifranti;
  kartoteka?: ZapisKartoteke[];
  dnevnik?: ZapisDnevnika[]; // avtomatski vnosi (samo obstoječa oprema)
  samoOgled?: boolean; // uporabnik brez pravic urejanja: vsa polja in gumbi za urejanje so onemogočeni
}) {
  const novo = !oprema;
  const [, startTransition] = useTransition();
  const [ocena, setOcena] = useState<number | null>(oprema?.ocena ?? null);
  const [status, setStatus] = useState<string | null>(oprema?.status_prodaje ?? null);
  const [cenaNove, setCenaNove] = useState(formatVnos(oprema?.cena_nove));
  const [rabat, setRabat] = useState(formatVnos(oprema?.rabat_procent));
  const [prodajnaCena, setProdajnaCena] = useState(formatVnos(oprema?.prodajna_cena));
  const zacetnaGarancija = oprema?.garancijski_rok_meseci ?? 0;
  const [imaGarancijo, setImaGarancijo] = useState(zacetnaGarancija > 0);
  const [garancija, setGarancija] = useState<number | null>(zacetnaGarancija > 0 ? zacetnaGarancija : null);
  const zacetnaPosoja: Posoja = oprema
    ? {
        od: niz(oprema.posojeno_od),
        do: niz(oprema.posojeno_do),
        doPreklica: !!oprema.posojeno_do_preklica,
        podjetje: niz(oprema.posojeno_podjetje),
        kontakt: niz(oprema.posojeno_kontakt),
      }
    : PRAZNA_POSOJA;
  const [posoja, setPosoja] = useState<Posoja>(zacetnaPosoja);
  // Okno posoje; statusPred = status pred izbiro POSOJENO (Prekliči ga vrne), null = odprto z gumbom Uredi
  const [oknoPosoje, setOknoPosoje] = useState<{ statusPred: string | null } | null>(null);
  const zacetnaRezervacija: Rezervacija = oprema?.rezervirano
    ? {
        da: true,
        do: niz(oprema.rezervirano_do),
        podjetje: niz(oprema.rezervirano_podjetje),
        kontakt: niz(oprema.rezervirano_kontakt),
      }
    : PRAZNA_REZERVACIJA;
  const [rezervacija, setRezervacija] = useState<Rezervacija>(zacetnaRezervacija);
  const [oknoRezervacije, setOknoRezervacije] = useState(false);
  // Shranjena posoja zaklene status in rezervacijo; "Zaključi posojo" ju odklene (posoja se zaključi ob shranjevanju)
  const [shranjenStatus, setShranjenStatus] = useState<string | null>(oprema?.status_prodaje ?? null);
  const [zakljucujemPosojo, setZakljucujemPosojo] = useState(false);
  const statusZaklenjen = shranjenStatus === STATUS_POSOJENO && !zakljucujemPosojo;
  const zaklepRezervacije =
    status === STATUS_POSOJENO
      ? "Oprema je posojena - rezervacija ni mogoča"
      : status === STATUS_PRODANO
        ? "Oprema je prodana - rezervacija ni mogoča"
        : null;
  const obrazec = useRef<HTMLFormElement>(null);
  const spremembe = useSpremembeObrazca(obrazec, [ocena, prodajnaCena, imaGarancijo, garancija, status, posoja, rezervacija]);
  // Po uspešnem shranjevanju so trenutne vrednosti novo izhodišče
  const [stanje, formAction, shranjujem] = useActionState<ShraniStanje, FormData>(async (prej, fd) => {
    const r = await shraniOpremo(prej, fd);
    if (r.ok) {
      const s = String(fd.get("status_prodaje") ?? "") || null;
      setShranjenStatus(s);
      setZakljucujemPosojo(false);
      // strežnik ob posoji / prodaji odstrani rezervacijo, ob drugem statusu počisti posojo
      if (s === STATUS_POSOJENO || s === STATUS_PRODANO) setRezervacija(PRAZNA_REZERVACIJA);
      if (s !== STATUS_POSOJENO) setPosoja(PRAZNA_POSOJA);
      // izhodišče sprememb šele po posodobitvi skritih polj
      requestAnimationFrame(spremembe.potrdi);
    }
    return r;
  }, {});

  // Prekliči: vrni vsa polja na zadnje shranjene vrednosti
  function ponastavi() {
    obrazec.current?.reset();
    setOcena(oprema?.ocena ?? null);
    setStatus(oprema?.status_prodaje ?? null);
    setCenaNove(formatVnos(oprema?.cena_nove));
    setRabat(formatVnos(oprema?.rabat_procent));
    setProdajnaCena(formatVnos(oprema?.prodajna_cena));
    setImaGarancijo(zacetnaGarancija > 0);
    setGarancija(zacetnaGarancija > 0 ? zacetnaGarancija : null);
    setPosoja(zacetnaPosoja);
    setOknoPosoje(null);
    setRezervacija(zacetnaRezervacija);
    setOknoRezervacije(false);
    setZakljucujemPosojo(false);
    requestAnimationFrame(spremembe.preracunaj);
  }

  const n = (s: string) => Number(s.replace(",", "."));
  const izracunana =
    cenaNove && rabat && Number.isFinite(n(cenaNove)) && Number.isFinite(n(rabat))
      ? Math.round(n(cenaNove) * (1 - n(rabat) / 100) * 100) / 100
      : null;

  // Brez samodejnega ponastavljanja obrazca po oddaji (React to naredi pri <form action>), da vnosi ostanejo.
  function oddaj(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  }

  const napaka = (k: string) => stanje.napake?.[k];
  const idProdaja = stanje.idProdaja ?? oprema?.id_prodaja;

  return (
    <form ref={obrazec} onSubmit={oddaj} onChange={spremembe.preracunaj} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id_oprema" value={niz(oprema?.id_oprema)} />
      <input type="hidden" name="id_prodaja" value={niz(idProdaja)} />

      {/* fieldset disabled onemogoči vsa polja in gumbe v razdelkih (display: contents ohrani postavitev) */}
      <fieldset disabled={samoOgled} className="contents">
      <Section title="Osnovni podatki">
        {/* nova oprema: desno sken serijske nalepke (na telefonu nad polji) */}
        <div className={novo ? "flex flex-col-reverse gap-4 lg:flex-row" : ""}>
        <div className="grid flex-1 content-start grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          <Field label="Naziv opreme" required error={napaka("oprema_naziv")} className="sm:col-span-2 2xl:col-span-3">
            <TextInput name="oprema_naziv" defaultValue={niz(oprema?.oprema_naziv)} placeholder="npr. FBM 40" required />
          </Field>
          <Field label="Ident (koda)">
            <TextInput name="koda" defaultValue={niz(oprema?.koda)} placeholder="npr. 100-601.1014" />
          </Field>
          <Field label="Serijska številka">
            <TextInput name="serijska_stevilka" defaultValue={niz(oprema?.serijska_stevilka)} placeholder="npr. 24.1234.123" />
          </Field>
          <Field label="Skupina opreme">
            <Select
              name="skupina_opreme"
              options={sifranti.skupina}
              placeholder="— izberi —"
              defaultValue={niz(oprema?.skupina_opreme)}
            />
          </Field>
          <Field label="Leto proizvodnje" error={napaka("leto_proizvodnje")}>
            <TextInput
              name="leto_proizvodnje"
              inputMode="numeric"
              defaultValue={niz(oprema?.leto_proizvodnje)}
              placeholder="npr. 2018"
            />
          </Field>
          <Field label="Datum prejema">
            <TextInput type="date" name="datum_prejema" defaultValue={oprema ? niz(oprema.datum_prejema) : danes()} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Količina" error={napaka("kolicina")}>
              <TextInput name="kolicina" inputMode="numeric" defaultValue={niz(oprema?.kolicina ?? 1)} />
            </Field>
            <Field label="EM">
              <Select name="em" options={ENOTE_MERE} placeholder="—" defaultValue={oprema ? niz(oprema.em) : "kos"} />
            </Field>
          </div>
        </div>
        {novo && <SkenNalepke skupine={sifranti.skupina} />}
        </div>
      </Section>

      <Section title="Stanje in lokacija">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Ocena stanja" error={napaka("ocena")} group className="sm:col-span-2">
            <ScorePicker name="ocena" value={ocena} onChange={setOcena} />
          </Field>
          <Field label="Lastništvo">
            <Select name="lastnistvo" options={sifranti.lastnistvo} placeholder="— izberi —" defaultValue={niz(oprema?.lastnistvo)} />
          </Field>
          <Field label="Skladišče">
            <Select name="skladisce" options={sifranti.skladisce} placeholder="— izberi —" defaultValue={niz(oprema?.skladisce)} />
          </Field>
          <Field label="Komentar" className="sm:col-span-2">
            <TextArea name="komentar" defaultValue={niz(oprema?.komentar)} placeholder="Stanje, posebnosti, kaj je treba urediti ..." />
          </Field>
        </div>
      </Section>

      <Section
        title="Prodaja"
        actions={
          !rezervacija.da && (
            <Button
              variant="primary"
              icon={Bookmark}
              disabled={!!zaklepRezervacije}
              hint={zaklepRezervacije ?? "Rezerviraj opremo za kupca"}
              onClick={() => setOknoRezervacije(true)}
            >
              Rezerviraj
            </Button>
          )
        }
      >
        <RezervacijaPolja r={rezervacija} />
        <div className="flex flex-col gap-6">
          {/* 1) Status in prodajalec + kartice posoje / rezervacije */}
          <Podrazdelek st={1} naslov="Status in prodajalec">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Status prodaje" error={napaka("status_prodaje")}>
                {/* zaklenjen select se ne odda: vrednost gre v skrito polje */}
                {statusZaklenjen && <input type="hidden" name="status_prodaje" value={niz(status)} />}
                <Select
                  name={statusZaklenjen ? undefined : "status_prodaje"}
                  options={[...STATUSI]}
                  placeholder="— izberi —"
                  value={niz(status)}
                  disabled={statusZaklenjen}
                  onChange={(e) => {
                    const nov = e.target.value || null;
                    // Ob izbiri POSOJENO se odpre okno za vnos posoje (podjetje predlaga iz rezervacije)
                    if (nov === STATUS_POSOJENO && status !== STATUS_POSOJENO) {
                      if (rezervacija.da && !posoja.podjetje) {
                        setPosoja({ ...posoja, podjetje: rezervacija.podjetje, kontakt: rezervacija.kontakt });
                      }
                      setOknoPosoje({ statusPred: status });
                    }
                    setStatus(nov);
                  }}
                  title={statusZaklenjen ? "Oprema je posojena - najprej zaključi posojo" : "Status prodaje opreme"}
                />
              </Field>
              <Field label="Imenovani prodajalec">
                <Select
                  name="imenovani_prodajalec"
                  options={
                    oprema?.imenovani_prodajalec && !sifranti.prodajalec.includes(oprema.imenovani_prodajalec)
                      ? [...sifranti.prodajalec, oprema.imenovani_prodajalec]
                      : sifranti.prodajalec
                  }
                  placeholder="— izberi —"
                  defaultValue={niz(oprema?.imenovani_prodajalec)}
                  title="Prodajalec, ki skrbi za prodajo (prejme opomnike o poteku)"
                />
              </Field>
            </div>
            {status === STATUS_POSOJENO && (
              <PosojaPovzetek
                posoja={posoja}
                napake={[napaka("posojeno_od"), napaka("posojeno_do"), napaka("posojeno_podjetje")]}
                onUredi={() => setOknoPosoje({ statusPred: STATUS_POSOJENO })}
                onZakljuci={
                  statusZaklenjen
                    ? () => {
                        setZakljucujemPosojo(true);
                        setStatus("2. NEPRODANO");
                      }
                    : undefined
                }
              />
            )}
            {zakljucujemPosojo && (
              <WarningText>
                Posoja bo zaključena ob shranjevanju (podatki ostanejo v kartoteki). Izberi nov status, npr. »3. PRODANO«.
              </WarningText>
            )}
            {rezervacija.da && (
              <RezervacijaPovzetek
                r={rezervacija}
                napake={[napaka("rezervirano_do"), napaka("rezervirano_podjetje")]}
                odstranitev={
                  status === STATUS_PRODANO
                    ? "Oprema bo prodana - rezervacija se ob shranjevanju odstrani."
                    : status === STATUS_POSOJENO
                      ? "Oprema bo posojena - rezervacija se ob shranjevanju odstrani."
                      : undefined
                }
                onUredi={() => setOknoRezervacije(true)}
                onOdstrani={() => setRezervacija(PRAZNA_REZERVACIJA)}
              />
            )}
          </Podrazdelek>

          {/* 2) Cena */}
          <Podrazdelek st={2} naslov="Cena">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Cena nove (€)" error={napaka("cena_nove")}>
                <TextInput
                  name="cena_nove"
                  inputMode="decimal"
                  value={cenaNove}
                  onChange={(e) => setCenaNove(e.target.value)}
                  title="Cena nove enake opreme"
                />
              </Field>
              <Field label="Rabat (%)" error={napaka("rabat_procent")}>
                <TextInput
                  name="rabat_procent"
                  inputMode="decimal"
                  value={rabat}
                  onChange={(e) => setRabat(e.target.value)}
                  title="Popust glede na ceno nove"
                />
              </Field>
              <Field label="Prodajna cena (€)" error={napaka("prodajna_cena")}>
                <div className="flex gap-2">
                  <TextInput
                    name="prodajna_cena"
                    inputMode="decimal"
                    value={prodajnaCena}
                    onChange={(e) => setProdajnaCena(e.target.value)}
                    placeholder={izracunana !== null ? `izračun: ${izracunana}` : ""}
                    title="Cena, po kateri se oprema prodaja"
                  />
                  <IconButton
                    variant="primary"
                    icon={Calculator}
                    disabled={izracunana === null}
                    hint="Izračunaj prodajno ceno iz cene in rabata"
                    onClick={() => izracunana !== null && setProdajnaCena(formatVnos(izracunana))}
                  />
                </div>
              </Field>
            </div>
          </Podrazdelek>

          {/* 3) Garancija */}
          <Podrazdelek st={3} naslov="Garancija">
            <Field label="Ali ima oprema garancijo" error={napaka("garancijski_rok_meseci")} group>
              {/* NE = 0 mesecev; DA brez izbranega roka = prazno (napaka ob shranjevanju) */}
              <input type="hidden" name="garancijski_rok_meseci" value={imaGarancijo ? niz(garancija) : "0"} />
              <div className="flex flex-wrap items-center gap-3">
                <DaNe
                  label="Ali ima oprema garancijo"
                  value={imaGarancijo}
                  onChange={setImaGarancijo}
                  hintDa="Oprema ima garancijo - izberi rok"
                  hintNe="Oprema nima garancije"
                />
                <Lestvica
                  label="Garancijski rok"
                  options={GARANCIJE_MOZNOSTI}
                  value={garancija}
                  onChange={setGarancija}
                  zaklenjeno={!imaGarancijo}
                  zaklenjenoHint="Za izbiro roka najprej izberi DA"
                />
                {imaGarancijo && garancija !== null && !(GARANCIJE as readonly number[]).includes(garancija) && (
                  <span className="text-sm text-ink-500">Trenutno {garancija} mesecev</span>
                )}
              </div>
            </Field>
          </Podrazdelek>

          {/* 4) Kupec in datum prodaje (poudarjeno, ko je oprema prodana) */}
          <Podrazdelek st={4} naslov="Kupec in datum prodaje" poudarjen={status === STATUS_PRODANO}>
            {status === STATUS_PRODANO && shranjenStatus !== STATUS_PRODANO && (
              <WarningText>Oprema bo označena kot prodana: vpiši kupca in datum prodaje ter shrani.</WarningText>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field
                label="Kupec"
                required={obveznoObProdaji("kupec", status, oprema)}
                error={napaka("kupec")}
                className="sm:col-span-2"
              >
                <TextInput
                  name="kupec"
                  defaultValue={niz(oprema?.kupec)}
                  placeholder="npr. Pekarna Novak d.o.o., Ljubljana"
                  title="Komu je bila oprema prodana"
                />
              </Field>
              <Field
                label="Datum prodaje"
                required={obveznoObProdaji("datum_prodaje", status, oprema)}
                error={napaka("datum_prodaje")}
              >
                <TextInput type="date" name="datum_prodaje" defaultValue={niz(oprema?.datum_prodaje)} title="Datum prodaje opreme" />
              </Field>
            </div>
          </Podrazdelek>

          {/* 5) Komentar */}
          <Podrazdelek st={5} naslov="Komentar ob prodaji">
            <TextArea
              name="komentar_ob_prodaji"
              rows={3}
              defaultValue={niz(oprema?.komentar_ob_prodaji)}
              placeholder="Dogovori s kupcem, posebnosti prodaje ..."
              aria-label="Komentar ob prodaji"
            />
          </Podrazdelek>
        </div>
      </Section>
      </fieldset>

      <PosojaOkno
        open={oknoPosoje !== null}
        zacetna={posoja}
        onPotrdi={(p) => {
          setPosoja(p);
          setOknoPosoje(null);
        }}
        onPreklici={() => {
          // Prekliči ob izbiri statusa: status se vrne na prejšnjega
          if (oknoPosoje && oknoPosoje.statusPred !== STATUS_POSOJENO) setStatus(oknoPosoje.statusPred);
          setOknoPosoje(null);
        }}
      />
      <RezervacijaOkno
        open={oknoRezervacije}
        zacetna={rezervacija}
        onPotrdi={(r) => {
          setRezervacija(r);
          setOknoRezervacije(false);
        }}
        onPreklici={() => setOknoRezervacije(false)}
      />

      <Kartoteka idOprema={oprema?.id_oprema} zacetniZapisi={kartoteka} dnevnik={dnevnik} samoOgled={samoOgled} />

      <SaveBar
        steviloSprememb={spremembe.stevilo}
        shranjujem={shranjujem}
        onReset={ponastavi}
        sporocilo={stanje.sporocilo ? { ok: !!stanje.ok, besedilo: stanje.sporocilo } : undefined}
        shraniLabel={novo ? "Dodaj opremo" : "Shrani"}
        shraniHint={novo ? "Shrani novo rabljeno opremo v bazo" : "Shrani spremembe rabljene opreme"}
        onemogoceno={samoOgled ? NAMIG_SAMO_OGLED : undefined}
      />
    </form>
  );
}
