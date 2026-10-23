-- Settings lists lose their Active / Inactive switch: live-database STEP 2 OF 2.
-- (Django migrations production.0060, fisheries.0077, interventions.0021, farmers.0034.)
--
-- PROJECT: omag-aringay (ref zqvemhtzrccbofvwneph). Do NOT run on zewru_db (the old copy).
-- RUN THIS ONLY AFTER step 1 was run AND the new backend is deployed and working. The old backend still reads these columns.
--
-- THIS REMOVES DATA: the is_active flag of every activity type (crop and fisheries), feed type, disease type, assistance agency
-- and parcel classification. Nothing else is touched. Safe to run more than once.

-- 0. BEFORE (read-only): how many rows are hidden today (these flags are about to disappear). Expected: 0 everywhere.
select 'activity types (crop)' as what, count(*) filter (where not is_active) as hidden, count(*) as total from production_activitytype
union all select 'activity types (fisheries)', count(*) filter (where not is_active), count(*) from fisheries_fisheriesactivitytype
union all select 'feed types', count(*) filter (where not is_active), count(*) from fisheries_feedtype
union all select 'disease types', count(*) filter (where not is_active), count(*) from fisheries_diseasetype
union all select 'assistance agencies', count(*) filter (where not is_active), count(*) from interventions_assistanceagency
union all select 'parcel classifications', count(*) filter (where not is_active), count(*) from farmers_parcelclassification;

-- 1. THE CHANGE (one transaction: all or nothing)
begin;

alter table "production_activitytype"             drop column if exists "is_active";
alter table "fisheries_fisheriesactivitytype"     drop column if exists "is_active";
alter table "fisheries_feedtype"                  drop column if exists "is_active";
alter table "fisheries_diseasetype"               drop column if exists "is_active";
alter table "interventions_assistanceagency"      drop column if exists "is_active";
alter table "farmers_parcelclassification"        drop column if exists "is_active";

insert into django_migrations (app, name, applied)
select v.app, v.name, now()
  from (values ('production',    '0060_remove_activitytype_is_active'),
               ('fisheries',     '0077_remove_diseasetype_is_active_and_more'),
               ('interventions', '0021_remove_assistanceagency_is_active'),
               ('farmers',       '0034_remove_parcelclassification_is_active')) as v(app, name)
 where not exists (select 1 from django_migrations m where m.app = v.app and m.name = v.name);

commit;

-- 2. AFTER (read-only): no rows for the first query, four rows for the second.
select table_name from information_schema.columns
 where table_schema = 'public' and column_name = 'is_active'
   and table_name in ('production_activitytype', 'fisheries_fisheriesactivitytype', 'fisheries_feedtype', 'fisheries_diseasetype',
                      'interventions_assistanceagency', 'farmers_parcelclassification');
select app, name from django_migrations
 where (app, name) in (('production', '0060_remove_activitytype_is_active'), ('fisheries', '0077_remove_diseasetype_is_active_and_more'),
                       ('interventions', '0021_remove_assistanceagency_is_active'), ('farmers', '0034_remove_parcelclassification_is_active'));
