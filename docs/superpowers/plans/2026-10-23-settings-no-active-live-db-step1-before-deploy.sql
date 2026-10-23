-- Settings lists lose their Active / Inactive switch: live-database STEP 1 OF 2.
-- (Django migrations production.0060, fisheries.0077, interventions.0021, farmers.0034 drop six columns; this file prepares the
--  database for them and does NOT remove anything.)
--
-- PROJECT: omag-aringay (ref zqvemhtzrccbofvwneph). Do NOT run on zewru_db (the old copy).
-- RUN THIS BEFORE the new backend is deployed. The new code no longer knows these columns, so it never sends a value for them;
-- they are NOT NULL, so without a default every new activity type, feed type, disease type or assistance agency would fail to save
-- until step 2 is run. With this file, the OLD and the NEW code both work.
--
-- Safe to run more than once. No data is changed or removed (every row is "active" today: nothing is hidden).
--   production_activitytype.is_active, fisheries_fisheriesactivitytype.is_active, fisheries_feedtype.is_active,
--   fisheries_diseasetype.is_active, interventions_assistanceagency.is_active -> default true
-- (farmers_parcelclassification.is_active already has that default; it is dropped in step 2.)

-- 0. BEFORE (read-only): the six columns, and how many rows are hidden today (expected: none).
select table_name, column_name, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and column_name = 'is_active'
   and table_name in ('production_activitytype', 'fisheries_fisheriesactivitytype', 'fisheries_feedtype', 'fisheries_diseasetype',
                      'interventions_assistanceagency', 'farmers_parcelclassification')
 order by table_name;

-- 1. THE CHANGE (one transaction: all or nothing)
begin;

alter table "production_activitytype"             alter column "is_active" set default true;
alter table "fisheries_fisheriesactivitytype"     alter column "is_active" set default true;
alter table "fisheries_feedtype"                  alter column "is_active" set default true;
alter table "fisheries_diseasetype"               alter column "is_active" set default true;
alter table "interventions_assistanceagency"      alter column "is_active" set default true;

commit;

-- 2. AFTER (read-only): every row shows a default of true.
select table_name, column_name, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and column_name = 'is_active'
   and table_name in ('production_activitytype', 'fisheries_fisheriesactivitytype', 'fisheries_feedtype', 'fisheries_diseasetype',
                      'interventions_assistanceagency', 'farmers_parcelclassification')
 order by table_name;
