-- Posoja (status "4. POSOJENO") in rezervacija opreme v razdelku Prodaja.
--
-- Posoja: od kdaj, do kdaj (ali "do nadaljnjega"), komu (podjetje + kontakt).
--   Podatki veljajo samo, ko je status "4. POSOJENO"; ob drugem statusu jih aplikacija počisti
--   (zgodovina ostane v dnevniku).
-- Rezervacija: DA/NE, do kdaj, kdo (podjetje + kontakt). Ob prodaji jo aplikacija odstrani.
--
-- Datuma posojeno_do in rezervirano_do sta osnova za kasnejše opomnike o poteku (e-mail / Teams).

-- 1) Stolpci
alter table public.rbo_prodaja
    add column if not exists posojeno_od          date,
    add column if not exists posojeno_do          date,
    add column if not exists posojeno_do_preklica boolean not null default false,
    add column if not exists posojeno_podjetje    text,
    add column if not exists posojeno_kontakt     text,
    add column if not exists rezervirano          boolean not null default false,
    add column if not exists rezervirano_do       date,
    add column if not exists rezervirano_podjetje text,
    add column if not exists rezervirano_kontakt  text;

alter table public.rbo_prodaja drop constraint if exists rbo_prodaja_posoja_datumi;
alter table public.rbo_prodaja add constraint rbo_prodaja_posoja_datumi
    check (posojeno_do is null or posojeno_od is null or posojeno_do >= posojeno_od);

alter table public.rbo_prodaja drop constraint if exists rbo_prodaja_posoja_do_preklica;
alter table public.rbo_prodaja add constraint rbo_prodaja_posoja_do_preklica
    check (not (posojeno_do_preklica and posojeno_do is not null));

-- za opomnike o poteku
create index if not exists rbo_prodaja_posojeno_do_idx on public.rbo_prodaja (posojeno_do) where posojeno_do is not null;
create index if not exists rbo_prodaja_rezervirano_do_idx on public.rbo_prodaja (rezervirano_do) where rezervirano;

-- 2) Dnevnik: nova polja (oznake v vrstnem redu obrazca)
create or replace function public.rbo_dnevnik_polja(tabela text)
returns text[][]
language sql
immutable
as $$
    select case tabela
        when 'rbo_oprema' then array[
            ['oprema_naziv', 'Naziv opreme'], ['koda', 'Ident (koda)'], ['serijska_stevilka', 'Serijska številka'],
            ['skupina_opreme', 'Skupina opreme'], ['leto_proizvodnje', 'Leto proizvodnje'],
            ['datum_prejema', 'Datum prejema'], ['kolicina', 'Količina'], ['em', 'EM'],
            ['ocena', 'Ocena stanja'], ['lastnistvo', 'Lastništvo'], ['skladisce', 'Skladišče'], ['komentar', 'Komentar']]
        when 'rbo_prodaja' then array[
            ['status_prodaje', 'Status prodaje'],
            ['posojeno_od', 'Posojeno od'], ['posojeno_do', 'Posojeno do'],
            ['posojeno_do_preklica', 'Posojeno do nadaljnjega'],
            ['posojeno_podjetje', 'Posojeno (podjetje)'], ['posojeno_kontakt', 'Posojeno (kontakt)'],
            ['rezervirano', 'Rezervirano'], ['rezervirano_do', 'Rezervirano do'],
            ['rezervirano_podjetje', 'Rezervirano (podjetje)'], ['rezervirano_kontakt', 'Rezervirano (kontakt)'],
            ['imenovani_prodajalec', 'Imenovani prodajalec'],
            ['garancijski_rok_meseci', 'Garancija'], ['cena_nove', 'Cena nove'], ['rabat_procent', 'Rabat'],
            ['prodajna_cena', 'Prodajna cena'], ['datum_prodaje', 'Datum prodaje'], ['kupec', 'Kupec'],
            ['komentar_ob_prodaji', 'Komentar ob prodaji']]
        when 'rbo_tehnicni_list' then array[
            ['tip_opreme', 'Tip opreme'], ['naziv', 'Naziv'], ['leto_izdelave', 'Leto izdelave'],
            ['serijska', 'Serijska številka'], ['dimenzija', 'Dimenzija'], ['teza', 'Teža'],
            ['delovne_ure', 'Delovne ure'], ['prikljucna_moc', 'Priključna moč'],
            ['elektricni_priklop', 'Električni priklop'], ['varovalke', 'Varovalke'], ['temperatura', 'Temperatura'],
            ['priklop_vode', 'Priklop vode'], ['odvod_pare', 'Odvod pare'],
            ['kapaciteta_pekacev', 'Kapaciteta pekačev'], ['razdalja_med_pekaci', 'Razdalja med pekači'],
            ['opis', 'Opis']]
    end
$$;

-- 3) Dnevnik: oblikovanje novih vrednosti (datumi; DA/NE: false = prazno, da nova prodaja ne zapiše "NE")
create or replace function public.rbo_dnevnik_vrednost(polje text, v jsonb)
returns text
language plpgsql
immutable
as $$
declare
    t text := v #>> '{}';
begin
    if t is null or btrim(t) = '' then return null; end if;
    case
        when polje in ('datum_prejema', 'datum_prodaje', 'posojeno_od', 'posojeno_do', 'rezervirano_do') then
            return to_char(t::date, 'DD.MM.YYYY');
        when polje in ('posojeno_do_preklica', 'rezervirano') then
            return case when t::boolean then 'DA' else null end;
        when polje in ('cena_nove', 'prodajna_cena') then
            return replace(to_char(t::numeric, 'FM9999999990.00'), '.', ',') || ' €';
        when polje = 'rabat_procent' then
            return replace(trim(trailing '.' from trim(trailing '0' from to_char(t::numeric, 'FM9999990.00'))), '.', ',') || ' %';
        when polje = 'garancijski_rok_meseci' then
            return case when t::int = 0 then 'brez garancije' else t || ' mesecev' end;
        when polje = 'ocena' then
            return t || ' - ' || case t::int
                when 1 then 'Uničeno, neuporabno, neurejeno'
                when 2 then 'Zelo rabljeno'
                when 3 then 'Vidno rabljeno'
                when 4 then 'Očiščeno, skoraj novo, malo rabljeno'
                when 5 then 'Kot novo'
                else '' end;
        else
            return t;
    end case;
end
$$;

-- 4) Pogled: novi stolpci na koncu (create or replace view dovoli samo dodajanje na konec)
create or replace view public.v_rbo_oprema_prodaja
with (security_invoker = true) as
select
    o.id                      as id_oprema,
    o.datum_prejema,
    ps.ime_slike              as predstavna_slika,
    o.kolicina,
    o.em,
    o.koda,
    o.serijska_stevilka,
    o.leto_proizvodnje,
    o.skupina_opreme,
    o.oprema_naziv,
    o.lastnistvo,
    o.skladisce,
    o.komentar,
    o.ocena,
    p.id_prodaja,
    p.imenovani_prodajalec,
    p.garancijski_rok_meseci,
    p.cena_nove,
    p.rabat_procent,
    p.prodajna_cena,
    p.datum_prodaje,
    p.komentar_ob_prodaji,
    p.status_prodaje,
    exists (select 1 from public.rbo_tehnicni_list tl where tl.id_oprema = o.id and tl.visible) as ima_tehnicni_list,
    exists (select 1 from public.rbo_kartoteka k where k.id_oprema = o.id and k.visible) as ima_kartoteko,
    p.kupec,
    p.posojeno_od,
    p.posojeno_do,
    coalesce(p.posojeno_do_preklica, false) as posojeno_do_preklica,
    p.posojeno_podjetje,
    p.posojeno_kontakt,
    coalesce(p.rezervirano, false) as rezervirano,
    p.rezervirano_do,
    p.rezervirano_podjetje,
    p.rezervirano_kontakt
from public.rbo_oprema o
left join public.rbo_slike ps on ps.id_oprema = o.id and ps.vrsta_slike = 'Predstavna'
left join lateral (
    select pr.*
    from public.ln_rbo_oprema_prodaja po
    join public.rbo_prodaja pr on pr.id_prodaja = po.id_prodaja
    where po.id_oprema = o.id and pr.visible
    order by pr.id_prodaja desc
    limit 1
) p on true
where o.visible;
