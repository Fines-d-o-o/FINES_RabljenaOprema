# AI iskanje (poskusno)

Element »Iščeš rabljeno opremo? Napiši, kaj iščeš.« na domači strani.

## Kako deluje
- Odprtokodni model [multilingual-e5-small](https://huggingface.co/Xenova/multilingual-e5-small) prek [Transformers.js](https://github.com/huggingface/transformers.js) teče v brskalniku. Knjižnica se naloži s CDN (jsDelivr), zato v `package.json` ni nobenega paketa. Model ima ~120 MB in se prenese ob prvem iskanju, potem ga brskalnik hrani v predpomnilniku.
- Vsak kos opreme (naziv, skupina, ident, leto, stanje, komentar) se pretvori v vektor (384 števil), ki se shrani v tabelo `rbo_ai_vektor`. Vektorji se izračunajo ob iskanju, za novo ali spremenjeno opremo (stolpec `besedilo`). Shranjevanje opreme se zato ne spremeni.
- Tudi vprašanje se pretvori v vektor, funkcija `rbo_ai_isci` pa vrne najbolj podobno opremo.
- Pravila nad modelom (`iskanje.ts`): če vprašanje vsebuje oznako obstoječe opreme (FB, FD64 …), se zadetki omejijo na opremo s to oznako (FB ustreza FB, FB40, ne pa FBM). »Koliko …« prikaže število postavk in količino.
- Namere (`namere.ts`): iz vprašanja se razberejo cena (»poceni«, »dražje«, »pod 5000 €«), stanje (»malo rabljena«, »kot nova«, »za dele«), leto proizvodnje (»novejša«, »od 2018«), datum prejema (»nova oprema«, »zadnje dodano«, »ta mesec«, »najdlje na zalogi«), garancija, status (»na voljo«, »posojeno«, »ni urejeno za prodajo«) in manjkajoči podatki (»brez cene«, »brez slike«). Te besede se odstranijo, ostane predmet (npr. »peč«). Oprema brez podatka gre pri razvrščanju na konec, pri filtru se izloči - povzetek pove, koliko je takih. Pod poljem so značke »Upoštevano: ...« (kako je iskanje razumelo vprašanje) in primeri za klik.
- Predmet se najprej poišče po besedah v skupini in nazivu (»napa« -> samo nape, »etažna peč« -> samo etažne - obdrži se oprema z največ ujemajočimi besedami). AI model se naloži samo, če se nobena beseda ne ujema (opis, npr. »nekaj za pekarno«); takrat se prikažejo samo zadetki blizu najboljšemu, ne vedno 8.
- Sinonimi in interni izrazi (`pravila.ts`): ključ v vprašanju → dodatno besedilo za model. Sem dodajaj pravila, ko iskanje česa ne razume.
- Brez stroškov, API ključev in omejitev. Podatki ne gredo k zunanjim AI storitvam.

## Datoteke
- `src/components/ai-iskanje/`: `AiIskanje.tsx` (element), `model.ts` (model in besedilo opreme), `iskanje.ts` (oznake, štetje), `namere.ts` (cena, stanje, leto, prejem, status), `pravila.ts` (sinonimi), ta README
- `src/app/page.tsx`: uvoz in `<AiIskanje oprema={oprema} />`
- `supabase/migrations/20261010000000_ai_iskanje.sql`: tabela `rbo_ai_vektor` in funkcija `rbo_ai_isci`
- `supabase/ai_iskanje_odstrani.sql`: odstranitev iz baze

## Odstranitev
1. V Supabase SQL Editorju poženi `supabase/ai_iskanje_odstrani.sql`.
2. Izbriši mapo `src/components/ai-iskanje/` in migracijo `supabase/migrations/20261010000000_ai_iskanje.sql`.
3. V `src/app/page.tsx` odstrani uvoz `AiIskanje` in vrstico `<AiIskanje oprema={oprema} />`.
4. V `src/lib/verzije.ts` dodaj verzijo z opombo, da je AI iskanje odstranjeno.
