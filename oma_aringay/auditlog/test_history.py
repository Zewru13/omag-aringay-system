"""The history of one farmer, fisherfolk or cooperative, built from the records themselves, so it covers the past too. Admin only."""
from datetime import date, datetime, timedelta
from datetime import timezone as dt_timezone

from rest_framework.test import APITestCase

from associations.models import (
    FarmersOrganization, FarmersOrganizationEquipment, FarmersOrganizationEquipmentLoan, FarmersOrganizationEquipmentRepair,
    FarmersOrganizationMember, FisherfolkOrganization, FisherfolkOrganizationMember, FisherfolkOrganizationOfficer,
    OrganizationOfficer,
)
from auditlog.test_audit_log import make_citizen, make_staff
from auditlog.test_people import make_fisherfolk
from core.models import ProfileChangeRequest
from core.test_profile_consent import make_farmer
from farmers.models import Farmer, FarmerMachinery, FarmParcel
from fisheries.models import (
    Fisherfolk, FisheriesActivityLog, FisheriesDisasterReport, FisheriesHarvestRecord, FishingTripLog, Pond, SpeciesCategory,
    SpeciesOption, StockingRecord,
)
from interventions.models import BeneficiaryRecord, FisherfolkBeneficiaryRecord
from interventions.test_helpers import make_org
from monitoring.models import AquacultureFeedingLog, AquacultureHealthLog, AquacultureProductionCycle, FarmVisit
from production.models import CropActivityLog, CropDisasterReport, CropMonitoringRecord, CropType, HarvestRecord

GONE = 'This record is no longer in the system.'


def url(kind, pk):
    return f'/api/auditlog/history/{kind}/{pk}/'


def noon(day):
    return datetime(day.year, day.month, day.day, 4, 0, tzinfo=dt_timezone.utc)     # 12:00 in Manila


def stamp(record, **dates):
    """Set the dates the system fills in by itself."""
    type(record)._base_manager.filter(pk=record.pk).update(**{name: noon(day) for name, day in dates.items()})
    return record


def d(month, day):
    return date(2026, month, day)


class HistoryTestBase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = make_staff('hi-admin')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def everything(self, kind, pk):
        """Every event of every page, as (date, what, module)."""
        rows, page = [], 1
        while True:
            res = self.client.get(url(kind, pk), {'page': page})
            self.assertEqual(res.status_code, 200, res.content)
            rows += [(r['date'], r['what'], r['module']) for r in res.data['results']]
            if len(rows) >= res.data['count']:
                return res.data['subject'], rows
            page += 1


class FarmerHistoryTests(HistoryTestBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.farmer = stamp(make_farmer('Hist'), date_registered=d(1, 2))
        cls.coop = make_org(FarmersOrganization, 'Story')
        parcel = FarmParcel.objects.create(farmer=cls.farmer, parcel_number='01-33-02-005-001-09-001', area_hectares='3.00',
                                           land_ownership='Owner', barangay='Alaska')
        FarmerMachinery.objects.create(farmer=cls.farmer, machinery_type=FarmerMachinery._meta.get_field('machinery_type').choices[0][0])
        rice = CropType.objects.create(name='History Rice', days_to_harvest=100)
        crop = CropMonitoringRecord.objects.create(
            farmer=cls.farmer, farm_parcel=parcel, crop_type=rice, season='Wet', year=2026, farm_location_barangay='Alaska',
            land_status='Owner', area_planted_ha='1.50', status='Planted', date_planted=d(2, 1), variety_used='')
        CropActivityLog.objects.create(monitoring_record=crop, activity_type='Weeding', date_of_activity=d(2, 10))
        report = CropDisasterReport.objects.create(monitoring_record=crop, disaster_type='Typhoon', date_of_occurrence=d(3, 1),
                                                   estimated_damage='x')
        CropDisasterReport.objects.filter(pk=report.pk).update(recovered_date=d(3, 20))
        HarvestRecord.objects.create(farm_parcel=parcel, season='Wet', year=2026, crop_name='History Rice', area_harvested_hectares='1.50',
                                     volume_kg='1250.00', harvest_end_date=d(5, 1), monitoring_record=None)
        BeneficiaryRecord.objects.create(farmer=cls.farmer, assistance_type='Seeds', seed_type='Hybrid', quantity='2 sacks',
                                         source_agencies=['DA'], date_given=d(5, 10))
        FarmVisit.objects.create(farmer=cls.farmer, visit_date=d(5, 20), purpose='Check the field')
        FarmersOrganizationMember.objects.create(organization=cls.coop, farmer=cls.farmer, date_joined=d(6, 1), is_active=False)
        OrganizationOfficer.objects.create(organization=cls.coop, farmer=cls.farmer, position='Treasurer', full_name=cls.farmer.full_name,
                                           term_start_date=d(6, 5), term_end_date=d(6, 25), is_active=False)
        tractor = FarmersOrganizationEquipment.objects.create(organization=cls.coop, equipment_name='Other', equipment_name_other='Hand Tractor',
                                                              quantity=3, condition='Good')
        FarmersOrganizationEquipmentLoan.objects.create(equipment=tractor, member=cls.farmer, quantity=1, status='Returned',
                                                        origin='Direct', borrowed_at=noon(d(7, 1)), returned_at=noon(d(7, 9)))
        asked = FarmersOrganizationEquipmentLoan.objects.create(equipment=tractor, member=cls.farmer, quantity=2, status='Rejected',
                                                                origin='Request')
        stamp(asked, requested_at=d(7, 15))
        change = ProfileChangeRequest.objects.create(linked_record_type='FARMER', linked_record_id=cls.farmer.id, field_name='middle_name',
                                                     requested_value='Cruz', requested_by=cls.admin, status='REJECTED')
        stamp(change, requested_at=d(8, 1), reviewed_at=d(8, 3))

    def test_every_kind_of_record_newest_first(self):
        subject, rows = self.everything('farmer', self.farmer.id)
        name = self.coop.name
        self.assertEqual(rows, [
            ('2026-08-03', 'Change of middle name: Rejected', 'Sign-in & Account'),
            ('2026-08-01', 'Asked to change middle name to "Cruz"', 'Sign-in & Account'),
            ('2026-07-15', 'Asked to borrow 2 Hand Tractor', 'Cooperatives'),
            ('2026-07-09', f'Returned 1 Hand Tractor to {name}', 'Cooperatives'),
            ('2026-07-01', f'Borrowed 1 Hand Tractor from {name}', 'Cooperatives'),
            ('2026-06-25', f'Term as Treasurer of {name} ended', 'Cooperatives'),
            ('2026-06-05', f'Became Treasurer of {name}', 'Cooperatives'),
            ('2026-06-01', f'Joined {name} (ended)', 'Cooperatives'),
            ('2026-05-20', 'Farm visit: Check the field', 'Registration'),
            ('2026-05-10', 'Assistance: Seeds Hybrid, 2 sacks', 'Assistance'),
            ('2026-05-01', 'Harvested History Rice: 1,250 kg', 'Crop Management'),
            ('2026-03-20', 'History Rice recovered from Typhoon', 'Disaster'),
            ('2026-03-01', 'Disaster on History Rice: Typhoon', 'Disaster'),
            ('2026-02-10', 'Weeding on History Rice', 'Crop Management'),
            ('2026-02-01', 'Planted History Rice (Dry 2026), 1.5 ha', 'Crop Management'),
            ('2026-01-02', 'Registered as a farmer', 'Registration'),
        ])
        self.assertEqual((subject['kind'], subject['id'], subject['name']), ('farmer', self.farmer.id, self.farmer.full_name))
        self.assertEqual(subject['facts'], [
            {'label': 'RSBSA number', 'value': self.farmer.rsbsa_number}, {'label': 'Barangay', 'value': 'Alaska'},
            {'label': 'Farm parcels', 'value': '1'}, {'label': 'Machinery', 'value': '1'}])

    def test_only_that_persons_records_are_listed(self):
        other = stamp(make_farmer('Else'), date_registered=d(1, 5))
        FarmVisit.objects.create(farmer=other, visit_date=d(9, 1), purpose='Someone else')
        _, rows = self.everything('farmer', other.id)
        self.assertEqual([what for _, what, _ in rows], ['Farm visit: Someone else', 'Registered as a farmer'])
        _, mine = self.everything('farmer', self.farmer.id)
        self.assertNotIn('Farm visit: Someone else', [what for _, what, _ in mine])

    def test_a_removed_assistance_shows_once_as_removed(self):
        """Taken off the way the system does it (the removal address), for both kinds of person."""
        for domain, model, person, kind, field in (
            ('crop', BeneficiaryRecord, make_farmer('Taken'), 'farmer', 'farmer'),
            ('fisheries', FisherfolkBeneficiaryRecord, make_fisherfolk('Takenfish'), 'fisherfolk', 'fisherfolk'),
        ):
            given = 'Seeds' if domain == 'crop' else 'Fishing Gear'
            record = model.objects.create(assistance_type=given, source_agencies=['DA'], date_given=date.today() + timedelta(days=5),
                                          **{field: person})
            res = self.client.post('/api/interventions/assistance-removals/', {'domain': domain, 'record_ids': [record.id]}, format='json')
            self.assertEqual((res.status_code, res.data['removed']), (200, [record.id]), res.data)
            _, rows = self.everything(kind, person.id)
            self.assertEqual([what for _, what, _ in rows if 'Seeds' in what or 'Fishing Gear' in what],
                             [f'Removed from the list: {given}'], domain)

    def test_assistance_not_yet_handed_out_is_called_scheduled(self):
        other = make_farmer('Waiting')
        BeneficiaryRecord.objects.create(farmer=other, assistance_type='Seeds', quantity='1', source_agencies=['DA'],
                                         date_given=date.today() + timedelta(days=5))
        _, rows = self.everything('farmer', other.id)
        self.assertEqual([what for _, what, _ in rows if 'Seeds' in what], ['Assistance scheduled: Seeds, 1'])

    def test_a_forced_harvest_says_why(self):
        other = make_farmer('Forced')
        parcel = FarmParcel.objects.create(farmer=other, parcel_number='01-33-02-005-001-09-002', area_hectares='1.00',
                                           land_ownership='Owner', barangay='Alaska')
        reason = HarvestRecord._meta.get_field('force_harvest_reason').choices[0]
        HarvestRecord.objects.create(farm_parcel=parcel, season='Wet', year=2026, crop_name='Corn', area_harvested_hectares='1.00',
                                     volume_kg='10.50', harvest_start_date=d(5, 2), force_harvest_reason=reason[0])
        _, rows = self.everything('farmer', other.id)
        self.assertIn(('2026-05-02', f'Force harvested Corn: {reason[1]}', 'Crop Management'), rows)

    def test_ten_to_a_page(self):
        first = self.client.get(url('farmer', self.farmer.id)).data
        second = self.client.get(url('farmer', self.farmer.id), {'page': 2}).data
        self.assertEqual((first['count'], len(first['results']), len(second['results'])), (16, 10, 6))

    def test_only_an_admin_reads_it(self):
        for user in (make_staff('hi-focal', 'EVALUATOR'), make_citizen('hi-farmer', 'FARMER', self.farmer.id)):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(url('farmer', self.farmer.id)).status_code, 403, user.username)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(url('farmer', self.farmer.id)).status_code, 401)

    def test_a_missing_record_says_so(self):
        for address in (url('farmer', 999999), url('fisherfolk', 999999), url('farmers-cooperative', 999999),
                        url('fisherfolk-cooperative', 999999), url('nonsense', 1)):
            res = self.client.get(address)
            self.assertEqual((res.status_code, res.data['detail']), (404, GONE), address)


class FisherfolkHistoryTests(HistoryTestBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.fisher = stamp(make_fisherfolk('Marina'), date_registered=d(1, 2))
        Fisherfolk.objects.filter(pk=cls.fisher.pk).update(fisherfolk_type='Capture')     # only they record fishing trips
        cls.fisher.refresh_from_db()
        cls.coop = make_org(FisherfolkOrganization, 'Waves')
        pond = stamp(Pond.objects.create(fisherfolk=cls.fisher, name='North Pond'), date_created=d(1, 10))
        cycle = AquacultureProductionCycle.objects.create(
            fisherfolk=cls.fisher, cycle_name='Cycle A', species_farmed='Tilapia', culture_system='Pond', stocking_date=d(2, 1),
            actual_harvest_date=d(5, 5))
        AquacultureFeedingLog.objects.create(production_cycle=cycle, feeding_date=d(2, 10), feed_type='Starter', quantity_kg='5.00')
        AquacultureHealthLog.objects.create(production_cycle=cycle, log_date=d(2, 20), observation='Slow growth')
        species = SpeciesOption.objects.create(
            species_name='History Bangus', category=SpeciesCategory.objects.create(name='History Fish'), culture_environment='Freshwater',
            culture_duration_days=100, default_survival_rate_pct='80', default_avg_body_weight_kg='0.3')
        stocking = StockingRecord.objects.create(fisherfolk=cls.fisher, pond=pond, species=species, culture_type='Pond',
                                                 date_stocked=d(3, 1), number_of_fingerlings=5000, season='Dry', year=2026)
        FisheriesActivityLog.objects.create(stocking_record=stocking, activity='Sampling', date_of_activity=d(3, 10))
        FisheriesHarvestRecord.objects.create(stocking_record=stocking, harvest_date=d(4, 1), quantity_kg='300.50')
        report = FisheriesDisasterReport.objects.create(stocking_record=stocking, fisherfolk=cls.fisher, disaster_type='Flood',
                                                        date_of_occurrence=d(4, 10))
        FisheriesDisasterReport.objects.filter(pk=report.pk).update(recovered_date=d(4, 20))
        FisheriesDisasterReport.objects.create(fisherfolk=cls.fisher, disaster_type='Typhoon', date_of_occurrence=d(5, 6))
        FishingTripLog.objects.create(fisherfolk=cls.fisher, trip_date=d(5, 10), fishing_ground='Bay', gear_used='Net', total_catch_kg='12.00')
        FisherfolkBeneficiaryRecord.objects.create(fisherfolk=cls.fisher, assistance_type='Fishing Gear', item_type='Gill Net',
                                                   quantity='1', source_agencies=['DA'], date_given=d(5, 20))
        member = FisherfolkOrganizationMember.objects.create(organization=cls.coop, fisherfolk=cls.fisher, date_joined=d(6, 1))
        FisherfolkOrganizationOfficer.objects.create(organization=cls.coop, member=member, position='Secretary',
                                                     full_name=cls.fisher.full_name, term_start_date=d(6, 5))
        change = ProfileChangeRequest.objects.create(linked_record_type='FISHERFOLK', linked_record_id=cls.fisher.id, field_name='barangay',
                                                     requested_value='Basca', requested_by=cls.admin)
        stamp(change, requested_at=d(7, 1))

    def test_every_kind_of_record_newest_first(self):
        subject, rows = self.everything('fisherfolk', self.fisher.id)
        name = self.coop.name
        self.assertEqual(rows, [
            ('2026-07-01', 'Asked to change barangay to "Basca"', 'Sign-in & Account'),
            ('2026-06-05', f'Became Secretary of {name}', 'Cooperatives'),
            ('2026-06-01', f'Joined {name}', 'Cooperatives'),
            ('2026-05-20', 'Assistance: Fishing Gear Gill Net, 1', 'Assistance'),
            ('2026-05-10', 'Fishing trip to Bay: 12 kg', 'Fisheries Management'),
            ('2026-05-06', 'Disaster on Fisheries: Typhoon', 'Disaster'),
            ('2026-05-05', 'Cycle Cycle A harvested', 'Fisheries Management'),
            ('2026-04-20', 'History Bangus recovered from Flood', 'Disaster'),
            ('2026-04-10', 'Disaster on History Bangus: Flood', 'Disaster'),
            ('2026-04-01', 'Harvested 300.5 kg of History Bangus', 'Fisheries Management'),
            ('2026-03-10', 'Sampling on History Bangus', 'Fisheries Management'),
            ('2026-03-01', 'Stocked 5,000 History Bangus', 'Fisheries Management'),
            ('2026-02-20', 'Health observation (Cycle A): Slow growth', 'Fisheries Management'),
            ('2026-02-10', 'Fed 5 kg of Starter (Cycle A)', 'Fisheries Management'),
            ('2026-02-01', 'Started cycle Cycle A (Tilapia)', 'Fisheries Management'),
            ('2026-01-10', 'Added pond or cage North Pond', 'Registration'),
            ('2026-01-02', 'Registered as a fisherfolk', 'Registration'),
        ])
        self.assertEqual(subject['facts'], [
            {'label': 'RSBSA number', 'value': self.fisher.rsbsa_number}, {'label': 'Barangay', 'value': 'Alaska'},
            {'label': 'Ponds and cages', 'value': '1'}])


class CooperativeHistoryTests(HistoryTestBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.coop = make_org(FarmersOrganization, 'Records')
        FarmersOrganization.objects.filter(pk=cls.coop.pk).update(date_registered=d(1, 2))
        member, gone = make_farmer('Mem'), make_farmer('Left')
        FarmersOrganizationMember.objects.create(organization=cls.coop, farmer=member, date_joined=d(2, 1))
        FarmersOrganizationMember.objects.create(organization=cls.coop, farmer=gone, date_joined=d(2, 2), is_active=False)
        OrganizationOfficer.objects.create(organization=cls.coop, farmer=gone, position='Auditor', full_name='Left Behind',
                                           term_start_date=d(3, 1), term_end_date=d(3, 15), is_active=False)
        pump = FarmersOrganizationEquipment.objects.create(organization=cls.coop, equipment_name='Other', equipment_name_other='Water Pump',
                                                           quantity=2, condition='Good', acquisition_date=d(4, 1))
        FarmersOrganizationEquipment.objects.create(organization=cls.coop, equipment_name='Other', equipment_name_other='Undated',
                                                    quantity=1, condition='Good')
        FarmersOrganizationEquipmentLoan.objects.create(equipment=pump, member=member, quantity=1, status='Returned', origin='Direct',
                                                        borrowed_at=noon(d(5, 1)), returned_at=noon(d(5, 4)))
        FarmersOrganizationEquipmentRepair.objects.create(equipment=pump, quantity=1, repaired_on=d(6, 1), description='New seal',
                                                          from_condition='Broken')
        for person in (member, gone):
            BeneficiaryRecord.objects.create(farmer=person, assistance_type='Seeds', source_agencies=['DA'], date_given=d(7, 1),
                                             distributed_by_organization=cls.coop)
        BeneficiaryRecord.objects.create(farmer=member, assistance_type='Training', source_agencies=['DA'], date_given=d(7, 5),
                                         distributed_by_organization=cls.coop)
        BeneficiaryRecord.objects.filter(assistance_type='Training').update(status='REMOVED', removed_at=noon(d(7, 6)))
        cls.member, cls.gone = member, gone

    def test_every_kind_of_record_newest_first(self):
        subject, rows = self.everything('farmers-cooperative', self.coop.id)
        self.assertEqual(rows, [
            ('2026-07-01', 'Gave Seeds to 2 members', 'Assistance'),
            ('2026-06-01', 'Repaired 1 Water Pump: New seal', 'Cooperatives'),
            ('2026-05-04', f'{self.member.full_name} returned 1 Water Pump', 'Cooperatives'),
            ('2026-05-01', f'Lent 1 Water Pump to {self.member.full_name}', 'Cooperatives'),
            ('2026-04-01', 'Acquired 2 Water Pump', 'Cooperatives'),
            ('2026-03-15', 'Left Behind ended the term as Auditor', 'Cooperatives'),
            ('2026-03-01', 'Left Behind became Auditor', 'Cooperatives'),
            ('2026-02-02', f'{self.gone.full_name} joined (ended)', 'Cooperatives'),
            ('2026-02-01', f'{self.member.full_name} joined', 'Cooperatives'),
            ('2026-01-02', 'Cooperative registered', 'Cooperatives'),
        ])
        self.assertEqual(subject['facts'], [
            {'label': 'Registration number', 'value': self.coop.registration_number}, {'label': 'Barangay', 'value': self.coop.barangay},
            {'label': 'Current members', 'value': '1'}, {'label': 'Equipment items', 'value': '2'}])

    def test_a_distribution_still_to_come_is_called_scheduled(self):
        day = date.today() + timedelta(days=5)
        for person in (self.member, self.gone):
            BeneficiaryRecord.objects.create(farmer=person, assistance_type='Fertilizer', source_agencies=['DA'], date_given=day,
                                             distributed_by_organization=self.coop)
        _, rows = self.everything('farmers-cooperative', self.coop.id)
        self.assertEqual([what for _, what, _ in rows if 'Fertilizer' in what], ['Fertilizer scheduled for 2 members'])

    def test_a_fisherfolk_cooperative_has_its_own(self):
        coop = make_org(FisherfolkOrganization, 'Nets')
        fisher = make_fisherfolk('Neri')
        FisherfolkOrganizationMember.objects.create(organization=coop, fisherfolk=fisher, date_joined=d(2, 3))
        FisherfolkBeneficiaryRecord.objects.create(fisherfolk=fisher, assistance_type='Fishing Gear', source_agencies=['DA'],
                                                   date_given=d(3, 3), distributed_by_organization=coop)
        subject, rows = self.everything('fisherfolk-cooperative', coop.id)
        self.assertEqual(rows[:2], [('2026-03-03', 'Gave Fishing Gear to 1 member', 'Assistance'),
                                    ('2026-02-03', f'{fisher.full_name} joined', 'Cooperatives')])
        self.assertEqual(subject['kind'], 'fisherfolk-cooperative')
