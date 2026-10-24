-- Forced Harvest of crops: live-database change for Django migration production.0061_harvestrecord_force_harvest_reason.
--
-- PROJECT: omag-aringay (ref zqvemhtzrccbofvwneph). Do NOT run on zewru_db (the old copy).
-- RUN THIS BEFORE the new backend is deployed (the new backend reads this column on every harvest query). It is only an addition:
-- nothing is dropped and no row changes, so the old backend keeps working while it is in place. There is no "step 2".
-- Safe to run more than once.
--
-- What it does: adds production_harvestrecord.force_harvest_reason (varchar(30), empty for every harvest that already exists - it
-- holds the reason code, e.g. upcoming_typhoon, only for a crop harvested before it was ready), with a default of '' so the OLD
-- backend (which does not know the column) can still save harvests; and records migration 0061 so Django does not run it again.
-- No table is added, so no row-level-security change is needed.

-- 0. BEFORE (read-only): the column should not exist yet (no row), and how many harvests there are.
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'production_harvestrecord' and column_name = 'force_harvest_reason';
select count(*) as harvests from production_harvestrecord;

-- 1. THE CHANGE (one transaction: all or nothing)
begin;

alter table public.production_harvestrecord add column if not exists force_harvest_reason varchar(30) not null default '';

insert into public.django_migrations (app, name, applied)
select 'production', '0061_harvestrecord_force_harvest_reason', now()
 where not exists (select 1 from public.django_migrations where app = 'production' and name = '0061_harvestrecord_force_harvest_reason');

commit;

-- 2. AFTER (read-only): one row for the first query; every existing harvest still has an empty reason (forced = 0) for the second;
-- one row for the third.
select column_name, column_default from information_schema.columns
 where table_schema = 'public' and table_name = 'production_harvestrecord' and column_name = 'force_harvest_reason';
select count(*) filter (where force_harvest_reason <> '') as forced, count(*) as harvests from production_harvestrecord;
select app, name from django_migrations where app = 'production' and name = '0061_harvestrecord_force_harvest_reason';
