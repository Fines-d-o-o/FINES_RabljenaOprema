"use client";

// Izbira roka (app_instructions.md, "Izbira roka"): datum, na katerega nekaj poteče oz. ob katerem
// pride obvestilo (posoja, rezervacija, veljavnost ...). Ena komponenta za vse projekte.
//
//   const rok = useIzbiraRoka({ do: zacetni.do, doPreklica: zacetni.doPreklica });
//   const r = izracunajRok(rok, od);           // { do, doPreklica, napaka }
//   <IzbiraRoka stanje={rok} od={od} label="Vrnitev" prikaziNapako={poskus} doNadaljnjega />

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { pristejDni, pristejMesece, prikazDatuma, razlikaDni, doRoka } from "@/lib/datum";
import { Field, TextInput } from "./Polja";
import { Lestvica } from "./Izbira";

export type NacinRoka = "datum" | "trajanje" | "preklic";
export type EnotaRoka = "dni" | "tednov" | "mesecev";

/** Stanje izbire roka (v oknu: osnutek, ki se ob Potrdi prenese v obrazec). */
export function useIzbiraRoka(zacetni: { do: string; doPreklica?: boolean }) {
  const [nacin, setNacin] = useState<NacinRoka>(zacetni.doPreklica ? "preklic" : "datum");
  const [datum, setDatum] = useState(zacetni.do);
  const [kolicina, setKolicina] = useState("");
  const [enota, setEnota] = useState<EnotaRoka>("tednov");
  return { nacin, setNacin, datum, setDatum, kolicina, setKolicina, enota, setEnota };
}

export type IzbiraRokaStanje = ReturnType<typeof useIzbiraRoka>;

/** Izračunan rok in napaka (prazno = v redu). od = začetek (npr. začetek posoje ali danes). */
export function izracunajRok(s: IzbiraRokaStanje, od: string): { do: string; doPreklica: boolean; napaka: string } {
  if (s.nacin === "preklic") return { do: "", doPreklica: true, napaka: "" };
  let rok = s.datum;
  if (s.nacin === "trajanje") {
    const n = Number(s.kolicina.replace(",", "."));
    if (!(Number.isInteger(n) && n > 0 && n <= 999)) return { do: "", doPreklica: false, napaka: "Vpiši trajanje (celo število)." };
    rok = !od
      ? ""
      : s.enota === "mesecev"
        ? pristejMesece(od, n)
        : pristejDni(od, s.enota === "tednov" ? n * 7 : n);
  }
  if (!rok) return { do: "", doPreklica: false, napaka: "Vpiši datum." };
  if (od && rok < od) return { do: rok, doPreklica: false, napaka: "Datum ne sme biti pred začetkom." };
  return { do: rok, doPreklica: false, napaka: "" };
}

const ENOTE: { value: EnotaRoka; label: string; hint: string }[] = [
  { value: "dni", label: "dni", hint: "Trajanje v dnevih" },
  { value: "tednov", label: "tednov", hint: "Trajanje v tednih" },
  { value: "mesecev", label: "mesecev", hint: "Trajanje v mesecih" },
];

/**
 * Izbira roka: način (Do datuma / Trajanje / po želji Do nadaljnjega), datum ali trajanje z enoto,
 * pod tem izračunan rok "datum (N dni)". Uporabi se v oknu (`Modal`) skupaj z `useIzbiraRoka`.
 */
export function IzbiraRoka({
  stanje: s,
  od,
  label,
  prikaziNapako,
  doNadaljnjega,
  opisPreklica = "Datum ni določen - velja do preklica.",
}: {
  stanje: IzbiraRokaStanje;
  /** Začetek, od katerega se šteje trajanje (in najmanjši dovoljen datum). */
  od: string;
  /** Naslov polja, npr. "Vrnitev", "Rezervirano do". */
  label: string;
  /** Pokaži napako (po prvem kliku Potrdi). */
  prikaziNapako?: boolean;
  /** Dovoli možnost "Do nadaljnjega" (brez roka - brez obvestila). */
  doNadaljnjega?: boolean;
  opisPreklica?: string;
}) {
  const r = izracunajRok(s, od);
  const nacini: { value: NacinRoka; label: string; hint: string }[] = [
    { value: "datum", label: "Do datuma", hint: `${label}: vpiši datum` },
    { value: "trajanje", label: "Trajanje", hint: `${label}: vpiši trajanje, datum se izračuna` },
    ...(doNadaljnjega
      ? [{ value: "preklic" as NacinRoka, label: "Do nadaljnjega", hint: `${label}: brez določenega datuma` }]
      : []),
  ];
  return (
    <Field label={label} required group error={prikaziNapako && r.napaka ? r.napaka : undefined}>
      <div className="flex flex-col gap-3">
        <div className="max-w-full overflow-x-auto">
          <Lestvica label={`${label} - način vnosa`} options={nacini} value={s.nacin} onChange={s.setNacin} />
        </div>
        {s.nacin === "datum" && (
          <TextInput
            type="date"
            value={s.datum}
            min={od || undefined}
            onChange={(e) => s.setDatum(e.target.value)}
            title={`${label}: datum`}
            aria-label={label}
          />
        )}
        {s.nacin === "trajanje" && (
          <div className="flex flex-wrap items-center gap-2">
            <TextInput
              inputMode="numeric"
              value={s.kolicina}
              onChange={(e) => s.setKolicina(e.target.value)}
              placeholder="npr. 2"
              className="!w-24 text-right"
              title={`${label}: trajanje (število)`}
              aria-label={`${label} - trajanje`}
            />
            <Lestvica label={`${label} - enota trajanja`} options={ENOTE} value={s.enota} onChange={s.setEnota} />
          </div>
        )}
        {s.nacin === "preklic" ? (
          <p className="text-sm text-ink-500">{opisPreklica}</p>
        ) : (
          r.do &&
          !r.napaka && (
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-700" title={`${label}: izračunan datum`}>
              <CalendarClock size={16} className="text-fines-500" aria-hidden />
              {label}: <span className="font-bold text-ink-900">{prikazDatuma(r.do)}</span>
              <span className="text-ink-500">
                ({od ? `${razlikaDni(od, r.do)} dni` : doRoka(r.do)})
              </span>
            </p>
          )
        )}
      </div>
    </Field>
  );
}
