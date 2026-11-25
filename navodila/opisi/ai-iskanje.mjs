// Navodilo: AI iskanje opreme (verzija 11.01).
// Generiranje (iz korena projekta): npm --prefix navodila run navodila -- ai-iskanje
// Iskanje samo bere - testna oprema ni potrebna (testnaOprema: false), v bazo se nič ne zapiše.
// Primeri namenoma ne uporabljajo opisnih vprašanj (»nekaj za pekarno«), ki naložijo AI model (~120 MB).

const sek = (p) => p.locator("section[aria-label='AI iskanje opreme']");
const polje = (p) => sek(p).getByLabel("Kaj iščeš");
const poisci = (p) => sek(p).getByRole("button", { name: "Poišči", exact: true });
// izrez za PDF: od iskalnega polja do 4. zadetka, pri širini strani 820 (dva stolpca zadetkov)
const zadetki = (p) => [sek(p).locator("form"), sek(p).locator("ul > li:nth-child(-n+4)").last()];

/** Korak: vpiši vprašanje in klikni Poišči; nato čas za ogled zadetkov. */
const vprasanje = (naslov, besedilo, dodatno = {}) => ({
  naslov,
  cilj: polje,
  dejanja: [{ tipkaj: true, besedilo, pocisti: true }, { klik: poisci }],
  drziPo: 3200,
  ...dodatno,
});

export default {
  naslov: "AI iskanje opreme",
  verzije: ["11.01"],
  testnaOprema: false,
  zacetek: () => "/",
  funkcije: [
    {
      naslov: "Iskanje opreme",
      kdaj: "Iščeš določeno opremo: po vrsti (napa, etažna peč), po oznaki (FBM, FD64) ali z opisom.",
      koraki: [
        {
          naslov: "Na domači strani: »Iščeš rabljeno opremo?«",
          cilj: polje,
        },
        vprasanje("Vpiši »etažna peč« in klikni »Poišči«", "etažna peč", {
          slika: {
            rezultat: "Samo etažne peči. »Upoštevano« pove, kako je iskanje razumelo vprašanje.",
            obmocje: zadetki, sirina: 820,
          },
        }),
        vprasanje("Oznaka: »FBM« najde vse FBM (tudi »Fbm-40S«)", "FBM"),
        { naslov: "Opis brez znane besede (»nekaj za pekarno«): poišče AI model", dogodek: true },
        {
          naslov: "Klikni zadetek, da odpreš opremo",
          cilj: (p) => sek(p).locator("ul > li").first(),
        },
      ],
      dobroVedeti: [
        "Prodana oprema ni v zadetkih.",
        "Več kot 8 zadetkov: »Prikaži vse«. »Počisti« skrije zadetke.",
        "Opisno vprašanje prvič naloži AI model (~1 min), nato je hitro.",
      ],
      pozor: "Če ni zadetka, poskusi drugo besedo (npr. »peč« namesto »pečica«) ali oznako iz naziva.",
    },
    {
      naslov: "Želje: cena, stanje, starost",
      kdaj: "Kupec želi cenejšo, malo rabljeno ali novejšo opremo - napiši željo kar v vprašanje.",
      koraki: [
        vprasanje("»poceni peč« - najprej najcenejše", "poceni peč", {
          slika: {
            rezultat: "Razvrščeno od najcenejše. Povzetek pove, koliko opreme nima vpisane cene (je na koncu).",
            obmocje: zadetki, sirina: 820,
          },
        }),
        vprasanje("»malo rabljena etažna peč« - stanje 4 ali 5", "malo rabljena etažna peč"),
        vprasanje("»napa pod 3000 €« - samo do te cene", "napa pod 3000 €"),
        vprasanje("»novejša peč« - po letu proizvodnje", "novejša peč", {
          slika: { opis: "Na zadetku je poudarjeno leto proizvodnje.", obmocje: zadetki, sirina: 820 },
        }),
      ],
      dobroVedeti: [
        "Cena: »poceni«, »dražje«, »pod 5000 €«, »nad 2000 €«.",
        "Stanje: »malo rabljena«, »kot nova«, »za dele«, »ocena vsaj 4«.",
        "Leto: »novejša«, »starejša«, »od 2018«, »letnik 2020«. Še: »z garancijo«, »na voljo«.",
      ],
      pozor: "Cena je vpisana le pri delu opreme: pri »poceni« je oprema brez cene na koncu, pri »pod 3000 €« pa izločena.",
    },
    {
      naslov: "Pregled zaloge in urejanje",
      kdaj: "Prodajalec želi videti, kaj je novega, kaj leži najdlje ali katerim podatkom je treba dopolniti.",
      koraki: [
        {
          naslov: "Klikni »Počisti«, pod poljem so primeri",
          cilj: (p) => sek(p).getByRole("button", { name: /Počisti/ }),
          dejanja: [{ klik: true }],
        },
        {
          naslov: "Klikni primer »nova oprema« - zadnje prejeto",
          cilj: (p) => sek(p).getByRole("button", { name: "nova oprema", exact: true }),
          dejanja: [{ klik: true }],
          drziPo: 3200,
          slika: { rezultat: "Od zadnje prejete; na zadetku je datum prejema.", obmocje: zadetki, sirina: 820 },
        },
        vprasanje("»najdlje na zalogi« - kar leži najdlje", "najdlje na zalogi"),
        vprasanje("»koliko je posojenih« - število in seznam", "koliko je posojenih"),
        vprasanje("»brez cene« - oprema, ki ji manjka cena", "brez cene"),
      ],
      dobroVedeti: [
        "Obdobje: »ta teden«, »ta mesec«, »zadnjih 30 dni«.",
        "Manjkajoče: »brez slike«, »brez ocene«. Status: »posojeno«, »rezervirano«, »ni urejeno za prodajo«.",
      ],
      pozor: "»Nova oprema« = zadnje prejeto. »Kot nova« je stanje, »novejša« pa leto proizvodnje.",
    },
  ],
};
