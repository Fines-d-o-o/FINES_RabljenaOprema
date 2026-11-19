// Zgodovina sprememb (gumb "i" v glavi). Najnovejša verzija je prva.
// Manjši popravki: 1.01 -> 1.02; nova funkcija ali podstran: 1.xx -> 2.01.
export const VERZIJE: { verzija: string; datum: string; spremembe: string[] }[] = [
  {
    verzija: "7.02",
    datum: "2026-11-19",
    spremembe: [
      "Obvestilo v Teams kanal, ko je oprema označena kot »3. PRODANO«: »Oprema je bila označena kot PRODANA«, poziv »Peč odpišite na odpremni nalog« in osnovni podatki (naziv, ID, ident, serijska številka, skupina, skladišče, kupec, datum prodaje, prodajalec), kdo je označil prodajo in gumb »Odpri opremo«.",
      "Obvestilo se pošlje samo enkrat - ob spremembi statusa v PRODANO (ponovno shranjevanje ga ne pošlje). Če pošiljanje ne uspe, je oprema vseeno shranjena, aplikacija pa opozori, naj se ekipo obvesti ročno.",
    ],
  },
  {
    verzija: "7.01",
    datum: "2026-11-19",
    spremembe: [
      "Dnevnik sprememb: vsaka sprememba opreme se samodejno zapiše v kartoteko kot »Avtomatski vnos« z datumom, uro in uporabnikom: kateri podatek se je spremenil iz česa v kaj (osnovni podatki, stanje in lokacija, prodaja, tehnični list).",
      "Zabeležijo se tudi dodane, zamenjane in odstranjene slike, izbrisani ročni zapisi kartoteke in izbris opreme. Prvi zapis: »Oprema je bila dodana v sistem na dan …«.",
      "Avtomatskih vnosov ni mogoče izbrisati ali urejati; v kartoteki jih lahko skriješ s kljukico »Avtomatski vnosi«. Ročni zapisi ostanejo enaki kot prej.",
      "Prodaja: novo polje »Kupec« ob datumu prodaje. Ko se status nastavi na »3. PRODANO«, sta kupec in datum prodaje obvezna (oprema, ki je bila prodana že prej, ju lahko ima prazna).",
      "Usklajeno s standardi: iskanje po nazivu in serijski številki najde besede v poljubnem vrstnem redu in brez šumnikov (»pec« najde »Peč«), iskalno polje ima gumb × za brisanje, prijava ima gumb pokaži / skrij geslo, cene in rabat se v poljih prikažejo z decimalno vejico, statusni list na telefonu pokaže samo »Prenesi PDF«.",
    ],
  },
  {
    verzija: "6.03",
    datum: "2026-10-27",
    spremembe: [
      "Statusni list: siva kartica »NALEPKA · IDENT« je prostor za nalepko in je točno 60 × 50 mm (pri tisku izberi velikost 100 % / dejanska velikost). V njej sta naziv in šifra, ki se vidita, če se nalepka ne prelepi.",
      "Spodnji razdelki so pomaknjeni višje, podroben opis stanja ima prostor za do 5 vrstic.",
    ],
  },
  {
    verzija: "6.02",
    datum: "2026-10-27",
    spremembe: [
      "Statusni list v modernem videzu (enaka razporeditev kot obrazec): zaobljene senčene kartice z oznako v kartici, izpolnjeni podatki večji in krepki.",
      "Razdelki z oranžno oštevilčeno značko, ident v belem okvirju, izbrana ocena stanja v zeleni kartici s kljukico, ID opreme v temnem okvirju.",
    ],
  },
  {
    verzija: "6.01",
    datum: "2026-10-27",
    spremembe: [
      "Stran opreme: gumb »Statusni list« ob Tehničnem listu. Odpre predogled obrazca OBR140 »Status blaga - Rabljeno« (nalepka na opremi ob pakiranju v folijo), izpolnjenega s podatki opreme.",
      "Statusni list: naziv in ident, serijska številka, lastnik, opis (skupina opreme, leto proizvodnje), skladišče ERP / fizična lokacija, obkrožena ocena stanja, podroben opis stanja (komentar), ID in datum tiska; podpis se vpiše ročno.",
      "V predogledu gumba »Prenesi PDF« in »Natisni« (odpre sistemsko okno za tisk z izbiro tiskalnika; natisne se samo list A4).",
      "Usklajeno s standardnimi komponentami: okno je na telefonu čez cel zaslon z gumbi v nogi, glava gre v 360 px (manjši logo, okrogel Izhod), prijavljeni uporabnik levo od Izhoda, vnosna polja na telefonu 44 px in pisava 16 px.",
    ],
  },
  {
    verzija: "5.01",
    datum: "2026-10-10",
    spremembe: [
      "Dodaj opremo: okno »Skeniraj nalepko« desno v Osnovnih podatkih. Fotografiraj serijsko nalepko in samodejno se izpolnijo naziv, ident, serijska številka, leto proizvodnje in skupina opreme (samo prazna polja).",
      "Branje nalepke (odprtokodni PaddleOCR) teče v brskalniku; ob prvi uporabi se prenese ~31 MB, slika se ne shrani in ne pošlje zunanjim storitvam.",
      "Prepozna Finesove nalepke (Product type, Product code, Serial number, Production year, tudi slovenske oznake); serijska, ident in leto tudi po Finesovem formatu, skupina po obstoječi opremi.",
      "V oknu so navodila za dobro fotografijo nalepke (od blizu, ostro, brez odseva, očiščena nalepka); prikažejo se tudi, ko je prebranih podatkov malo.",
    ],
  },
  {
    verzija: "4.01",
    datum: "2026-10-10",
    spremembe: [
      "Poskusno AI iskanje na domači strani: »Iščeš rabljeno opremo?« – opiši s svojimi besedami, kaj iščeš, in prikaže se najbolj ustrezna oprema (prodana oprema se ne prikaže).",
      "Odprtokodni model (multilingual-e5-small) teče v brskalniku; ob prvi uporabi se prenese ~120 MB, podatki ne gredo k zunanjim AI storitvam.",
      "Oznake opreme v vprašanju (npr. FB, FD64) omejijo zadetke na opremo s to oznako; »Koliko …« prikaže število postavk in količino; sinonimi za interne izraze.",
    ],
  },
  {
    verzija: "3.01",
    datum: "2026-10-08",
    spremembe: [
      "Ocena stanja je od 1 do 5 (ocena 6 je ukinjena, obstoječe ocene 6 so postale 5). Ob oceni je opis: 1 uničeno, neuporabno, neurejeno · 2 zelo rabljeno · 3 vidno rabljeno · 4 očiščeno, skoraj novo · 5 kot novo.",
      "Prodaja: garancija z izbiro DA/NE in lestvico 6, 12 ali 24 mesecev (pri NE je lestvica zaklenjena).",
      "Pregled opreme: moder znak garancije v levem spodnjem kotu slike (samo oprema z garancijo).",
      "PDF osnovnih podatkov: ocena z opisom in garancija.",
      "Barve gumbov: prenos PDF/ZIP je oranžen (funkcija v aplikaciji), e-mail moder (Outlook), beli gumbi samo spremenijo prikaz (Nazaj, Ponastavi filtre, Tehnični list ...); Izhod oranžen.",
    ],
  },
  {
    verzija: "2.02",
    datum: "2026-10-08",
    spremembe: [
      "Poenotenje s standardnimi komponentami Fines (app_instructions.md): barve, gumbi 40 px, polja, kartice, okna in obvestila enaki kot v ostalih Fines aplikacijah.",
      "Glava: logo, Nazaj, »i« in Izhod v enotnem slogu, spodaj oranžna črta; verzija v nogi.",
      "Pregled opreme: kartice statusov prodaje s številom opreme (klik prikaže / skrije status) namesto spustnega seznama in stikala »Prikaži prodano«.",
      "Filtri v eni vrstici z naslovi nad polji; iskalna polja z lupo.",
      "Gumbi za izvoz (PDF, e-mail, ZIP) so beli z obrobo, pod naslovom »Izvoz«; Osveži podatke je moder.",
      "Obrazca opreme in tehničnega lista: spodnja vrstica s številom neshranjenih sprememb, Prekliči in Shrani; opozorilo pred odhodom s strani.",
      "Napake pri prenosu se prikažejo kot obvestilo na vrhu strani.",
    ],
  },
  {
    verzija: "2.01",
    datum: "2026-10-06",
    spremembe: [
      "Na pregledu opreme je prikazana prodajna cena (zavihek Prodaja).",
      "Izbira več opreme hkrati (kvadratek na kartici, gumb »Izberi prikazane«).",
      "Vrstica z izbrano opremo: prenos osnovnih podatkov, tehničnih listov in kartotek kot ZIP PDF-jev ter e-mail z vsemi priponkami. Oprema brez podatkov za dokument se preskoči.",
      "Pri urejanju opreme gumb za prenos vseh slik kot ZIP (desno zgoraj v razdelku Slike).",
      "Gumb »i« z zgodovino sprememb in verzij.",
    ],
  },
  {
    verzija: "1.01",
    datum: "2026-10-01",
    spremembe: [
      "Prenova aplikacije iz Power Apps (Vercel + Supabase): seznam opreme s filtri, dodajanje in urejanje opreme, prodaja, slike, kartoteka in tehnični list.",
      "PDF dokumenti (osnovni podatki, kartoteka, tehnični list) in priprava e-maila za Outlook.",
      "Prijava s službenim računom in vloga »samo ogled«.",
    ],
  },
];

export const TRENUTNA_VERZIJA = VERZIJE[0].verzija;
