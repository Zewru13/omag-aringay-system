"""There is no dual registration: one RSBSA number belongs to one person record. A person who is both a farmer and a
fisherfolk has a different RSBSA number for each, so a number that already belongs to the OTHER list is an error in
the RSBSA import, the crop-record import and the registration forms alike."""
import io
from datetime import date

import openpyxl
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from farmers.models import Farmer
from farmers.rsbsa_import import EXPECTED_HEADERS_V2
from fisheries.models import Fisherfolk
from production.models import CropType

RSBSA = '01-033-02-019-960001'
PREVIEW = '/api/farmers/rsbsa-import/preview/'
COMMIT = '/api/farmers/rsbsa-import/commit/'


def workbook(rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(EXPECTED_HEADERS_V2)
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return SimpleUploadedFile(
        'registry.xlsx', buf.getvalue(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


def registry_row(rsbsa, farmer='YES', fisherfolk='NO', crop='Corn'):
    return [rsbsa, 'C1', 'Pat', '', 'Sample', 'null', 'ALASKA', 'ARINGAY', 'LA UNION', '1980-01-01', 'Male', '9171234567',
            crop, '1', 'null', farmer, 'NO', fisherfolk, 'DA', 'Rainfed', '2026-08-01', '2026-09-01', '2026-09-01']


class NoDualRegistrationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='nd-admin', password='pw', role='ADMIN', email='nd@x.test')
        cls.fisher = Fisherfolk.objects.create(
            first_name='Fin', last_name='Taken', gender='Male', birthdate=date(1985, 5, 5), barangay='Alaska',
            fisherfolk_type='Aquaculture', rsbsa_number=RSBSA)
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-960002', first_name='Far', last_name='Mer', gender='Male', birthdate=date(1985, 5, 5),
            barangay='Alaska', civil_status='Single')
        CropType.objects.get_or_create(name='Corn (Mais)', defaults=dict(days_to_harvest=100))

    def setUp(self):
        self.client.force_authenticate(self.admin)

    # ── RSBSA import ─────────────────────────────────────────────────────
    def test_a_farmer_row_with_a_fisherfolks_number_is_an_error_not_a_dual_registration(self):
        r = self.client.post(PREVIEW, {'file': workbook([registry_row(RSBSA, farmer='YES')])}, format='multipart')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        row = data['rows'][0]
        self.assertEqual((row['status'], row['hold_back_reason']), ('invalid', 'rsbsa_in_other_registry'))
        self.assertIn('different RSBSA number', row['detail'])
        self.assertEqual(data['summary']['invalid'], 1)
        self.assertNotIn('classification_mismatch', data['summary'])

    def test_a_fisherfolk_row_with_a_farmers_number_is_refused_too(self):
        r = self.client.post(
            PREVIEW, {'file': workbook([registry_row('01-033-02-019-960002', farmer='NO', fisherfolk='YES')])}, format='multipart')
        self.assertEqual(r.json()['rows'][0]['hold_back_reason'], 'rsbsa_in_other_registry')

    def test_a_new_number_is_still_registered_normally(self):
        r = self.client.post(PREVIEW, {'file': workbook([registry_row('01-033-02-019-960003')])}, format='multipart')
        self.assertEqual(r.json()['rows'][0]['status'], 'unmatched')

    def test_the_commit_refuses_a_dual_registration_row(self):
        r = self.client.post(COMMIT, {'rows': [{
            'row_number': 2, 'status': 'classification_mismatch', 'rsbsa_number': RSBSA,
            'create_domain': 'FARMER', 'create_incoming_values': {'first_name': 'X'}}]}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertFalse(Farmer.objects.filter(rsbsa_number=RSBSA).exists())

    # ── registration forms ───────────────────────────────────────────────
    def test_registering_a_farmer_with_a_fisherfolks_number_is_refused(self):
        r = self.client.post('/api/farmers/', {
            'rsbsa_number': RSBSA, 'first_name': 'New', 'last_name': 'Farmer', 'gender': 'Male', 'birthdate': '1990-01-01',
            'barangay': 'Alaska', 'civil_status': 'Single', 'contact_number': '09171234567'}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('rsbsa_number', r.json())

    def test_registering_a_fisherfolk_with_a_farmers_number_is_refused(self):
        r = self.client.post('/api/fisheries/fisherfolk/', {
            'rsbsa_number': '01-033-02-019-960002', 'first_name': 'New', 'last_name': 'Fisher', 'gender': 'Male',
            'birthdate': '1990-01-01', 'barangay': 'Alaska', 'fisherfolk_type': 'Aquaculture',
            'contact_number': '09171234567'}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('rsbsa_number', r.json())

    def test_the_switch_domain_endpoint_is_gone(self):
        r = self.client.post('/api/accounts/me/switch-domain/', {'record_type': 'FARMER'}, format='json')
        self.assertEqual(r.status_code, 404)
