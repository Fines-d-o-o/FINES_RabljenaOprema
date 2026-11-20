-- Nastavitve aplikacije in e-mail opomniki o poteku posoje / rezervacije.
--
-- 1) Prodajalci: e-mail, "prejema vse opomnike", "aktiven" (neaktiven ni v spustnem seznamu) in visible
--    (odstranjen v Nastavitvah; pri opremi, kjer je že izbran, ostane). Preimenovanje v Nastavitvah
--    popravi ime tudi pri opremi (rbo_prodaja.imenovani_prodajalec).
-- 2) rbo_nastavitve: ključ / vrednost (dni pred rokom, testni e-mail, testni način).
-- 3) rbo_opomniki: dnevnik poslanih opomnikov - isti rok se ne pošlje dvakrat; ob podaljšanju roka
--    (nov datum) se opomnik pošlje znova.
--
-- Pošiljanje: aplikacija sestavi e-mail (HTML), Power Automate flow ga samo pošlje (EMAIL_WEBHOOK_OPOMNIKI).
-- Dnevno preverjanje: Vercel Cron -> /api/opomniki (CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY).

-- 1) Prodajalci
alter table public.rbo_sif_prodajalec
    add column if not exists email            text,
    add column if not exists prejema_opomnike boolean not null default false,
    add column if not exists aktiven          boolean not null default true,
    add column if not exists visible          boolean not null default true;  -- false = odstranjen (vrstica ostane)

alter table public.rbo_sif_prodajalec drop constraint if exists rbo_sif_prodajalec_email;
alter table public.rbo_sif_prodajalec add constraint rbo_sif_prodajalec_email
    check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- 2) Nastavitve
create table if not exists public.rbo_nastavitve (
    kljuc         text primary key,
    vrednost      text,
    spremenjeno   timestamptz not null default now(),
    spremenil     text
);

alter table public.rbo_nastavitve enable row level security;
drop policy if exists "fines beri" on public.rbo_nastavitve;
drop policy if exists "fines dodaj" on public.rbo_nastavitve;
drop policy if exists "fines uredi" on public.rbo_nastavitve;
create policy "fines beri" on public.rbo_nastavitve for select to authenticated using (public.rbo_je_fines_uporabnik());
create policy "fines dodaj" on public.rbo_nastavitve for insert to authenticated with check (public.rbo_lahko_ureja());
create policy "fines uredi" on public.rbo_nastavitve for update to authenticated
    using (public.rbo_lahko_ureja()) with check (public.rbo_lahko_ureja());

insert into public.rbo_nastavitve (kljuc, vrednost) values
    ('opomnik_dni_pred', '3'),
    ('opomnik_testni_email', null),
    ('opomnik_testni_nacin', 'da')   -- dokler je DA, gredo vsi opomniki samo na testni naslov
on conflict (kljuc) do nothing;

-- 3) Poslani opomniki
create table if not exists public.rbo_opomniki (
    id           bigint generated always as identity primary key,
    vrsta        text not null check (vrsta in ('posoja', 'rezervacija', 'test')),
    id_oprema    bigint,
    id_prodaja   bigint,
    rok          date,
    prejemniki   text,
    testni       boolean not null default false,  -- poslano samo na testni naslov
    poslano      timestamptz not null default now(),
    poslal       text,                             -- e-mail uporabnika ali "samodejno"
    napaka       text                              -- prazno = uspešno predano Power Automate
);

-- isti rok iste opreme se uspešno pošlje samo enkrat (testno pošiljanje se ne šteje)
create unique index if not exists rbo_opomniki_enkrat
    on public.rbo_opomniki (id_prodaja, vrsta, rok)
    where napaka is null and not testni and vrsta <> 'test';
create index if not exists rbo_opomniki_poslano_idx on public.rbo_opomniki (poslano desc);

alter table public.rbo_opomniki enable row level security;
drop policy if exists "fines beri" on public.rbo_opomniki;
drop policy if exists "fines dodaj" on public.rbo_opomniki;
create policy "fines beri" on public.rbo_opomniki for select to authenticated using (public.rbo_je_fines_uporabnik());
create policy "fines dodaj" on public.rbo_opomniki for insert to authenticated with check (public.rbo_lahko_ureja());
-- samodejno pošiljanje (Vercel Cron) uporablja ključ service_role, ki RLS obide
