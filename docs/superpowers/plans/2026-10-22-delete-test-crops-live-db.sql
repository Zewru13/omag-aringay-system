-- Delete the three leftover TEST crop options on the live database.
-- Run ONCE in the Supabase SQL editor of the project "omag-aringay" (ref zqvemhtzrccbofvwneph), AFTER the pull request
-- "remove status from the crop settings tables" is merged. Check the project name before running.
--
-- Why: the Active/Inactive control is gone from the crop options table, so these three inactive test rows could never be
-- reactivated or hidden again. On 2026-10-22 they had no varieties, no planting records, no input-type links, no
-- activity stages, no remarks and no disaster rules. Every foreign key to this table is "no action", so if anything
-- were attached this delete would simply fail and change nothing.

delete from production_croptype
where id in (41, 42, 46)
  and name in ('Imported String Beans', 'Test crop', 'TestCrop')
  and not is_active;
