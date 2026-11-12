"""Edit Production Cycle: the Start Production Cycle form filled in. One PATCH of the stocking record (/api/fisheries/stocking/<id>/) changes
the record AND its production cycle together, in one transaction, so the two copies of the stocking date, species, culture phase and ownership
never drift apart.

Run ONLY against an isolated test database (never the shared Supabase database)."""
from datetime import date, timedelta

from fisheries.models import FisheriesActivityLog, FisheriesDisasterReport, FisheriesHarvestRecord, SpeciesOption
from monitoring.models import AquacultureHealthLog, AquacultureProductionCycle
from monitoring.tests import ProductionCycleBase

STOCKING = '/api/fisheries/stocking/'


class CycleEditTests(ProductionCycleBase):
    def make(self, **over):
        r = self.post(**over)
        self.assertEqual(r.status_code, 201, r.content)
        cycle = AquacultureProductionCycle.objects.get(pk=r.data['id'])
        return cycle, cycle.stocking_records.get()

    def patch(self, record, **body):
        return self.client.patch(f'{STOCKING}{record.id}/', body, format='json')

    def refreshed(self, cycle, record):
        cycle.refresh_from_db()
        record.refresh_from_db()

    def other_species(self):
        return SpeciesOption.objects.create(
            species_name='Edit Test Species', category=self.species.category, culture_environment='Brackish', culture_duration_days=150,
            default_survival_rate_pct=70, default_avg_body_weight_kg=0.4)

    # --- the cycle's own fields change together with the record's
    def test_one_save_changes_the_cycle_and_the_record(self):
        cycle, record = self.make()
        target = date.today() + timedelta(days=100)
        r = self.patch(record, cycle_organization=self.org_a2.id, cycle_target_harvest_date=str(target), cycle_ownership='Tenant',
                       cycle_owner_name='Lola Owner', cycle_owner_registration_number='FISHR-1', cycle_name='Nursery Phase',
                       water_source='Spring', fingerling_source='BFAR', survival_rate_pct='75.00')
        self.assertEqual(r.status_code, 200, r.content)
        self.refreshed(cycle, record)
        self.assertEqual((cycle.organization_id, cycle.target_harvest_date, cycle.ownership, cycle.owner_name, cycle.owner_registration_number),
                         (self.org_a2.id, target, 'Tenant', 'Lola Owner', 'FISHR-1'))
        self.assertEqual(cycle.cycle_name, 'Nursery Phase')
        self.assertEqual((record.culture_phase, record.water_source, str(record.survival_rate_pct)), ('Nursery Phase', 'Spring', '75.00'))

    def test_a_culture_phase_that_is_not_in_the_list_is_kept_as_other(self):
        cycle, record = self.make()
        self.assertEqual(self.patch(record, cycle_name='Pre-harvest check').status_code, 200)
        self.refreshed(cycle, record)
        self.assertEqual((cycle.cycle_name, record.culture_phase, record.culture_phase_other_specify), ('Pre-harvest check', 'Other', 'Pre-harvest check'))

    def test_an_organization_the_fisherfolk_is_not_in_is_refused_and_nothing_changes(self):
        cycle, record = self.make()
        r = self.patch(record, cycle_organization=self.org_b.id, cycle_name='Nursery Phase', water_source='Spring')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('cycle_organization', r.json())
        self.refreshed(cycle, record)
        self.assertEqual((cycle.cycle_name, record.water_source), ('Grow-out Phase', 'River'))

    def test_a_tenant_needs_the_owners_name_and_number(self):
        cycle, record = self.make()
        r = self.patch(record, cycle_ownership='Tenant')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertTrue({'cycle_owner_name', 'cycle_ownership'} & set(r.json()), r.json())
        self.refreshed(cycle, record)
        self.assertEqual(cycle.ownership, 'Owner')

    def test_the_target_harvest_date_cannot_be_before_the_stocking_date(self):
        cycle, record = self.make()
        r = self.patch(record, cycle_target_harvest_date=str(record.date_stocked - timedelta(days=1)))
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('cycle_target_harvest_date', r.json())

    def test_cycle_fields_on_a_record_without_a_cycle_are_refused(self):
        _, record = self.make()
        type(record).objects.filter(pk=record.pk).update(production_cycle=None)
        r = self.patch(record, cycle_ownership='Owner')
        self.assertEqual(r.status_code, 400, r.content)

    # --- the stocking date
    def test_a_new_stocking_date_moves_both_copies_and_the_season_year_and_expected_harvest(self):
        cycle, record = self.make()
        new = date.today() - timedelta(days=20)
        r = self.patch(record, date_stocked=str(new))
        self.assertEqual(r.status_code, 200, r.content)
        self.refreshed(cycle, record)
        self.assertEqual((cycle.stocking_date, record.date_stocked, record.year), (new, new, new.year))
        self.assertEqual(record.expected_harvest_date, new + timedelta(days=120))
        self.assertEqual(record.season, 'Wet' if new.month in (6, 7, 8, 9, 10, 11) else 'Dry')

    def test_a_stocking_date_in_the_future_is_refused(self):
        _, record = self.make()
        self.assertEqual(self.patch(record, date_stocked=str(date.today() + timedelta(days=3))).status_code, 400)

    def test_the_stocking_date_cannot_move_after_the_first_activity_log(self):
        cycle, record = self.make()
        logged = date.today() - timedelta(days=5)
        FisheriesActivityLog.objects.create(stocking_record=record, activity='Feed Monitoring', date_of_activity=logged)
        r = self.patch(record, date_stocked=str(logged + timedelta(days=1)))
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('date_stocked', r.json())
        self.assertEqual(self.patch(record, date_stocked=str(logged - timedelta(days=1))).status_code, 200)

    def test_the_stocking_date_cannot_move_after_a_health_log_a_disaster_or_a_harvest(self):
        cycle, record = self.make()
        day = date.today() - timedelta(days=8)
        AquacultureHealthLog.objects.create(production_cycle=cycle, log_date=day, observation='Slow feeding')
        self.assertEqual(self.patch(record, date_stocked=str(day + timedelta(days=1))).status_code, 400)
        AquacultureHealthLog.objects.all().delete()
        FisheriesDisasterReport.objects.create(stocking_record=record, fisherfolk=record.fisherfolk, disaster_type='Flood', date_of_occurrence=day)
        self.assertEqual(self.patch(record, date_stocked=str(day + timedelta(days=1))).status_code, 400)
        FisheriesDisasterReport.objects.all().delete()
        FisheriesHarvestRecord.objects.create(stocking_record=record, harvest_date=day, quantity_kg=5)
        self.assertEqual(self.patch(record, date_stocked=str(day + timedelta(days=1))).status_code, 400)

    # --- species
    def test_the_species_can_change_before_any_activity_and_the_cycle_follows(self):
        cycle, record = self.make()
        bangus = self.other_species()
        r = self.patch(record, species=bangus.id)
        self.assertEqual(r.status_code, 200, r.content)
        self.refreshed(cycle, record)
        self.assertEqual((record.species_id, cycle.species_farmed), (bangus.id, 'Edit Test Species'))
        self.assertEqual(record.expected_harvest_date, record.date_stocked + timedelta(days=150))

    def test_the_species_is_locked_once_the_cycle_has_an_activity_log_or_a_harvest(self):
        cycle, record = self.make()
        bangus = self.other_species()
        FisheriesActivityLog.objects.create(stocking_record=record, activity='Feed Monitoring', date_of_activity=date.today())
        r = self.patch(record, species=bangus.id)
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('species', r.json())
        self.refreshed(cycle, record)
        self.assertEqual(cycle.species_farmed, 'Tilapia')
        # saving the form with the same species is not a change
        self.assertEqual(self.patch(record, species=self.species.id, water_source='Spring').status_code, 200)

    # --- the numbers
    def test_with_ponds_the_count_and_area_come_from_the_ponds_and_cannot_be_typed(self):
        cycle, record = self.make()
        before = (record.number_of_fingerlings, cycle.stocking_count, cycle.area_sqm)
        self.assertEqual(self.patch(record, number_of_fingerlings=999, cycle_stocking_count=999).status_code, 200)
        self.refreshed(cycle, record)
        self.assertEqual((record.number_of_fingerlings, cycle.stocking_count, cycle.area_sqm), before)

    def test_without_ponds_the_count_is_kept_in_both_copies(self):
        cycle, record = self.make()
        cycle.units.all().delete()
        self.assertEqual(self.patch(record, number_of_fingerlings=640).status_code, 200)
        self.refreshed(cycle, record)
        self.assertEqual((record.number_of_fingerlings, cycle.stocking_count), (640, 640))

    # --- unchanged things stay unchanged
    def test_the_save_of_an_untouched_form_changes_nothing_else(self):
        cycle, record = self.make()
        before = (cycle.cycle_name, cycle.stocking_date, cycle.ownership, cycle.organization_id, record.status, cycle.units.count())
        r = self.patch(record, cycle_name=cycle.cycle_name, date_stocked=str(record.date_stocked), species=self.species.id, cycle_ownership='Owner')
        self.assertEqual(r.status_code, 200, r.content)
        self.refreshed(cycle, record)
        self.assertEqual(before, (cycle.cycle_name, cycle.stocking_date, cycle.ownership, cycle.organization_id, record.status, cycle.units.count()))
