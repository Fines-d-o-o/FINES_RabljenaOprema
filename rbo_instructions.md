# Rabljena oprema (RBO) - posebnosti projekta

Skupna pravila so v `../FINES_Standardi/app_instructions.md` (uvoženo v `CLAUDE.md`). Tukaj so samo pravila tega projekta.

## Baza
- Tabele: `rbo_...`, povezovalne `ln_rbo_...`. Migracije so v `supabase/migrations/` in jih poženeš ročno v Supabase SQL Editorju.

## Ocena stanja
- Ocena je **od 1 do 5**, desno od lestvice / črtic je vedno opis ocene:
  1 = uničeno, neuporabno, neurejeno; 2 = zelo rabljeno; 3 = vidno rabljeno; 4 = očiščeno, skoraj novo, malo rabljeno; 5 = kot novo.

## Garancija
- Pod Prodajo: DA/NE in lestvica 6 / 12 / 24 mesecev (pri NE zaklenjena, shrani se 0).
- Na pregledu opreme je moder znak garancije v levem spodnjem kotu slike; brez garancije se ne prikaže.

## Statusi prodaje (barve značk in kartic)
- Ni za prodajo rdeča, Ni urejeno za prodajo rumena, Neprodano oranžna, Prodano siva, Posojeno modra.

## Prodaja
- Polje "Kupec" (ročni vnos) ob datumu prodaje. Ko je status "3. PRODANO", sta kupec in datum prodaje obvezna (preverja tudi strežnik, `obveznoObProdaji` v `sifranti.ts`). Izjema: oprema, ki je bila prodana že prej in podatka nima. Vpisanega podatka pri prodani opremi ni mogoče izbrisati.
- Ob prehodu statusa v "3. PRODANO" strežnik pošlje obvestilo v Teams (`obvestiTeamsProdano` v `web/src/lib/teams.ts`, Adaptive Card po standardu). URL flowa je v `TEAMS_WEBHOOK_PRODANO` (Vercel, samo strežnik). Flow "Rabljena oprema Vercel - prodana oprema - message to teams" (izvoz v `data/prodanoworkflow_*.zip`) kartico samo objavi; ob spremembi vsebine se flow ne spreminja.

## Kartoteka in dnevnik sprememb
- Kartoteka opreme prikazuje ročne zapise (`rbo_kartoteka`, lahko se izbrišejo) in avtomatske vnose (`rbo_dnevnik`) na isti časovnici. Avtomatski vnos ima sivo piko in značko "Avtomatski vnos · sklop", datum z uro in uporabnika; ni ga mogoče izbrisati ali urejati.
- Avtomatske vnose pišejo **triggerji v bazi** (`20261119000000_dnevnik_kupec.sql`), ne aplikacija: dodana oprema, vsak spremenjen podatek (iz A v B) opreme, prodaje in tehničnega lista, dodana / zamenjana / odstranjena slika, izbrisan ročni zapis, izbris opreme. Nov podatek, ki naj se beleži, se doda v `rbo_dnevnik_polja` (oznaka) in po potrebi oblikovanje v `rbo_dnevnik_vrednost`.
- PDF kartoteke vsebuje samo ročne zapise.

## Prijava
- Izjema od standarda: polje je "Uporabniško ime"; ime brez @ se dopolni v e-mail s službeno domeno.

## Statusni list (OBR140 - Status blaga - Rabljeno)
- Nalepka na rabljeni opremi ob pakiranju v folijo; vzorec je `data/statusni_list.pdf`.
- Gumb "Statusni list" (bel) na strani opreme ob Tehničnem listu odpre predogled s "Prenesi PDF" in "Natisni" (oba oranžna; tisk odpre sistemsko okno za izbiro tiskalnika).
- Siva kartica "NALEPKA · IDENT" je prostor za nalepko in mora biti **točno 60 × 50 mm** (zunanja mera z robom). V njej sta naziv in šifra (vidna, če se nalepka ne prelepi). Tiska se v velikosti 100 %.
- Postavitev (mere v mm) je ena za predogled / tisk in PDF: `web/src/lib/statusniList.ts`. Pri tisku je viden samo element `.fp-tisk` (`globals.css`).

## AI iskanje (poskusno)
- Element na domači strani, odprtokodni model v brskalniku (brezplačno, brez API ključa). Vse je v `web/src/components/ai-iskanje/`, navodila za odstranitev so v tamkajšnjem `README.md`.
- Sken serijske nalepke pri dodajanju opreme (OCR v brskalniku): `web/src/components/sken-nalepke/`, odstranitev v tamkajšnjem `README.md`.

## Verzije
- Zgodovina sprememb je v `web/src/lib/verzije.ts` (gumb "i").
