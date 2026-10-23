-- Parcel classifications (Classification Settings): live-database STEP 2 OF 2 (migration farmers.0033).
--
-- PROJECT: omag-aringay (ref zqvemhtzrccbofvwneph). Do NOT run on zewru_db (the old copy).
-- RUN THIS ONLY AFTER step 1 was run AND the new backend is deployed and working. The old backend still reads the three
-- tick-box columns, which is why they are dropped in a separate, later step.
--
-- THIS REMOVES DATA: farmers_farmparcel.is_organic, within_ancestral_domain and is_agrarian_reform_beneficiary. What they held
-- is already in farmers_farmparcel.classifications (step 1 copied it, and this file copies it once more first, in case a
-- parcel was saved by the old backend between step 1 and the deploy). Safe to run more than once.

-- 0. BEFORE (read-only): parcels whose tick-boxes are not in classifications yet (the copy below fixes them).
select count(*) as not_copied_yet
  from farmers_farmparcel
 where (is_organic or within_ancestral_domain or is_agrarian_reform_beneficiary) and classifications = '[]'::jsonb;

-- 1. THE CHANGE (one transaction: all or nothing)
begin;

update public.farmers_farmparcel
   set classifications =
         coalesce(case when is_organic then '["Organic Farm"]'::jsonb end, '[]'::jsonb)
      || coalesce(case when within_ancestral_domain then '["Within Ancestral Domain"]'::jsonb end, '[]'::jsonb)
      || coalesce(case when is_agrarian_reform_beneficiary then '["Agrarian Reform Beneficiary"]'::jsonb end, '[]'::jsonb)
 where (is_organic or within_ancestral_domain or is_agrarian_reform_beneficiary) and classifications = '[]'::jsonb;

alter table public.farmers_farmparcel drop column if exists is_organic;
alter table public.farmers_farmparcel drop column if exists within_ancestral_domain;
alter table public.farmers_farmparcel drop column if exists is_agrarian_reform_beneficiary;

insert into public.django_migrations (app, name, applied)
select 'farmers', '0033_remove_parcel_classification_flags', now()
 where not exists (select 1 from public.django_migrations where app = 'farmers' and name = '0033_remove_parcel_classification_flags');

commit;

-- 2. AFTER (read-only): no rows for the first query; both migrations for the second.
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'farmers_farmparcel'
   and column_name in ('is_organic', 'within_ancestral_domain', 'is_agrarian_reform_beneficiary');
select app, name from django_migrations where app = 'farmers' order by name desc limit 3;
