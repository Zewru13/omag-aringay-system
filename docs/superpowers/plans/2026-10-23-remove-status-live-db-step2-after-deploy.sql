-- Remove the Active / Inactive status of farmers, fisherfolk, organizations and farm parcels: live-database STEP 2 OF 2.
-- (Django migrations farmers.0031, fisheries.0076, associations.0026.)
--
-- PROJECT: omag-aringay (ref zqvemhtzrccbofvwneph). Do NOT run on zewru_db (the old copy).
-- RUN THIS ONLY AFTER step 1 was run AND the new backend is deployed and working. Dropping a column the OLD backend still
-- reads would break the live site, which is why this is a separate, later file. The new backend does not use the columns.
--
-- THIS REMOVES DATA: the five columns and what they held (every record's active / inactive flag and every parcel's farm
-- status). Nothing else is touched. It cannot be undone except from a backup; the database backups in db_backups/ and
-- Supabase's own backups hold the old values. Before running, optionally see how many records are marked inactive (query 0).
--
-- Safe to run more than once: every step checks first, so a second run changes nothing.
--
-- What it does: drops farmers_farmer.is_active, farmers_farmparcel.farm_status, fisheries_fisherfolk.is_active,
-- associations_farmersorganization.is_active, associations_fisherfolkorganization.is_active, and records the three
-- migrations so Django does not try to run them again. No table is added or removed, so no row-level-security change is
-- needed.

-- 0. BEFORE (read-only): how many records are marked inactive today (these flags are about to disappear).
select 'farmers' as what, count(*) filter (where not is_active) as inactive, count(*) as total from farmers_farmer
union all select 'fisherfolk', count(*) filter (where not is_active), count(*) from fisheries_fisherfolk
union all select 'farmers organizations', count(*) filter (where not is_active), count(*) from associations_farmersorganization
union all select 'fisherfolk organizations', count(*) filter (where not is_active), count(*) from associations_fisherfolkorganization
union all select 'parcels (farm_status = Inactive)', count(*) filter (where farm_status = 'Inactive'), count(*) from farmers_farmparcel;

-- 1. THE CHANGE (one transaction: all or nothing)
begin;

alter table "farmers_farmer"                      drop column if exists "is_active";
alter table "farmers_farmparcel"                  drop column if exists "farm_status";
alter table "fisheries_fisherfolk"                drop column if exists "is_active";
alter table "associations_farmersorganization"    drop column if exists "is_active";
alter table "associations_fisherfolkorganization" drop column if exists "is_active";

insert into django_migrations (app, name, applied)
select v.app, v.name, now()
  from (values ('farmers',      '0031_remove_farmer_is_active_and_more'),
               ('fisheries',    '0076_remove_fisherfolk_is_active'),
               ('associations', '0026_remove_farmersorganization_is_active_and_more')) as v(app, name)
 where not exists (select 1 from django_migrations m where m.app = v.app and m.name = v.name);

commit;

-- 2. AFTER (read-only): no rows for the first query, three rows for the second.
select table_name, column_name from information_schema.columns
 where table_schema = 'public'
   and (table_name, column_name) in (('farmers_farmer', 'is_active'), ('fisheries_fisherfolk', 'is_active'),
        ('associations_farmersorganization', 'is_active'), ('associations_fisherfolkorganization', 'is_active'),
        ('farmers_farmparcel', 'farm_status'));
select app, name from django_migrations
 where (app, name) in (('farmers', '0031_remove_farmer_is_active_and_more'), ('fisheries', '0076_remove_fisherfolk_is_active'),
                       ('associations', '0026_remove_farmersorganization_is_active_and_more'));
