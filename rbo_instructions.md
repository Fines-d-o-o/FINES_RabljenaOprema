# Rabljena oprema (RBO) - posebnosti projekta

Skupna pravila so v `../FINES_Standardi/app_instructions.md` (uvoženo v `CLAUDE.md`). Tukaj so samo podatki in pravila, ki veljajo le za ta projekt.

## Prijava
- Izjema od standarda: polje je "Uporabniško ime"; ime brez @ se dopolni v e-mail s službeno domeno.

## Ocena stanja (1-5, opis desno od lestvice)
1 = uničeno, neuporabno, neurejeno; 2 = zelo rabljeno; 3 = vidno rabljeno; 4 = očiščeno, skoraj novo, malo rabljeno; 5 = kot novo.

## Garancija
- DA/NE in lestvica 6 / 12 / 24 mesecev; pri NE se shrani 0.
- Na pregledu opreme moder znak garancije v levem spodnjem kotu slike (brez garancije ga ni).

## Statusi prodaje (barve značk in kartic)
Ni za prodajo rdeča, Ni urejeno za prodajo rumena, Neprodano oranžna, Prodano siva, Posojeno modra.

## Prodaja
- Podrazdelki: 1 Status in prodajalec, 2 Cena, 3 Garancija, 4 Kupec in datum prodaje, 5 Komentar.
- Pri "3. PRODANO" sta kupec in datum prodaje obvezna (tudi strežnik, `obveznoObProdaji` v `sifranti.ts`); izjema je oprema, prodana že prej brez podatka. Vpisanega podatka pri prodani opremi ni mogoče izbrisati.
- Ob prehodu v PRODANO gre obvestilo v Teams (`obvestiTeamsProdano`, `TEAMS_WEBHOOK_PRODANO`; flow "Rabljena oprema Vercel - prodana oprema - message to teams"). Dodajanje opreme pošlje obvestilo "nova oprema" (`obvestiTeamsNovaOprema`).

## Posoja in rezervacija
- Status "4. POSOJENO" odpre okno posoje (`PosojaOkno` v `web/src/app/oprema/PosojaRezervacija.tsx`): od, vrnitev (`IzbiraRoka` z "do nadaljnjega"), podjetje (obvezno), kontakt. Prekliči vrne prejšnji status. Strežnik: `obveznoObPosoji` (izjema: posojeno že prej brez podatkov); podatki posoje veljajo samo pri POSOJENO, sicer se počistijo.
- Shranjena posoja zaklene status in rezervacijo; "Zaključi posojo" nastavi NEPRODANO (posoja se zaključi ob shranjevanju).
- Rezervacija: gumb "Rezerviraj" (oranžen) v glavi razdelka Prodaja, rok od danes brez "do nadaljnjega". Ob PRODANO ali POSOJENO jo strežnik odstrani, gumb je onemogočen; ob posoji se podjetje predlaga iz rezervacije.
- Domača stran: žig PRODANO (siv) / REZERVIRANO (rdeč z datumom, potekla rumena).
- Stolpci v `rbo_prodaja` (`20261120000000_posoja_rezervacija.sql`).

## Nastavitve in e-mail opomniki (izvedba po standardu "Samodejni e-mail opomnik")
- Prodajalci: `rbo_sif_prodajalec`; preimenovanje popravi tudi `rbo_prodaja.imenovani_prodajalec`. "Imenovani prodajalec" = aktivni prodajalci (+ že izbrani pri opremi).
- Nastavitve `rbo_nastavitve`, poslani `rbo_opomniki` (`20261121000000_nastavitve_opomniki.sql`). Cron 06:00 UTC -> `/api/opomniki`, flow `EMAIL_WEBHOOK_OPOMNIKI`.
- Opomnik za `posojeno_do` in `rezervirano_do`; prejemniki: imenovani prodajalec opreme + vsi s "Prejema vse opomnike", CC iz `opomnik_v_vednost`.

## Kartoteka
- Ročni zapisi `rbo_kartoteka` + avtomatski vnosi `rbo_dnevnik` (triggerji v `20261119000000_dnevnik_kupec.sql`, oznake v `rbo_dnevnik_polja`, oblikovanje v `rbo_dnevnik_vrednost`). PDF kartoteke vsebuje samo ročne zapise.

## Statusni list (OBR140 - Status blaga - Rabljeno)
- Nalepka ob pakiranju v folijo; vzorec `data/statusni_list.pdf`. Gumb "Statusni list" (bel) ob Tehničnem listu: predogled, "Prenesi PDF" in "Natisni" (oranžna).
- Siva kartica "NALEPKA · IDENT" je **točno 60 × 50 mm** (zunanja mera z robom), v njej naziv in šifra; tisk v velikosti 100 %.
- Postavitev (mm) je ena za predogled / tisk in PDF: `web/src/lib/statusniList.ts`; pri tisku je viden samo `.fp-tisk`.

## Poskusne funkcije (odstranitev v README mape)
- AI iskanje na domači strani (model v brskalniku): `web/src/components/ai-iskanje/`.
- Sken serijske nalepke (OCR v brskalniku): `web/src/components/sken-nalepke/`.

## Navodila za uporabnike (po standardu)
- Opisi v `navodila/opisi/` (zdaj: `posoja-rezervacija` za 8.01 / 8.02), generator `navodila/generator.mjs`. Testna oprema "FBM 40 - primer" se doda v bazo in po posnetku skrije.
