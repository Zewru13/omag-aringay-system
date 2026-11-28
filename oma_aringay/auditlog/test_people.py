"""Who an Audit Log entry is about: the farmer or fisherfolk each changed record belongs to, else its cooperative. The page links
these to their history."""
from datetime import date, timedelta
from unittest import mock

from django.db import connection
from rest_framework.test import APIRequestFactory, APITestCase

from accounts.models import UserLinkedRecord
from associations.models import (
    FarmersOrganization, FarmersOrganizationEquipment, FarmersOrganizationEquipmentLoan, FarmersOrganizationEquipmentRepair,
    FarmersOrganizationMember, FisherfolkOrganization, FisherfolkOrganizationEquipmentLoan, FisherfolkOrganizationMember,
    FisherfolkOrganizationOfficer, OrganizationOfficer,
)
from auditlog import capture, people
from auditlog.models import AuditLogEntry
from auditlog.test_audit_log import make_staff
from core.models import ProfileChangeRequest
from core.test_profile_consent import make_farmer
from farmers.models import FarmParcel
from fisheries.models import (
    Fisherfolk, FisheriesActivityLog, FisheriesDisasterReport, FisheriesHarvestRecord, FisheriesHarvestUnit, FishingTripLog, Pond,
    StockingRecord, TripSpeciesEntry,
)
from interventions.models import BeneficiaryRecord, BeneficiaryRecordPhoto, FisherfolkBeneficiaryRecord
from interventions.test_helpers import SCHEDULE, make_org
from monitoring.models import AquacultureFeedingLog, AquacultureFeedingLogUnit, AquacultureProductionCycle, FarmVisit
from production.models import (
    CropActivityLog, CropDisasterReport, CropDisasterReportPhoto, CropMonitoringRecord, HarvestRecord, SeedSource,
)


def make_fisherfolk(first):
    number = Fisherfolk.objects.count() + 1
    return Fisherfolk.objects.create(rsbsa_number=f'01-033-02-019-945{number:03d}', first_name=first, last_name='Fish', gender='Male',
                                     birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Aquaculture')


class OwnerTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.farmer = make_farmer('Own')
        cls.fisher = make_fisherfolk('Pat')
        cls.coop = make_org(FarmersOrganization, 'Owner')
        cls.fish_coop = make_org(FisherfolkOrganization, 'Owner fish')

    def assert_owner(self, record, kind, person):
        found = people.owner_of(record)
        self.assertIsNotNone(found, type(record).__name__)
        name = getattr(person, 'full_name', None) or person.name
        self.assertEqual(found, {'kind': kind, 'id': person.id, 'name': name}, type(record).__name__)

    def test_owner_of_each_kind_of_record(self):
        parcel = FarmParcel(farmer=self.farmer)
        crop = CropMonitoringRecord(farmer=self.farmer)
        report = CropDisasterReport(monitoring_record=crop)
        given = BeneficiaryRecord(farmer=self.farmer, distributed_by_organization=self.coop)
        for record in (self.farmer, parcel, crop, CropActivityLog(monitoring_record=crop), report,
                       CropDisasterReportPhoto(disaster_report=report), HarvestRecord(farm_parcel=parcel), given,
                       BeneficiaryRecordPhoto(beneficiary_record=given), FarmVisit(farmer=self.farmer),
                       FarmersOrganizationMember(organization=self.coop, farmer=self.farmer),
                       OrganizationOfficer(organization=self.coop, farmer=self.farmer),
                       FarmersOrganizationEquipmentLoan(equipment=FarmersOrganizationEquipment(organization=self.coop), member=self.farmer)):
            self.assert_owner(record, 'farmer', self.farmer)

        cycle = AquacultureProductionCycle(fisherfolk=self.fisher, organization=self.fish_coop)
        stocking = StockingRecord(fisherfolk=self.fisher)
        trip = FishingTripLog(fisherfolk=self.fisher)
        member = FisherfolkOrganizationMember(organization=self.fish_coop, fisherfolk=self.fisher)
        feeding = AquacultureFeedingLog(production_cycle=cycle)
        for record in (self.fisher, Pond(fisherfolk=self.fisher), cycle, feeding, AquacultureFeedingLogUnit(feeding_log=feeding),
                       stocking, FisheriesActivityLog(stocking_record=stocking), FisheriesDisasterReport(stocking_record=stocking),
                       FisheriesDisasterReport(fisherfolk=self.fisher),
                       FisheriesHarvestUnit(harvest=FisheriesHarvestRecord(stocking_record=stocking)),
                       StockingRecord(pond=Pond(fisherfolk=self.fisher)), trip, TripSpeciesEntry(fishing_trip=trip),
                       FisherfolkBeneficiaryRecord(fisherfolk=self.fisher), member, FisherfolkOrganizationOfficer(member=member),
                       FisherfolkOrganizationEquipmentLoan(member=self.fisher)):
            self.assert_owner(record, 'fisherfolk', self.fisher)

        equipment = FarmersOrganizationEquipment(organization=self.coop)
        for record in (self.coop, equipment, FarmersOrganizationEquipmentRepair(equipment=equipment),
                       OrganizationOfficer(organization=self.coop), CropMonitoringRecord(farmers_organization=self.coop)):
            self.assert_owner(record, 'farmers-cooperative', self.coop)
        self.assert_owner(self.fish_coop, 'fisherfolk-cooperative', self.fish_coop)

    def test_an_account_and_a_change_request_belong_to_the_linked_record(self):
        for record_type, person, kind in (('FARMER', self.farmer, 'farmer'), ('FISHERFOLK', self.fisher, 'fisherfolk'),
                                          ('FARMERS_ORG', self.coop, 'farmers-cooperative'),
                                          ('FISHERFOLK_ORG', self.fish_coop, 'fisherfolk-cooperative')):
            self.assert_owner(ProfileChangeRequest(linked_record_type=record_type, linked_record_id=person.id), kind, person)
            self.assert_owner(UserLinkedRecord(record_type=record_type, record_id=person.id), kind, person)
        self.assertIsNone(people.owner_of(UserLinkedRecord(record_type='FARMER', record_id=999999)))

    def test_the_lookup_has_a_savepoint_of_its_own(self):
        """On PostgreSQL a failed query spoils the transaction it is in, even when the error is caught. The lookup runs inside the
        action's transaction, so it needs a savepoint of its own to be undone without the action."""
        outside, inside = len(connection.savepoint_ids), []
        original = people._look

        def watch(record, steps, found):
            inside.append(len(connection.savepoint_ids))
            return original(record, steps, found)

        with mock.patch('auditlog.people._look', side_effect=watch):
            self.assertIsNotNone(people.owner_of(FarmParcel(farmer=self.farmer)))
        self.assertTrue(inside and min(inside) > outside, (outside, inside))

    def test_what_belongs_to_nobody_names_nobody(self):
        self.assertIsNone(people.owner_of(SeedSource(name='Nobody')))
        self.assertIsNone(people.owner_of(make_staff('pp-nobody')))


class EntryPeopleTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = make_staff('pp-admin')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def only_entry(self):
        found = list(AuditLogEntry.objects.all())
        self.assertEqual(len(found), 1, [e.object_repr for e in found])
        return found[0]

    def test_an_action_on_one_farmer_keeps_that_one_person(self):
        farmer = make_farmer('Solo')
        AuditLogEntry.objects.all().delete()
        res = self.client.patch(f'/api/farmers/{farmer.id}/', {'contact_number': '09170004444'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.only_entry().details['people'], [{'kind': 'farmer', 'id': farmer.id, 'name': farmer.full_name}])

    def test_a_deletion_still_knows_whose_it_was(self):
        farmer = make_farmer('Visited')
        visit = FarmVisit.objects.create(farmer=farmer, visit_date=date.today(), purpose='Check', conducted_by=self.admin)
        AuditLogEntry.objects.all().delete()
        self.assertEqual(self.client.delete(f'/api/monitoring/farm-visits/{visit.id}/').status_code, 204)
        self.assertEqual([p['id'] for p in self.only_entry().details['people']], [farmer.id])

    def test_a_bulk_action_keeps_each_person_once_up_to_25(self):
        farmers = [make_farmer(f'Bulk{i}') for i in range(30)]
        AuditLogEntry.objects.all().delete()
        res = self.client.post('/api/interventions/beneficiaries/adhoc/bulk/', {
            'farmer_ids': [f.id for f in farmers], 'assistance_type': 'Seeds', 'source_agencies': ['DA'], 'quantity': '1',
            **SCHEDULE, 'date_given': str(date.today() + timedelta(days=2))}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        found = self.only_entry().details['people']
        self.assertGreater(len(found), 1)
        self.assertLessEqual(len(found), people.MAX_PEOPLE)
        self.assertEqual(len({(p['kind'], p['id']) for p in found}), len(found))

    def test_an_undone_change_names_nobody(self):
        from django.db import transaction
        farmer = make_farmer('Undone')
        request = APIRequestFactory().post('/api/anything/')
        request.user = self.admin
        collector = capture.begin(request)
        try:
            try:
                with transaction.atomic():
                    FarmVisit.objects.create(farmer=farmer, visit_date=date.today(), purpose='Gone')
                    raise ValueError
            except ValueError:
                pass
            changes, _ = collector.finish()
        finally:
            capture.end()
        self.assertEqual((changes, collector.people), ([], []))

    def test_a_failure_while_naming_people_breaks_nothing(self):
        farmer = make_farmer('Safe')
        AuditLogEntry.objects.all().delete()
        with mock.patch('auditlog.people.owner_of', side_effect=RuntimeError('boom')), self.assertLogs('auditlog.capture', level='ERROR'):
            res = self.client.patch(f'/api/farmers/{farmer.id}/', {'contact_number': '09170005555'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        entry = self.only_entry()
        self.assertEqual(entry.details['people'], [])
        self.assertTrue(entry.details['changes'])


class DropStaleLinksTests(APITestCase):
    """After an everything restore a number can belong to someone else: a link that no longer matches its record is dropped."""

    def entry(self, *links, more=0):
        return AuditLogEntry.objects.create(user_name='Someone', action='UPDATE', object_repr='Did something',
                                            details={'changes': [], 'more': more, 'people': list(links)})

    @staticmethod
    def link(farmer, **over):
        return {'kind': 'farmer', 'id': farmer.id, 'name': farmer.full_name, **over}

    def test_a_link_to_a_record_that_is_gone_or_renamed_is_dropped(self):
        farmer = make_farmer('Stays')
        coop = make_org(FarmersOrganization, 'Still here')
        right = self.entry(self.link(farmer))
        cooperative = self.entry({'kind': 'farmers-cooperative', 'id': coop.id, 'name': coop.name})
        renamed = self.entry(self.link(farmer, name='Another Person'))
        gone = self.entry(self.link(farmer, id=farmer.id + 1000))
        unknown = self.entry(self.link(farmer, kind='something-else'))
        self.assertEqual(people.drop_stale_links(), 3)
        for entry in (right, cooperative, renamed, gone, unknown):
            entry.refresh_from_db()
        self.assertEqual(right.details, {'changes': [], 'more': 0, 'people': [self.link(farmer)]})
        self.assertEqual(len(cooperative.details['people']), 1)
        self.assertEqual((renamed.details['people'], gone.details['people'], unknown.details['people']), ([], [], []))
        self.assertEqual(renamed.object_repr, 'Did something')

    def test_an_entry_about_two_never_becomes_a_single_row_link(self):
        farmer, other = make_farmer('Kept'), make_farmer('Dropped')
        two = self.entry(self.link(farmer), self.link(other, name='Not them any more'), more=3)
        people.drop_stale_links()
        two.refresh_from_db()
        self.assertEqual(two.details['people'], [self.link(farmer)])
        self.assertTrue(two.details['people_dropped'])
        self.assertEqual(two.details['more'], 3)          # still the number of changes that are not listed

    def test_entries_without_people_are_left_alone(self):
        plain = AuditLogEntry.objects.create(user_name='Someone', action='SIGN_IN', object_repr='Signed in')
        empty = AuditLogEntry.objects.create(user_name='Someone', action='UPDATE', object_repr='x', details={'changes': [], 'more': 0})
        self.assertEqual(people.drop_stale_links(), 0)
        plain.refresh_from_db()
        empty.refresh_from_db()
        self.assertEqual((plain.details, empty.details), (None, {'changes': [], 'more': 0}))
