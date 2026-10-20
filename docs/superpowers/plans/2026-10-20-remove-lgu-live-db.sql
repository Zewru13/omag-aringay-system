-- Remove the fisherfolk LGU registration number (Django migration fisheries 0074_remove_fisherfolk_lgu_registration_number).
-- Run ONCE in the Supabase SQL editor of the project "omag-aringay" (ref zqvemhtzrccbofvwneph), AFTER the pull request is
-- merged and the backend has redeployed (the new code no longer reads the column, and the column is nullable, so the
-- site keeps working in the meantime). Check the project name before running.
--
-- This deletes the column and its unique index. On 2026-10-20 only 8 of 952 fisherfolk had a value and all 8 were demo rows.

alter table fisheries_fisherfolk drop column lgu_registration_number;

insert into django_migrations (app, name, applied) values ('fisheries', '0074_remove_fisherfolk_lgu_registration_number', now());
