-- Purge a farm parcel (sold or transferred): live-database change for Django migration farmers.0035_farmparcel_purge.
--
-- PROJECT: omag-aringay (ref zqvemhtzrccbofvwneph). Do NOT run on zewru_db (the old copy).
-- RUN THIS BEFORE the new backend is deployed (the new backend reads these columns on every parcel query). It is only additions:
-- nothing is dropped and no row changes, so the old backend keeps working while it is in place. There is no "step 2".
-- Safe to run more than once.
--
-- What it does: adds five columns to farmers_farmparcel, all empty for every existing parcel (a parcel is in use until it is purged):
--   purged_at (timestamp, indexed), purge_reason (Sold / Transferred), purge_date (the day it was sold or transferred),
--   purge_note (free text) and purged_by_id (the staff user who purged it, kept as NULL if that user is deleted);
-- gives the two text columns a default of '' so the OLD backend (which does not know them) can still save parcels;
-- and records migration 0035 so Django does not try to run it again. No table is added, so no row-level-security change is needed.

-- 0. BEFORE (read-only): the columns should not exist yet (no rows), and how many parcels there are.
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'farmers_farmparcel'
   and column_name in ('purged_at', 'purge_reason', 'purge_date', 'purge_note', 'purged_by_id');
select count(*) as parcels from farmers_farmparcel;

-- 1. THE CHANGE (one transaction: all or nothing)
begin;

alter table public.farmers_farmparcel add column if not exists purged_at    timestamptz null;
alter table public.farmers_farmparcel add column if not exists purge_reason varchar(20) not null default '';
alter table public.farmers_farmparcel add column if not exists purge_date   date null;
alter table public.farmers_farmparcel add column if not exists purge_note   text not null default '';
alter table public.farmers_farmparcel add column if not exists purged_by_id bigint null;

create index if not exists farmers_farmparcel_purged_at_idx on public.farmers_farmparcel (purged_at);
create index if not exists farmers_farmparcel_purged_by_id_idx on public.farmers_farmparcel (purged_by_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'farmers_farmparcel_purged_by_id_fk_accounts_user') then
    alter table public.farmers_farmparcel
      add constraint farmers_farmparcel_purged_by_id_fk_accounts_user
      foreign key (purged_by_id) references public.accounts_user (id) on delete set null deferrable initially deferred;
  end if;
end $$;

insert into public.django_migrations (app, name, applied)
select 'farmers', '0035_farmparcel_purge', now()
 where not exists (select 1 from public.django_migrations where app = 'farmers' and name = '0035_farmparcel_purge');

commit;

-- 2. AFTER (read-only): five rows for the first query; every parcel still in use (purged_at empty) for the second; one row for the third.
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'farmers_farmparcel'
   and column_name in ('purged_at', 'purge_reason', 'purge_date', 'purge_note', 'purged_by_id');
select count(*) filter (where purged_at is null) as in_use, count(*) as parcels from farmers_farmparcel;
select app, name from django_migrations where app = 'farmers' and name = '0035_farmparcel_purge';
