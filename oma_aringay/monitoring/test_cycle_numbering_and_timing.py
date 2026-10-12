"""Per-fisherfolk production cycle numbering and the displayed harvest status (Stocked / Near Harvest / Late).

Run ONLY against an isolated test database (never the shared Supabase database)."""
import itertools
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from fisheries.models import (
    FisheriesHarvestRecord, Fisherfolk, SpeciesCategory, SpeciesOption, StockingRecord, harvest_timing,
    production_cycle_numbers_bulk, stocking_display_status,
)
from monitoring.models import AquacultureHealthLog, AquacultureProductionCycle

STOCKING = '/api/fisheries/stocking/'


_RSBSA = itertools.count(991000)


def _rsbsa():
    """A unique, well-formed RSBSA number: every fisherfolk needs one."""
    return '01-033-02-019-%06d' % next(_RSBSA)


class _Base(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='adm', password='pw', role='ADMIN', email='adm@x.test')
        make = lambda n: Fisherfolk.objects.create(
            first_name=n, last_name='Test', gender='Male', birthdate=timezone.localdate().replace(year=1990),
            barangay='Poblacion', fisherfolk_type='Aquaculture', rsbsa_number=_rsbsa(),   # required for every fisherfolk
        )
        cls.ff_a, cls.ff_b, cls.ff_c = make('Ann'), make('Ben'), make('Cy')
        cat, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        cls.species = SpeciesOption.objects.create(
            species_name='Test Tilapia', category=cat, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=Decimal('80'), default_avg_body_weight_kg=Decimal('0.25'),
        )
        cls.base_time = timezone.now() - timedelta(days=30)

    def setUp(self):
        self.client.force_authenticate(self.admin)
        self.tick = 0

    def logged_at(self, model, pk, minutes=None):
        """Pin date_recorded so the logging order is explicit (auto_now_add sets it on create)."""
        self.tick += 1
        model.objects.filter(pk=pk).update(date_recorded=self.base_time + timedelta(minutes=minutes if minutes is not None else self.tick))

    def cycle(self, ff, with_record=True, minutes=None):
        c = AquacultureProductionCycle.objects.create(
            fisherfolk=ff, cycle_name='Grow-out', species_farmed='Tilapia', culture_system='Fishpond',
            stocking_date=timezone.localdate() - timedelta(days=10),
        )
        self.logged_at(AquacultureProductionCycle, c.pk, minutes)
        rec = self.record(ff, cycle=c) if with_record else None
        return c, rec

    def record(self, ff, cycle=None, **over):
        rec = StockingRecord.objects.create(
            fisherfolk=ff, production_cycle=cycle, species=self.species, culture_type='Pond',
            date_stocked=timezone.localdate() - timedelta(days=10), number_of_fingerlings=100,
            season='Dry', year=timezone.localdate().year,
        )
        self.logged_at(StockingRecord, rec.pk)
        if over:
            StockingRecord.objects.filter(pk=rec.pk).update(**over)
        rec.refresh_from_db()
        return rec

    def numbers(self, *recs):
        fresh = list(StockingRecord.objects.filter(pk__in=[r.pk for r in recs]))
        by_id = production_cycle_numbers_bulk(fresh)
        return [by_id[r.pk] for r in recs]

    def rows(self, params=None):
        r = self.client.get(STOCKING, params or {'status': 'Stocked,Near Harvest,Harvested,Total Loss'})
        self.assertEqual(r.status_code, 200)
        return {row['id']: row for row in (r.data['results'] if isinstance(r.data, dict) else r.data)}


class CycleNumberingTests(_Base):
    def test_each_fisherfolk_has_its_own_sequence_in_logging_order(self):
        # Alternating creation across fisherfolk: A1, B1, A2, C1, B2, A3.
        _, a1 = self.cycle(self.ff_a)
        _, b1 = self.cycle(self.ff_b)
        _, a2 = self.cycle(self.ff_a)
        _, c1 = self.cycle(self.ff_c)
        _, b2 = self.cycle(self.ff_b)
        _, a3 = self.cycle(self.ff_a)
        self.assertEqual(self.numbers(a1, a2, a3, b1, b2, c1), [1, 2, 3, 1, 2, 1])
        self.assertEqual([r.compute_production_cycle_no() for r in (a1, a2, a3, b1, b2, c1)], [1, 2, 3, 1, 2, 1])

    def test_order_is_logging_order_not_stocking_date_or_species(self):
        _, first = self.cycle(self.ff_a)
        _, second = self.cycle(self.ff_a)
        # The later-logged cycle was stocked EARLIER and is another species: still Cycle 2.
        other = SpeciesOption.objects.create(species_name='Test Bangus', category=self.species.category,
                                             culture_environment='Brackish', culture_duration_days=90,
                                             default_survival_rate_pct=Decimal('80'), default_avg_body_weight_kg=Decimal('0.3'))
        StockingRecord.objects.filter(pk=second.pk).update(date_stocked=timezone.localdate() - timedelta(days=200), species=other)
        self.assertEqual(self.numbers(first, second), [1, 2])

    def test_unlinked_records_take_their_own_place_and_linked_ones_count_once(self):
        _, c1_rec = self.cycle(self.ff_a)
        legacy = self.record(self.ff_a)                     # no production cycle: one production run of its own
        c2, c2_rec = self.cycle(self.ff_a)
        c2_extra = self.record(self.ff_a, cycle=c2)         # a 2nd stocking record of the SAME cycle
        _, c3_rec = self.cycle(self.ff_a)
        self.assertEqual(self.numbers(c1_rec, legacy, c2_rec, c2_extra, c3_rec), [1, 2, 3, 3, 4])

    def test_cycle_without_a_stocking_record_still_takes_its_place(self):
        _, first = self.cycle(self.ff_a)
        self.cycle(self.ff_a, with_record=False)
        _, third = self.cycle(self.ff_a)
        self.assertEqual(self.numbers(first, third), [1, 3])

    def test_same_timestamp_never_duplicates(self):
        # Two cycles logged at the same instant (e.g. concurrent requests): distinct numbers by id.
        c1, r1 = self.cycle(self.ff_a, minutes=5)
        c2, r2 = self.cycle(self.ff_a, minutes=5)
        self.assertEqual(sorted(self.numbers(r1, r2)), [1, 2])
        self.assertEqual(self.numbers(r1, r2), [1, 2] if c1.id < c2.id else [2, 1])

    def test_logs_harvests_and_units_do_not_change_numbers(self):
        c1, r1 = self.cycle(self.ff_a)
        _, r2 = self.cycle(self.ff_a)
        before = self.numbers(r1, r2)
        AquacultureHealthLog.objects.create(production_cycle=c1, log_date=timezone.localdate(), observation='Fish Mortality', mortality_count=3)
        FisheriesHarvestRecord.objects.create(stocking_record=r1, harvest_date=timezone.localdate(), quantity_kg='5')
        self.assertEqual(self.numbers(r1, r2), before)

    def test_record_without_fisherfolk_has_no_number(self):
        orphan = self.record(None)
        self.assertEqual(self.numbers(orphan), [None])

    def test_deleting_an_earlier_cycle_moves_later_numbers_up(self):
        # Documented trade-off of computed (not stored) numbers.
        c1, r1 = self.cycle(self.ff_a)
        _, r2 = self.cycle(self.ff_a)
        _, r3 = self.cycle(self.ff_a)
        self.assertEqual(self.numbers(r1, r2, r3), [1, 2, 3])
        r1.delete(); c1.delete()
        self.assertEqual(self.numbers(r2, r3), [1, 2])

    def test_list_query_count_does_not_grow_with_rows(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.rows()
            return len(ctx.captured_queries)
        self.cycle(self.ff_a); self.record(self.ff_b)
        few = count()
        for ff in (self.ff_a, self.ff_b, self.ff_c, self.ff_a, self.ff_b, self.ff_c):
            self.cycle(ff); self.record(ff)
        self.assertEqual(count(), few)      # 2 -> 14 rows, same number of queries (no per-row numbering query)

    def test_yield_analysis_and_cycle_started_notification_use_the_same_number(self):
        from unittest import mock
        from fisheries import notifications as fn
        _, first = self.cycle(self.ff_a)
        c2, second = self.cycle(self.ff_a)
        StockingRecord.objects.filter(pk__in=[first.pk, second.pk]).update(status='Harvested')
        for r in (first, second):
            FisheriesHarvestRecord.objects.create(stocking_record=r, harvest_date=timezone.localdate(), quantity_kg='5', is_final=True)
        ya = self.client.get('/api/fisheries/yield-analysis/')
        self.assertEqual(ya.status_code, 200)
        listed = self.rows()
        by_id = {row['id']: row for row in ya.data['records']}
        self.assertEqual({rid: by_id[rid]['production_cycle_no'] for rid in (first.id, second.id)},
                         {first.id: 1, second.id: 2})
        self.assertEqual({rid: listed[rid]['production_cycle_no'] for rid in (first.id, second.id)},
                         {first.id: 1, second.id: 2})
        self.assertEqual(self.client.get('/api/fisheries/yield-analysis/summary/').status_code, 200)
        with mock.patch.object(fn, 'notify_owner_and_staff') as notify, self.captureOnCommitCallbacks(execute=True):
            fn.queue_cycle_started(c2, self.admin)
        owner_text = notify.call_args.args[4]
        self.assertIn('Cycle #2', ' '.join(str(part) for part in owner_text))

    def test_yield_summary_survives_a_record_without_fisherfolk(self):
        orphan = self.record(None, status='Harvested', estimated_harvest_kg=Decimal('10'))
        FisheriesHarvestRecord.objects.create(stocking_record=orphan, harvest_date=timezone.localdate(), quantity_kg='8', is_final=True)
        for ff in (self.ff_a, self.ff_a, self.ff_b):
            _, r = self.cycle(ff)
            StockingRecord.objects.filter(pk=r.pk).update(status='Harvested', estimated_harvest_kg=Decimal('10'))
            FisheriesHarvestRecord.objects.create(stocking_record=r, harvest_date=timezone.localdate(), quantity_kg='9', is_final=True)
        r = self.client.get('/api/fisheries/yield-analysis/summary/')
        self.assertEqual(r.status_code, 200)                 # a None number is skipped, not compared with 3

    def test_admin_and_fisherfolk_see_the_same_numbers_and_only_allowed_records(self):
        _, a1 = self.cycle(self.ff_a)
        _, b1 = self.cycle(self.ff_b)
        _, a2 = self.cycle(self.ff_a)
        admin_rows = self.rows()
        self.assertEqual({rid: admin_rows[rid]['production_cycle_no'] for rid in (a1.id, a2.id, b1.id)},
                         {a1.id: 1, a2.id: 2, b1.id: 1})
        User = get_user_model()
        citizen = User.objects.create_user(username='ann_c', password='pw', role='CITIZEN', email='ann_c@x.test')
        UserLinkedRecord.objects.create(user=citizen, record_type=User.LinkedRecordType.FISHERFOLK, record_id=self.ff_a.id, is_active=True)
        self.client.force_authenticate(citizen)
        own = self.rows()
        self.assertEqual(set(own), {a1.id, a2.id})                                    # never Ben's record
        self.assertEqual({rid: own[rid]['production_cycle_no'] for rid in own}, {a1.id: 1, a2.id: 2})
        # The single-record (detail) path agrees with the list.
        self.assertEqual(self.client.get(f'{STOCKING}{a2.id}/').data['production_cycle_no'], 2)


class DisplayStatusTests(_Base):
    def rec(self, days_to_expected, status='Stocked', **over):
        today = timezone.localdate()
        return self.record(self.ff_a, status=status, expected_harvest_date=today + timedelta(days=days_to_expected), **over)

    def test_active_status_follows_the_expected_date(self):
        cases = {
            -3: 'Late',            # e.g. expected Oct 8, today Oct 11
            -1: 'Late',
            0: 'Near Harvest',     # due today
            3: 'Near Harvest',
            7: 'Near Harvest',
            8: 'Stocked',
            30: 'Stocked',
        }
        for days, expected in cases.items():
            for stored in ('Stocked', 'Near Harvest'):       # stale stored values are corrected either way
                with self.subTest(days=days, stored=stored):
                    self.assertEqual(stocking_display_status(self.rec(days, status=stored)), expected)

    def test_terminal_statuses_are_never_replaced_by_late(self):
        self.assertEqual(stocking_display_status(self.rec(-10, status='Harvested')), 'Harvested')
        self.assertEqual(stocking_display_status(self.rec(-10, status='Total Loss')), 'Total Loss')

    def test_records_without_a_reliable_date_filter_by_their_stored_status(self):
        no_date = self.record(self.ff_a, status='Near Harvest', expected_harvest_date=None)
        estimated = self.rec(-3, status='Stocked', date_stocked_is_estimated=True)
        self.assertEqual(set(self.rows({'status': 'Near Harvest'})), {no_date.id})
        self.assertEqual(set(self.rows({'status': 'Stocked'})), {estimated.id})
        self.assertEqual(set(self.rows({'status': 'Late'})), set())
        self.assertEqual(set(self.rows({'status': 'Stocked,Near Harvest'})), {no_date.id, estimated.id})

    def test_each_record_matches_exactly_one_single_status_filter(self):
        recs = [self.rec(d, status=s) for d in (-3, 0, 7, 8) for s in ('Stocked', 'Near Harvest')]
        recs += [self.rec(-3, status='Harvested'), self.rec(-3, status='Total Loss')]
        hits = {r.id: [] for r in recs}
        for label in ('Stocked', 'Near Harvest', 'Late', 'Harvested', 'Total Loss'):
            for rid in self.rows({'status': label}):
                hits[rid].append(label)
        displayed = self.rows()
        self.assertEqual({rid: labels for rid, labels in hits.items()},
                         {rid: [displayed[rid]['display_status']] for rid in hits})

    def test_estimated_stocking_date_keeps_stored_status(self):
        # Same guard as StockingRecord.save(): an unconfirmed stocking date never auto-flips the status.
        self.assertEqual(stocking_display_status(self.rec(-3, status='Stocked', date_stocked_is_estimated=True)), 'Stocked')

    def test_partially_harvested_late_cycle_stays_late_not_harvested(self):
        r = self.rec(-3, status='Stocked')
        FisheriesHarvestRecord.objects.create(stocking_record=r, harvest_date=timezone.localdate(), quantity_kg='4')   # not final
        r.refresh_from_db()
        self.assertEqual((r.status, stocking_display_status(r)), ('Stocked', 'Late'))
        row = self.rows()[r.id]
        self.assertEqual((row['display_status'], row['status'], row['harvest_count']), ('Late', 'Stocked', 1))

    def test_completed_harvest_keeps_harvested_with_its_own_timing(self):
        today = timezone.localdate()
        for days_after_expected, timing in ((-2, 'early'), (0, 'on_time'), (3, 'late')):
            with self.subTest(timing=timing):
                r = self.rec(-days_after_expected, status='Stocked')
                FisheriesHarvestRecord.objects.create(stocking_record=r, harvest_date=today, quantity_kg='9', is_final=True)
                row = self.rows()[r.id]
                self.assertEqual((row['status'], row['display_status'], row['actual_harvest_timing']), ('Harvested', 'Harvested', timing))
                self.assertEqual(harvest_timing(today, r.expected_harvest_date)[0], timing)

    def test_api_returns_display_status_and_filters_by_it(self):
        late = self.rec(-3, status='Near Harvest')      # the reported bug: stored Near Harvest, 3 days past due
        near = self.rec(4, status='Stocked')            # stale stored Stocked, now inside the window
        far = self.rec(30, status='Stocked')
        done = self.rec(-5, status='Harvested')
        rows = self.rows()
        self.assertEqual({rid: rows[rid]['display_status'] for rid in (late.id, near.id, far.id, done.id)},
                         {late.id: 'Late', near.id: 'Near Harvest', far.id: 'Stocked', done.id: 'Harvested'})
        self.assertEqual(set(self.rows({'status': 'Late'})), {late.id})
        self.assertEqual(set(self.rows({'status': 'Near Harvest'})), {near.id})
        self.assertEqual(set(self.rows({'status': 'Stocked'})), {far.id})
        # The "All Status" / Forecast scope still lists the late, unharvested cycle.
        self.assertEqual(set(self.rows({'status': 'Stocked,Near Harvest,Harvested'})), {late.id, near.id, far.id, done.id})
        # Stored status is untouched - reads never write.
        late.refresh_from_db()
        self.assertEqual(late.status, 'Near Harvest')
