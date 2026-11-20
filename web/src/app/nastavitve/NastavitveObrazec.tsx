"use client";

import Link from "next/link";
import { useActionState, useRef, useState, useTransition, type FormEvent } from "react";
import { BellRing, CheckCircle2, Mail, Plus, Send, Trash2, XCircle } from "lucide-react";
import {
  Button,
  DaNe,
  Field,
  IconButton,
  Section,
  SaveBar,
  TextInput,
  WarningText,
  useSpremembeObrazca,
  useToast,
} from "@/components/ui";
import type { NastavitveOpomnikov, Prodajalec } from "@/lib/opomniki";
import { NAMIG_SAMO_OGLED } from "@/lib/vloga";
import { posljiOpomnikeZdaj, posljiTestniEmail, shraniNastavitve, type NastavitveStanje } from "./actions";

export type PoslanOpomnik = {
  id: number;
  vrsta: string;
  id_oprema: number | null;
  naziv: string | null;
  rok: string | null;
  prejemniki: string | null;
  testni: boolean;
  poslano: string;
  poslal: string | null;
  napaka: string | null;
};

// prej = ime, kot je shranjeno (prazno pri novem prodajalcu); drugačno ime = preimenovanje
type Vrstica = { naziv: string; prej: string; email: string; prejema_opomnike: boolean; aktiven: boolean };

const vVrstice = (p: Prodajalec[]): Vrstica[] =>
  p.map((x) => ({
    naziv: x.naziv,
    prej: x.naziv,
    email: x.email ?? "",
    prejema_opomnike: x.prejema_opomnike,
    aktiven: x.aktiven,
  }));

const datumSl = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join(".") : "");
const casSl = (t: string) =>
  new Date(t).toLocaleString("sl-SI", {
    timeZone: "Europe/Ljubljana",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const VRSTE: Record<string, string> = { posoja: "Posoja", rezervacija: "Rezervacija", test: "Testni e-mail" };

function Kljukica({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-ink-700" title={hint}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 cursor-pointer accent-fines-500 disabled:cursor-not-allowed"
      />
      {label}
    </label>
  );
}

function StanjePovezave({ ok, naslov, opis }: { ok: boolean; naslov: string; opis: string }) {
  const Ikona = ok ? CheckCircle2 : XCircle;
  return (
    <li className="flex items-start gap-2 text-sm" title={opis}>
      <Ikona className={`mt-0.5 h-4 w-4 shrink-0 ${ok ? "text-ok-600" : "text-nok-600"}`} aria-hidden />
      <span>
        <b className="text-ink-800">{naslov}:</b> <span className="text-ink-600">{ok ? "nastavljeno" : opis}</span>
      </span>
    </li>
  );
}

export function NastavitveObrazec({
  prodajalci: zacetni,
  nastavitve,
  poslani,
  samoOgled,
  povezava,
}: {
  prodajalci: Prodajalec[];
  nastavitve: NastavitveOpomnikov;
  poslani: PoslanOpomnik[];
  samoOgled: boolean;
  povezava: { webhook: boolean; cron: boolean };
}) {
  const obvesti = useToast();
  const [prodajalci, setProdajalci] = useState<Vrstica[]>(() => vVrstice(zacetni));
  const [odstranjeni, setOdstranjeni] = useState<string[]>([]);
  const [testniNacin, setTestniNacin] = useState(nastavitve.testniNacin);
  const [, startTransition] = useTransition();
  const [posiljam, setPosiljam] = useState<"test" | "zdaj" | null>(null);

  const obrazec = useRef<HTMLFormElement>(null);
  const spremembe = useSpremembeObrazca(obrazec, [prodajalci, odstranjeni, testniNacin]);
  const [stanje, formAction, shranjujem] = useActionState<NastavitveStanje, FormData>(async (prej, fd) => {
    const r = await shraniNastavitve(prej, fd);
    if (r.ok) {
      // shranjeno ime postane izhodišče, odstranjeni so shranjeni
      setProdajalci((p) => p.map((x) => ({ ...x, naziv: x.naziv.trim(), prej: x.naziv.trim() })));
      setOdstranjeni([]);
      requestAnimationFrame(spremembe.potrdi);
    }
    return r;
  }, {});
  const napaka = (k: string) => stanje.napake?.[k];

  function oddaj(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  }

  function ponastavi() {
    obrazec.current?.reset();
    setProdajalci(vVrstice(zacetni));
    setOdstranjeni([]);
    setTestniNacin(nastavitve.testniNacin);
    requestAnimationFrame(spremembe.preracunaj);
  }

  const uredi = (i: number, sprememba: Partial<Vrstica>) =>
    setProdajalci((p) => p.map((x, j) => (j === i ? { ...x, ...sprememba } : x)));

  // Odstrani: nov (neshranjen) se samo umakne, shranjen se ob shranjevanju skrije (ostane v bazi in pri opremi)
  function odstrani(i: number) {
    const p = prodajalci[i];
    if (p.prej) setOdstranjeni((o) => [...o, p.prej]);
    setProdajalci((v) => v.filter((_, j) => j !== i));
  }

  async function poslji(kaj: "test" | "zdaj") {
    setPosiljam(kaj);
    try {
      const r = kaj === "test" ? await posljiTestniEmail() : await posljiOpomnikeZdaj();
      obvesti(r.ok ? "success" : "error", r.sporocilo, 8000);
    } finally {
      setPosiljam(null);
    }
  }

  // Pošiljanje je mogoče samo s shranjenimi nastavitvami in nastavljenim flowom
  const zakajNePoslji = samoOgled
    ? NAMIG_SAMO_OGLED
    : spremembe.stevilo > 0
      ? "Najprej shrani spremembe"
      : !povezava.webhook
        ? "Povezava s Power Automate ni nastavljena"
        : null;

  const prejemnikiVsi = prodajalci.filter((p) => p.aktiven && p.prejema_opomnike && p.email).map((p) => p.email);

  return (
    <form ref={obrazec} onSubmit={oddaj} onChange={spremembe.preracunaj} className="flex flex-col gap-4" noValidate>
      <input
        type="hidden"
        name="prodajalci"
        value={JSON.stringify(prodajalci)}
      />
      <input type="hidden" name="odstranjeni" value={JSON.stringify(odstranjeni)} />
      <fieldset disabled={samoOgled} className="flex min-w-0 flex-col gap-4">
        {/* 1) Prodajalci */}
        <Section
          title="1. Prodajalci in e-maili"
          actions={
            <Button
              variant="success"
              icon={Plus}
              hint="Dodaj novega prodajalca na seznam"
              onClick={() => setProdajalci((p) => [...p, { naziv: "", prej: "", email: "", prejema_opomnike: false, aktiven: true }])}
            >
              Dodaj prodajalca
            </Button>
          }
        >
          <p className="mb-3 text-sm text-ink-500">
            Aktivni prodajalci so v spustnem seznamu »Imenovani prodajalec«. Opomnik o poteku dobi imenovani prodajalec opreme
            in vsi, ki imajo označeno »Prejema vse opomnike«. Sprememba imena se prenese tudi na opremo, kjer je prodajalec
            izbran. Odstranjen prodajalec ni več na seznamu, pri opremi, kjer je že izbran, pa ostane zapisan.
          </p>
          <div className="flex flex-col divide-y divide-ink-100">
            {prodajalci.map((p, i) => (
              <div
                key={i}
                className={`grid grid-cols-1 items-start gap-x-4 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto_auto_auto] ${
                  p.aktiven ? "" : "opacity-60"
                }`}
              >
                <Field label="Ime" error={napaka(`prodajalec_${i}_naziv`)}>
                  <TextInput
                    value={p.naziv}
                    onChange={(e) => uredi(i, { naziv: e.target.value })}
                    placeholder="Priimek Ime"
                    title="Ime prodajalca v spustnem seznamu (sprememba velja tudi pri opremi)"
                  />
                  {p.prej && p.prej !== p.naziv.trim() && (
                    <span className="mt-1 text-xs text-warn-700">Prej: {p.prej} - ime se popravi tudi pri opremi</span>
                  )}
                </Field>
                <Field label="E-mail" error={napaka(`prodajalec_${i}_email`)}>
                  <TextInput
                    type="email"
                    value={p.email}
                    onChange={(e) => uredi(i, { email: e.target.value })}
                    placeholder="ime.priimek@fines.si"
                    title="E-mail, na katerega prodajalec prejema opomnike"
                  />
                </Field>
                <div className="flex flex-col sm:pt-5">
                  <Kljukica
                    checked={p.prejema_opomnike}
                    onChange={(v) => uredi(i, { prejema_opomnike: v })}
                    label="Prejema vse opomnike"
                    hint="Prejme opomnik za vso opremo, ne samo za svojo"
                  />
                </div>
                <div className="flex flex-col sm:pt-5">
                  <Kljukica
                    checked={p.aktiven}
                    onChange={(v) => uredi(i, { aktiven: v })}
                    label="Aktiven"
                    hint="Neaktiven prodajalec ni v spustnem seznamu in ne prejema opomnikov"
                  />
                </div>
                <div className="flex sm:pt-5">
                  <IconButton
                    variant="danger"
                    icon={Trash2}
                    hint={p.naziv ? `Odstrani prodajalca ${p.naziv} s seznama` : "Odstrani prodajalca s seznama"}
                    onClick={() => odstrani(i)}
                  />
                </div>
              </div>
            ))}
            {prodajalci.length === 0 && <p className="py-3 text-sm text-ink-500">Ni prodajalcev. Dodaj prvega.</p>}
            {odstranjeni.length > 0 && (
              <p className="py-3 text-sm font-semibold text-nok-600">
                Ob shranjevanju bodo odstranjeni: {odstranjeni.join(", ")}
              </p>
            )}
          </div>
        </Section>

        {/* 2) E-mail opomniki */}
        <Section title="2. E-mail opomniki o poteku posoje in rezervacije">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-500">
              Vsak dan ob 7.00 aplikacija preveri posojeno in rezervirano opremo. Ko je do roka vrnitve oz. konca rezervacije
              nastavljeno število dni ali manj, pošlje e-mail (enkrat za vsak rok; ob podaljšanju roka znova).
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
              <Field label="Dni pred rokom" required error={napaka("opomnik_dni_pred")}>
                <TextInput
                  name="opomnik_dni_pred"
                  inputMode="numeric"
                  defaultValue={String(nastavitve.dniPred)}
                  title="Koliko dni pred rokom se pošlje opomnik"
                />
              </Field>
              <Field label="Testni e-mail naslov" required={testniNacin} error={napaka("opomnik_testni_email")}>
                <TextInput
                  type="email"
                  name="opomnik_testni_email"
                  defaultValue={nastavitve.testniEmail}
                  placeholder="ime.priimek@fines.si"
                  title="Naslov za testni e-mail in za vse opomnike v testnem načinu"
                />
              </Field>
              <Field label="Testni način" group>
                <input type="hidden" name="opomnik_testni_nacin" value={testniNacin ? "da" : "ne"} />
                <DaNe
                  label="Testni način"
                  value={testniNacin}
                  onChange={setTestniNacin}
                  hintDa="Vsi opomniki gredo samo na testni naslov"
                  hintNe="Opomniki gredo prodajalcem (redno delovanje)"
                />
              </Field>
            </div>
            {testniNacin ? (
              <WarningText>
                Testni način je vklopljen: vsi opomniki gredo samo na testni naslov (z oznako [TEST] in seznamom prejemnikov, ki
                bi ga prejeli v rednem delovanju). Ko je preizkus končan, izberi NE in shrani.
              </WarningText>
            ) : (
              <p className="text-sm text-ink-700">
                Redno delovanje. Vse opomnike prejmejo:{" "}
                <b>{prejemnikiVsi.length ? prejemnikiVsi.join(", ") : "nihče (samo imenovani prodajalec opreme)"}</b>
              </p>
            )}

            <ul className="flex flex-col gap-1 rounded-lg bg-ink-50 p-3">
              <StanjePovezave
                ok={povezava.webhook}
                naslov="Povezava s Power Automate"
                opis="manjka EMAIL_WEBHOOK_OPOMNIKI na strežniku (Vercel)"
              />
              <StanjePovezave
                ok={povezava.cron}
                naslov="Samodejno dnevno preverjanje"
                opis="manjka CRON_SECRET ali SUPABASE_SERVICE_ROLE_KEY na strežniku (Vercel)"
              />
            </ul>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="sync"
                icon={posiljam === "test" ? Mail : Send}
                disabled={!!zakajNePoslji || posiljam !== null}
                hint={zakajNePoslji ?? "Pošlji vzorčni opomnik na testni naslov"}
                onClick={() => poslji("test")}
              >
                {posiljam === "test" ? "Pošiljam ..." : "Pošlji testni e-mail"}
              </Button>
              <Button
                variant="sync"
                icon={BellRing}
                disabled={!!zakajNePoslji || posiljam !== null}
                hint={zakajNePoslji ?? "Takoj preveri roke in pošlji opomnike"}
                onClick={() => poslji("zdaj")}
              >
                {posiljam === "zdaj" ? "Pošiljam ..." : "Preveri in pošlji opomnike zdaj"}
              </Button>
            </div>
          </div>
        </Section>
      </fieldset>

      {/* 3) Poslani opomniki */}
      <Section title="3. Poslani opomniki (zadnjih 20)">
        {poslani.length === 0 ? (
          <p className="text-sm text-ink-500">Poslan ni bil še noben opomnik.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-ink-100">
            {poslani.map((o) => (
              <li key={o.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
                <span className="w-36 shrink-0 text-ink-500">{casSl(o.poslano)}</span>
                <span className="font-semibold text-ink-800">{VRSTE[o.vrsta] ?? o.vrsta}</span>
                {o.testni && (
                  <span className="rounded bg-warn-50 px-1.5 text-xs font-bold text-warn-700" title="Poslano samo na testni naslov">
                    TEST
                  </span>
                )}
                {o.id_oprema != null && (
                  <Link
                    href={`/oprema/${o.id_oprema}`}
                    className="min-w-0 truncate text-fines-600 hover:underline"
                    title="Odpri opremo"
                  >
                    {o.naziv ?? `Oprema ${o.id_oprema}`}
                  </Link>
                )}
                {o.rok && <span className="text-ink-600">rok {datumSl(o.rok)}</span>}
                <span className="min-w-0 flex-1 truncate text-ink-500" title={`Prejemniki: ${o.prejemniki ?? ""}`}>
                  → {o.prejemniki}
                </span>
                {o.napaka ? (
                  <span className="w-full font-semibold text-nok-600 sm:w-auto" title={o.napaka}>
                    Napaka: {o.napaka.slice(0, 80)}
                  </span>
                ) : (
                  <span className="font-semibold text-ok-600" title="Predano Power Automate">
                    OK
                  </span>
                )}
                <span className="w-full text-xs text-ink-400 sm:w-auto">{o.poslal}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <SaveBar
        steviloSprememb={spremembe.stevilo}
        shranjujem={shranjujem}
        onReset={ponastavi}
        sporocilo={stanje.sporocilo ? { ok: !!stanje.ok, besedilo: stanje.sporocilo } : undefined}
        shraniHint="Shrani prodajalce in nastavitve opomnikov"
        onemogoceno={samoOgled ? NAMIG_SAMO_OGLED : undefined}
      />
    </form>
  );
}
