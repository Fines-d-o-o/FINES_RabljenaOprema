"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Download, FileText, Info, Video } from "lucide-react";
import { Button, buttonClass, IconButton, Modal, WarningText } from "@/components/ui";
import { NAVODILA_BUCKET } from "@/lib/config";
import { prikazDatuma } from "@/lib/datum";
import { createClient } from "@/lib/supabase/client";
import { NASLOVI_NAVODIL, TRENUTNA_VERZIJA, VERZIJE } from "@/lib/verzije";

// Gumb "i" v glavi: popup z zgodovino sprememb in verzij (Esc, X ali klik na ozadje zapre).
// Verzija s poljem navodilo ima ikono videa: v istem oknu se pokaže video navodilo s prenosom videa in PDF.
export function InfoGumb() {
  const [odprt, setOdprt] = useState(false);
  const [navodilo, setNavodilo] = useState<string | null>(null);
  const zapri = () => {
    setOdprt(false);
    setNavodilo(null);
  };
  const naslov = navodilo ? (NASLOVI_NAVODIL[navodilo] ?? "Navodilo") : null;
  const povezave = usePovezave(navodilo);

  return (
    <>
      <IconButton
        hint={`Prikaži verzije in spremembe (v${TRENUTNA_VERZIJA})`}
        icon={Info}
        onClick={() => setOdprt(true)}
      />
      <Modal
        open={odprt}
        title={naslov ? `Navodilo: ${naslov}` : "Verzije in spremembe"}
        onClose={zapri}
        sirina={navodilo ? "max-w-4xl" : "max-w-2xl"}
        noga={navodilo ? <NavodiloNoga p={povezave} naslov={naslov!} onNazaj={() => setNavodilo(null)} /> : undefined}
      >
        {navodilo ? (
          <NavodiloVideo p={povezave} />
        ) : (
          <div className="flex flex-col gap-5">
            {VERZIJE.map((v) => (
              <section key={v.verzija}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-bold text-fines-500">Verzija {v.verzija}</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink-500">{prikazDatuma(v.datum)}</span>
                    {v.navodilo && (
                      <IconButton
                        variant="primary"
                        icon={Video}
                        hint={`Video navodilo: ${NASLOVI_NAVODIL[v.navodilo] ?? v.navodilo}`}
                        onClick={() => setNavodilo(v.navodilo!)}
                      />
                    )}
                  </div>
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">
                  {v.spremembe.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

type Povezave = { video: string; prenosVideo: string; prenosPdf: string } | { napaka: string } | null;

/** Podpisani URL-ji (1 ura) za ogled in prenos; ključ = ime navodila. */
function usePovezave(ime: string | null): Povezave {
  const [povezave, setPovezave] = useState<{ ime: string; p: Povezave }>({ ime: "", p: null });
  useEffect(() => {
    if (!ime) return;
    let velja = true;
    const shramba = createClient().storage.from(NAVODILA_BUCKET);
    const ura = 60 * 60;
    const datoteka = `Navodilo - ${NASLOVI_NAVODIL[ime] ?? ime}`;
    Promise.all([
      shramba.createSignedUrl(`${ime}/video.mp4`, ura),
      shramba.createSignedUrl(`${ime}/video.mp4`, ura, { download: `${datoteka}.mp4` }),
      shramba.createSignedUrl(`${ime}/navodilo.pdf`, ura, { download: `${datoteka}.pdf` }),
    ]).then(([v, pv, pp]) => {
      if (!velja) return;
      const napaka = v.error ?? pv.error ?? pp.error;
      setPovezave({
        ime,
        p: napaka || !v.data || !pv.data || !pp.data
          ? { napaka: "Navodilo še ni objavljeno ali ni dosegljivo. Poskusi kasneje ali obvesti skrbnika aplikacije." }
          : { video: v.data.signedUrl, prenosVideo: pv.data.signedUrl, prenosPdf: pp.data.signedUrl },
      });
    });
    return () => {
      velja = false;
    };
  }, [ime]);
  return povezave.ime === ime ? povezave.p : null;
}

function NavodiloVideo({ p }: { p: Povezave }) {
  if (!p) return <p className="text-sm text-ink-500">Nalagam navodilo ...</p>;
  if ("napaka" in p) return <WarningText>{p.napaka}</WarningText>;
  return (
    <div className="flex flex-col gap-3">
      {/* video 16:10 (1920 × 1200), predvajalnik brskalnika s celozaslonskim prikazom */}
      <video
        key={p.video}
        src={p.video}
        controls
        autoPlay
        playsInline
        className="aspect-[16/10] w-full rounded-lg border border-ink-200 bg-ink-900"
        title="Video navodilo s podnapisi"
      />
      <p className="text-xs text-ink-500">
        Video ima podnapise s koraki. PDF ima isti potek na eni strani za vsako funkcijo - primeren za tisk ali pošiljanje.
      </p>
    </div>
  );
}

function NavodiloNoga({ p, naslov, onNazaj }: { p: Povezave; naslov: string; onNazaj: () => void }) {
  const ok = p && !("napaka" in p) ? p : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button variant="neutral" icon={ArrowLeft} hint="Nazaj na seznam verzij in sprememb" onClick={onNazaj}>
        Nazaj
      </Button>
      <div className="flex flex-wrap gap-2">
        {ok ? (
          <>
            <a href={ok.prenosVideo} className={buttonClass("primary")} title={`Prenesi video navodilo: ${naslov}`}>
              <Download size={16} aria-hidden /> Prenesi video
            </a>
            <a href={ok.prenosPdf} className={buttonClass("primary")} title={`Prenesi PDF navodilo: ${naslov}`}>
              <FileText size={16} aria-hidden /> Prenesi PDF
            </a>
          </>
        ) : (
          <>
            <Button icon={Download} disabled hint="Navodilo še ni na voljo">
              Prenesi video
            </Button>
            <Button icon={FileText} disabled hint="Navodilo še ni na voljo">
              Prenesi PDF
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
