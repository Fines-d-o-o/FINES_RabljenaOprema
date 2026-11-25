-- Navodila za uporabnike (video MP4 + PDF) - app_instructions.md, "Navodila za uporabnike".
-- Datoteke: rbo-navodila/<ime>/video.mp4 in rbo-navodila/<ime>/navodilo.pdf
-- Nalaga jih generator (navodila/generator.mjs --objavi) s sejo prijavljenega uporabnika.
-- Aplikacija jih prikaže v oknu "i" pri verziji s poljem navodilo (podpisani URL, 1 ura).

-- 1) Zaseben bucket (brez javnega dostopa), največ 100 MB na datoteko, samo video in PDF
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rbo-navodila', 'rbo-navodila', false, 104857600, array['video/mp4', 'application/pdf'])
on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

-- 2) Pravila: brati smejo vsi uporabniki aplikacije, nalagati / zamenjati / brisati uporabniki z urejanjem
drop policy if exists "rbo navodila beri" on storage.objects;
drop policy if exists "rbo navodila dodaj" on storage.objects;
drop policy if exists "rbo navodila uredi" on storage.objects;
drop policy if exists "rbo navodila izbrisi" on storage.objects;

create policy "rbo navodila beri" on storage.objects for select to authenticated
    using (bucket_id = 'rbo-navodila' and public.rbo_je_fines_uporabnik());
create policy "rbo navodila dodaj" on storage.objects for insert to authenticated
    with check (bucket_id = 'rbo-navodila' and public.rbo_lahko_ureja());
create policy "rbo navodila uredi" on storage.objects for update to authenticated
    using (bucket_id = 'rbo-navodila' and public.rbo_lahko_ureja());
create policy "rbo navodila izbrisi" on storage.objects for delete to authenticated
    using (bucket_id = 'rbo-navodila' and public.rbo_lahko_ureja());

-- 3) Skupna baza (FinOS): omejevalna politika fos_dostop na storage.objects dovoli bucket samo,
--    če je med košarami aplikacije (fos_aplikacije.kosare). Dodaj rbo-navodila k aplikaciji RBO.
do $$
begin
  if to_regclass('public.fos_aplikacije') is not null then
    update public.fos_aplikacije
    set kosare = array_append(kosare, 'rbo-navodila')
    where koda = 'rbo' and not ('rbo-navodila' = any (kosare));
  end if;
end $$;
