"""Each cooperative keeps the history of what it confirmed for its members while receipt had to be confirmed (newest first),
visible to staff and to that cooperative only. Nothing new is added to it; the old rows and photos stay readable."""
import shutil
import tempfile
from datetime import date

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from associations.models import FarmersOrganization, FarmersOrganizationMember, FisherfolkOrganization, FisherfolkOrganizationMember
from core.test_photos import png
from fisheries.models import Fisherfolk
from interventions.models import BeneficiaryRecord, BeneficiaryRecordPhoto, FisherfolkBeneficiaryRecord
from interventions.test_helpers import earlier_confirmation, farmer, make_citizen, make_org

HISTORY = '/api/interventions/confirmed-for-members/{type}/{id}/'


class OrgConfirmedHistoryTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(username='hist-staff', password='pw', role='ADMIN', email='hist@x.test')
        cls.org = make_org(FarmersOrganization, 'History Farmers')
        cls.other = make_org(FarmersOrganization, 'Other History Farmers')
        cls.org_user = make_citizen('hist-org', 'FARMERS_ORG', cls.org.id)
        cls.other_user = make_citizen('hist-other', 'FARMERS_ORG', cls.other.id)

    def setUp(self):
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, True)
        override = override_settings(MEDIA_ROOT=media)
        override.enable()
        self.addCleanup(override.disable)
        self.people = [farmer(n) for n in ('Ana', 'Ben')]
        for p in self.people:
            FarmersOrganizationMember.objects.create(organization=self.org, farmer=p, date_joined=date(2026, 1, 1))
        self.records = [BeneficiaryRecord.objects.create(farmer=p, assistance_type='Seeds', date_given=date(2026, 8, 1)) for p in self.people]

    def confirm(self, records):
        earlier_confirmation(records, self.org, self.org_user)

    def history(self, user, org_id=None, type_='farmers'):
        self.client.force_authenticate(user)
        return self.client.get(HISTORY.format(type=type_, id=org_id or self.org.id))

    def test_what_the_organization_confirmed_is_listed_with_member_assistance_and_photos(self):
        self.confirm(self.records)
        data = self.history(self.staff).json()
        self.assertEqual(data['count'], 2)
        row = data['results'][0]
        self.assertEqual(row['status'], 'APPROVED')
        self.assertTrue(row['member_rsbsa'].startswith('01-033-02-019-'))
        self.assertEqual(row['assistance_type'], 'Seeds')
        self.assertEqual(len(row['photo_urls']), 2)
        self.assertIn('farmer_full_name', row)

    def test_nothing_is_listed_before_a_confirmation_and_unconfirmed_records_never_appear(self):
        self.assertEqual(self.history(self.staff).json()['count'], 0)
        self.confirm(self.records[:1])
        self.assertEqual(self.history(self.staff).json()['count'], 1)

    def test_an_organization_sees_only_its_own_history(self):
        self.confirm(self.records)
        self.assertEqual(self.history(self.org_user).status_code, 200)
        self.assertEqual(self.history(self.org_user).json()['count'], 2)
        self.assertEqual(self.history(self.other_user).status_code, 403)               # another organization's page
        self.assertEqual(self.history(self.other_user, org_id=self.other.id).json()['count'], 0)

    def test_a_plain_citizen_cannot_read_it(self):
        member = make_citizen('hist-member', 'FARMER', self.people[0].id)
        self.assertEqual(self.history(member).status_code, 403)

    def test_an_unknown_organization_type_is_not_found(self):
        self.assertEqual(self.history(self.staff, type_='boats').status_code, 404)

    def test_the_fisherfolk_history_works_the_same_way(self):
        org = make_org(FisherfolkOrganization, 'History Fishers')
        user = make_citizen('hist-fish-org', 'FISHERFOLK_ORG', org.id)
        person = Fisherfolk.objects.create(
            first_name='Fin', last_name='Hist', gender='Male', birthdate=date(1990, 1, 1), barangay='Poblacion',
            fisherfolk_type='Aquaculture', rsbsa_number='01-033-02-019-871001')
        FisherfolkOrganizationMember.objects.create(organization=org, fisherfolk=person, date_joined=date(2026, 1, 1))
        record = FisherfolkBeneficiaryRecord.objects.create(fisherfolk=person, assistance_type='Feed', date_given=date(2026, 8, 1))
        earlier_confirmation([record], org, user)
        rows = self.history(self.staff, org_id=org.id, type_='fisherfolk').json()['results']
        self.assertEqual([x['assistance_type'] for x in rows], ['Feed'])
        self.assertEqual(rows[0]['member_rsbsa'], '01-033-02-019-871001')

    def test_a_proof_photo_a_farmer_attached_before_is_still_shown(self):
        record = self.records[0]
        BeneficiaryRecordPhoto.objects.create(beneficiary_record=record, image=png('mine.png'))
        BeneficiaryRecord.objects.filter(pk=record.pk).update(confirmed_at=timezone.now(), confirmation_note='Got it')
        self.client.force_authenticate(make_citizen('hist-photo', 'FARMER', record.farmer_id))
        mine = self.client.get('/api/interventions/my-beneficiary-history/').json()
        self.assertEqual([(r['confirmation_note'], len(r['confirmation_photos'])) for r in mine], [('Got it', 1)])
