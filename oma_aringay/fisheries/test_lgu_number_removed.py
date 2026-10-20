"""The LGU registration number is gone from the fisherfolk record; the RSBSA number (required for every fisherfolk) is
what identifies a fisherfolk everywhere the LGU number used to be shown."""
import csv
import io
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from associations.models import FisherfolkOrganization, FisherfolkOrganizationMember
from associations.serializers import FisherfolkAddCandidateSerializer, FisherfolkOrganizationMemberSerializer
from fisheries.models import Fisherfolk

RSBSA = '01-033-02-019-900123'
FISHR = '01-33-02-2020-0042'


class LguNumberRemovedTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='adm', password='pw', role='ADMIN', email='adm@x.test')
        cls.ff = Fisherfolk.objects.create(
            first_name='Pablo', last_name='Test', gender='Male', birthdate=date(1990, 1, 1), barangay='Poblacion',
            fisherfolk_type='Inland', rsbsa_number=RSBSA, fishr_number=FISHR,
        )
        cls.org = FisherfolkOrganization.objects.create(
            name='Org', barangay='Poblacion', contact_person='X', contact_number='1', registration_number='R-1',
        )
        cls.member = FisherfolkOrganizationMember.objects.create(organization=cls.org, fisherfolk=cls.ff, date_joined=date(2020, 1, 1))

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_the_fisherfolk_model_has_no_lgu_field(self):
        self.assertNotIn('lgu_registration_number', {f.name for f in Fisherfolk._meta.get_fields()})

    def test_fisherfolk_api_no_longer_carries_the_lgu_number(self):
        listed = self.client.get('/api/fisheries/fisherfolk/').data
        row = (listed['results'] if isinstance(listed, dict) else listed)[0]
        detail = self.client.get(f'/api/fisheries/fisherfolk/{self.ff.id}/').data
        for payload in (row, detail):
            self.assertNotIn('lgu_registration_number', payload)
            self.assertEqual(payload['rsbsa_number'], RSBSA)

    def test_a_fisherfolk_is_still_found_by_rsbsa_and_fishr_number(self):
        for term in (RSBSA, FISHR):
            listed = self.client.get('/api/fisheries/fisherfolk/', {'search': term}).data
            self.assertEqual([r['id'] for r in (listed['results'] if isinstance(listed, dict) else listed)], [self.ff.id], term)

    def test_organization_member_shows_the_rsbsa_number(self):
        data = FisherfolkOrganizationMemberSerializer(self.member).data
        self.assertNotIn('fisherfolk_lgu_number', data)
        self.assertEqual(data['fisherfolk_rsbsa_number'], RSBSA)

    def test_add_candidate_hint_comes_from_the_rsbsa_number(self):
        self.assertEqual(FisherfolkAddCandidateSerializer(self.ff).data['id_hint'], '…' + RSBSA[-4:])

    def test_fisherfolk_is_named_by_rsbsa_number(self):
        self.assertTrue(str(self.ff).startswith(RSBSA))

    def test_masterlist_report_lists_the_rsbsa_number(self):
        r = self.client.get('/api/reports/fisheries/masterlist/')
        self.assertEqual(r.status_code, 200)
        rows = list(csv.reader(io.StringIO(r.content.decode('utf-8-sig'))))
        header = next(i for i, row in enumerate(rows) if row and row[0] in ('RSBSA Number', 'LGU Number'))   # after the letterhead lines
        self.assertEqual(rows[header][0], 'RSBSA Number')
        self.assertEqual(rows[header + 1][0], RSBSA)

    def test_profile_report_builds_and_is_named_by_rsbsa_number(self):
        r = self.client.get(f'/api/reports/fisheries/{self.ff.id}/profile/')
        self.assertEqual(r.status_code, 200)
        self.assertIn(RSBSA, r['Content-Disposition'])
