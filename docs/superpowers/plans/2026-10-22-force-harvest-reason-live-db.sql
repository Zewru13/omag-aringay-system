-- Emergency Force Harvest (Aquaculture Monitoring ⋮ menu > Force Harvest): live-database change for migration
-- fisheries.0075_fisheriesharvestrecord_force_harvest_reason.
--
-- PROJECT: omag-aringay (ref zqvemhtzrccbofvwneph). Do NOT run on zewru_db (the old copy).
-- RUN THIS BEFORE the backend that contains the feature is deployed: the new code reads and writes the column, so without it
-- the harvest pages would fail with "column force_harvest_reason does not exist".
--
-- Safe to run more than once: every step checks first, so a second run changes nothing (it was already applied on the live
-- database on 2026-10-22 and a repeat run of the first version failed with "column already exists" without changing anything).
--
-- What it does (one column, no data touched):
--   * adds fisheries_fisheriesharvestrecord.force_harvest_reason  varchar(20) NOT NULL, every existing row gets '' (blank),
--     which is exactly what "not an emergency Force Harvest" means - every existing harvest (normal and Health Log Force
--     Harvest) keeps behaving as before;
--   * records the migration so Django does not try to run it again.
-- No new table, so no row-level-security change is needed (the table already has RLS on and the anon / authenticated
-- privileges revoked; ADD COLUMN does not change either).

-- 0. BEFORE (read-only): shows what is already there (0 rows from both on a database that has not had the change yet).
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'fisheries_fisheriesharvestrecord' and column_name = 'force_harvest_reason';
select app, name from django_migrations where app = 'fisheries' and name like '0075%';

-- 1. THE CHANGE (one transaction: all or nothing)
begin;

alter table "fisheries_fisheriesharvestrecord" add column if not exists "force_harvest_reason" varchar(20) default '' not null;
alter table "fisheries_fisheriesharvestrecord" alter column "force_harvest_reason" drop default;

insert into django_migrations (app, name, applied)
select 'fisheries', '0075_fisheriesharvestrecord_force_harvest_reason', now()
 where not exists (select 1 from django_migrations where app = 'fisheries' and name = '0075_fisheriesharvestrecord_force_harvest_reason');

commit;

-- 2. AFTER (read-only): expect one row for the column (varchar, 20, NO), blank on every existing record, and the migration row.
select column_name, data_type, character_maximum_length, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'fisheries_fisheriesharvestrecord' and column_name = 'force_harvest_reason';
select count(*) as harvest_records, count(*) filter (where force_harvest_reason <> '') as emergency_force_harvests
  from fisheries_fisheriesharvestrecord;                       -- emergency_force_harvests is 0 until the feature is used
select app, name from django_migrations where app = 'fisheries' order by name desc limit 2;   -- 0075 first, then 0074
