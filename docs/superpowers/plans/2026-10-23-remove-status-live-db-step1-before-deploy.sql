-- Remove the Active / Inactive status of farmers, fisherfolk, organizations and farm parcels: live-database STEP 1 OF 2.
-- (Django migrations farmers.0031, fisheries.0076, associations.0026 drop five columns; this file prepares the database
--  for them and does NOT remove anything.)
--
-- PROJECT: omag-aringay (ref zqvemhtzrccbofvwneph). Do NOT run on zewru_db (the old copy).
-- RUN THIS BEFORE the new backend is deployed. The new code no longer knows these columns, so it never sends a value for
-- them; the columns are NOT NULL with no default, so without this file every new farmer / fisherfolk / organization / parcel
-- would fail to save until step 2 is run. With this file, the OLD and the NEW code both work.
--
-- Safe to run more than once. No data is changed or removed.
--
-- What it does: gives each of the five columns a default value (what everything already is: active).
--   farmers_farmer.is_active, fisheries_fisherfolk.is_active, associations_farmersorganization.is_active,
--   associations_fisherfolkorganization.is_active  -> default true
--   farmers_farmparcel.farm_status                 -> default 'Active'

-- 0. BEFORE (read-only): the five columns exist, are NOT NULL, and have no default yet.
select table_name, column_name, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and (table_name, column_name) in (('farmers_farmer', 'is_active'), ('fisheries_fisherfolk', 'is_active'),
        ('associations_farmersorganization', 'is_active'), ('associations_fisherfolkorganization', 'is_active'),
        ('farmers_farmparcel', 'farm_status'))
 order by table_name;

-- 1. THE CHANGE (one transaction: all or nothing)
begin;

alter table "farmers_farmer"                         alter column "is_active"   set default true;
alter table "fisheries_fisherfolk"                   alter column "is_active"   set default true;
alter table "associations_farmersorganization"       alter column "is_active"   set default true;
alter table "associations_fisherfolkorganization"    alter column "is_active"   set default true;
alter table "farmers_farmparcel"                     alter column "farm_status" set default 'Active';

commit;

-- 2. AFTER (read-only): all five rows now show a default.
select table_name, column_name, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and (table_name, column_name) in (('farmers_farmer', 'is_active'), ('fisheries_fisherfolk', 'is_active'),
        ('associations_farmersorganization', 'is_active'), ('associations_fisherfolkorganization', 'is_active'),
        ('farmers_farmparcel', 'farm_status'))
 order by table_name;
