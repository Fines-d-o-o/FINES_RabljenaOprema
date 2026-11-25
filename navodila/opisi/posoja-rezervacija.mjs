// Navodilo: Rezervacija in posoja opreme (verziji 8.01 in 8.02, stanje po 8.03).
// Generiranje (iz korena projekta): npm --prefix navodila run navodila -- posoja-rezervacija
//
// Ena funkcija = eno poglavje videa in ena stran PDF (levo diagram poteka, desno slike).
// Korak:
//   naslov    podnapis v videu in besedilo v diagramu
//   cilj      element, ki se obrobi (brez cilja = samo vozlišče v diagramu PDF, npr. samodejni dogodek)
//   (funkcija.zacetek = stran, ki se odpre med naslovnico poglavja)
//   dogodek   true = v diagramu kot samodejni dogodek (moder), ne kot korak uporabnika
//   pred      dejanja pred prikazom cilja (npr. odpri domačo stran)
//   dejanja   po prikazu: { klik }, { tipkaj, besedilo }, { izberi, vrednost }, { shrani: true }, { pojdi }
//             (klik / tipkaj / izberi brez lokatorja = cilj)
//   slika     slika stanja PO dejanjih za desno stran PDF (samo kjer se kaj zgodi), obmocje = izrez:
//             { opis }     slika prikazuje SAM KORAK (npr. izpolnjeno okno) - pod številko koraka
//             { rezultat } slika prikazuje REZULTAT (npr. kartica po shranjevanju) - v diagramu zeleno
//                          vozlišče s črko (A, B) za korakom, slika na koncu pod naslovom "Rezultat"
//             { pred: true } slika pred dejanji

const prodaja = (p) => p.locator("section").filter({ has: p.getByRole("heading", { name: "Prodaja", exact: true }) });
const okno = (p) => p.getByRole("dialog").locator(".fp-card").first();
const gumb = (p, ime) => p.getByRole("button", { name: ime, exact: true });
const statusBlok = (p) =>
  p.getByRole("heading", { name: "Status in prodajalec" }).locator("xpath=ancestor::div[contains(@class,'flex-col')][1]");
const kartica = (p) => p.getByText(/^REZERVIRANO/).first().locator("xpath=ancestor::*[contains(@class,'fp-card')][1]");

export default {
  naslov: "Rezervacija in posoja opreme",
  verzije: ["8.01", "8.02"],
  funkcije: [
    {
      naslov: "Rezervacija opreme",
      kdaj: "Kupec se je za opremo dogovoril, a je še ni kupil. Oprema se drugim ne ponuja do dogovorjenega datuma.",
      koraki: [
        {
          naslov: "Odpri opremo, poišči razdelek Prodaja",
          cilj: (p) => prodaja(p).getByRole("heading", { name: "Prodaja", exact: true }),
        },
        {
          naslov: "Klikni oranžen gumb »Rezerviraj«",
          cilj: (p) => gumb(p, "Rezerviraj"),
          dejanja: [{ klik: true }],
        },
        {
          naslov: "Rok: »Trajanje« 2 tedna (ali »Do datuma«)",
          cilj: (p) => okno(p).getByRole("radio", { name: "Trajanje" }),
          dejanja: [{ klik: true }, { tipkaj: (p) => okno(p).getByLabel("Rezervirano do - trajanje"), besedilo: "2" }],
        },
        {
          naslov: "Vpiši podjetje (obvezno) in kontakt",
          cilj: (p) => okno(p).getByLabel(/Rezerviral/),
          dejanja: [
            { tipkaj: true, besedilo: "Pekarna Novak d.o.o." },
            { tipkaj: (p) => okno(p).getByLabel("Kontakt"), besedilo: "Janez Novak, 041 123 456" },
          ],
          slika: { opis: "Datum se izračuna sam. Podjetje je obvezno.", obmocje: okno },
        },
        {
          naslov: "Klikni »Potrdi«",
          cilj: (p) => gumb(p, "Potrdi"),
          dejanja: [{ klik: true }],
        },
        {
          naslov: "Klikni zelen gumb »Shrani«",
          cilj: (p) => gumb(p, "Shrani"),
          dejanja: [{ shrani: true }],
          slika: { rezultat: "Oprema je rezervirana: kartica z »Uredi« in »Odstrani«.", obmocje: statusBlok },
        },
        {
          naslov: "Na domači strani: žig REZERVIRANO z datumom",
          dogodek: true,
          pred: [{ pojdi: () => "/" }, { tipkaj: (p) => p.getByPlaceholder("npr. FBM 40"), besedilo: "{naziv}" }],
          cilj: kartica,
          slika: { opis: "Ko rezervacija poteče, je žig rumen.", obmocje: kartica, pred: true },
        },
        { naslov: "Nekaj dni pred rokom: e-mail opomnik imenovanemu prodajalcu", dogodek: true },
      ],
      dobroVedeti: [
        "»Uredi« odpre isto okno (podaljšanje roka, drugo podjetje).",
        "Ob posoji ali prodaji se rezervacija sama odstrani.",
      ],
      pozor: "Okno samo pripravi podatke. Rezervacija velja šele, ko klikneš »Shrani«.",
    },
    {
      naslov: "Posoja opreme in vrnitev",
      kdaj: "Oprema gre začasno k stranki (npr. na preizkus) in se vrne. Vemo, kje je, pri kom in do kdaj.",
      zacetek: (ctx) => `/oprema/${ctx.id}`, // stran se odpre med naslovnico poglavja
      koraki: [
        {
          naslov: "Status prodaje: izberi »4. POSOJENO«",
          cilj: (p) => p.getByLabel("Status prodaje"),
          dejanja: [{ izberi: true, vrednost: "4. POSOJENO" }],
        },
        {
          naslov: "Odpre se okno posoje: vrnitev »Trajanje« 4 tedne",
          cilj: (p) => okno(p).getByRole("radio", { name: "Trajanje" }),
          dejanja: [{ klik: true }, { tipkaj: (p) => okno(p).getByLabel("Vrnitev - trajanje"), besedilo: "4" }],
          slika: { opis: "Posojeno od = danes. Vrnitev: datum, trajanje ali »Do nadaljnjega«. Podjetje se predlaga iz rezervacije.", obmocje: okno },
        },
        {
          naslov: "Preveri podjetje in kontakt, klikni »Potrdi«",
          cilj: (p) => gumb(p, "Potrdi"),
          dejanja: [{ klik: true }],
        },
        {
          naslov: "Klikni »Shrani«",
          cilj: (p) => gumb(p, "Shrani"),
          dejanja: [{ shrani: true }],
          slika: { rezultat: "Oprema je posojena: modra kartica, status zaklenjen, rezervacija odstranjena.", obmocje: statusBlok },
        },
        { naslov: "Pred rokom vrnitve: e-mail opomnik prodajalcu", dogodek: true },
        {
          naslov: "Oprema se vrne: klikni »Zaključi posojo«",
          cilj: (p) => gumb(p, "Zaključi posojo"),
          dejanja: [{ klik: true }],
        },
        {
          naslov: "Klikni »Shrani«: posoja je zaključena",
          cilj: (p) => gumb(p, "Shrani"),
          dejanja: [{ shrani: true }],
          slika: { rezultat: "Posoja je zaključena: status »2. NEPRODANO«, podatki posoje ostanejo v kartoteki.", obmocje: statusBlok },
        },
      ],
      dobroVedeti: [
        "»Prekliči« v oknu posoje vrne prejšnji status.",
        "»Do nadaljnjega« = brez datuma vrnitve in brez opomnika.",
        "Po roku vrnitve je na kartici rumeno opozorilo.",
      ],
      pozor: "Dokler je posoja shranjena, statusa ni mogoče spremeniti. Ko se oprema vrne, najprej »Zaključi posojo« in »Shrani«.",
    },
  ],
};
