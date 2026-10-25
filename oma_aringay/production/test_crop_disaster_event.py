"""The report of one disaster event logged on several crops: GET /api/production/disasters/event-report/?ids=... (JSON) and its /pdf/."""
import io
import shutil
import tempfile
from datetime import date

from django.contrib.auth import get_user_model
from django.test import override_settings
from pypdf import PdfReader
from rest_framework.test import APITestCase

from core.test_photos import png
from farmers.models import FarmParcel

from .test_crop_disaster_multi import make_citizen, make_farmer, make_record

MULTI = '/api/production/disasters/multi/'
URL = '/api/production/disasters/event-report/'
PDF = '/api/production/disasters/event-report/pdf/'


class CropDisasterEventReportTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='ev-admin', password='pw', role='ADMIN', email='ev-admin@x.test', full_name='Ada Admin')
        cls.focal = User.objects.create_user(username='ev-focal', password='pw', role='EVALUATOR', email='ev-focal@x.test')
        cls.ana, cls.ben = make_farmer('Ana'), make_farmer('Ben')
        cls.p1 = FarmParcel.objects.create(farmer=cls.ana, parcel_number='01-33-02-005-001-02-003', area_hectares='5.00', land_ownership='Owner', barangay='Basca')
        cls.p2 = FarmParcel.objects.create(farmer=cls.ben, parcel_number='', area_hectares='3.00', land_ownership='Owner', barangay='Dulao')
        cls.a1 = make_record(cls.ana, '2.00', farm_parcel=cls.p1)
        cls.a2 = make_record(cls.ana, '1.00', farm_parcel=cls.p1, variety_used='Rc 222')
        cls.b1 = make_record(cls.ben, '1.50', farm_parcel=cls.p2, farm_location_barangay='Dulao')

    def setUp(self):
        self.media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media, True)
        override = override_settings(MEDIA_ROOT=self.media)
        override.enable()
        self.addCleanup(override.disable)
        self.client.force_authenticate(self.admin)

    def log(self, photos=None):
        body = {'disaster_type': 'Typhoon', 'date_of_occurrence': str(date.today()), 'estimated_damage': 'Winds flattened the crops',
                'production_loss': 'About half', 'crops': [
                    {'monitoring_record': self.a1.id, 'area_affected_ha': '2.00', 'is_total_loss': True},
                    {'monitoring_record': self.a2.id, 'area_affected_ha': '0.50'},
                    {'monitoring_record': self.b1.id, 'area_affected_ha': '1.50', 'is_total_loss': True}]}
        if photos:
            import json
            data = {k: v for k, v in body.items() if k != 'crops'}
            data['crops'] = json.dumps(body['crops'])
            data['photos'] = photos
            r = self.client.post(MULTI, data, format='multipart')
        else:
            r = self.client.post(MULTI, body, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return [x['id'] for x in r.json()]

    def ids(self, ids):
        return ','.join(str(i) for i in ids)

    def test_the_report_has_the_event_details_totals_and_a_row_per_crop(self):
        ids = self.log()
        r = self.client.get(URL, {'ids': self.ids(ids)})
        self.assertEqual(r.status_code, 200, r.content)
        doc = r.json()
        self.assertTrue(doc['reference'].startswith('CDE-'))
        self.assertEqual((doc['disaster_type_label'], doc['description'], doc['production_loss'], doc['reported_by_name']),
                         ('Typhoon', 'Winds flattened the crops', 'About half', 'Ada Admin'))
        totals = doc['totals']
        self.assertEqual((totals['crops'], totals['parcels'], totals['farmers'], totals['total_loss']), (3, 2, 2, 2))
        self.assertEqual((float(totals['area_planted_ha']), float(totals['area_affected_ha'])), (4.5, 4.0))
        rows = doc['rows']
        self.assertEqual([(x['farmer_name'], x['parcel'], x['barangay']) for x in rows],
                         [('Ana Multi', 'Parcel 01-33-02-005-001-02-003', 'Alaska'), ('Ana Multi', 'Parcel 01-33-02-005-001-02-003', 'Alaska'),
                          ('Ben Multi', f'Parcel #{self.p2.id}', 'Dulao')])
        by_record = {x['report_id']: x for x in rows}
        self.assertEqual((float(by_record[ids[0]]['area_affected_ha']), by_record[ids[0]]['is_total_loss'], by_record[ids[1]]['is_total_loss']), (2.0, True, False))

    def test_a_crop_with_no_parcel_is_named_so(self):
        loose = make_record(self.ben, '1.00', farm_location_barangay='Poblacion')
        r = self.client.post(MULTI, {'disaster_type': 'Flood', 'date_of_occurrence': str(date.today()), 'crops': [{'monitoring_record': loose.id, 'area_affected_ha': '1.00'}]}, format='json')
        doc = self.client.get(URL, {'ids': str(r.json()[0]['id'])}).json()
        self.assertEqual((doc['rows'][0]['parcel'], doc['rows'][0]['barangay']), ('No parcel on file', 'Poblacion'))

    def test_the_pdf_is_a_real_document_with_the_table(self):
        ids = self.log()
        r = self.client.get(PDF, {'ids': self.ids(ids)})
        self.assertEqual(r.status_code, 200, r.content[:200])
        self.assertEqual(r['Content-Type'], 'application/pdf')
        self.assertIn('Crop_Disaster_Report_CDE-', r['Content-Disposition'])
        text = '\n'.join(p.extract_text() for p in PdfReader(io.BytesIO(r.content)).pages)
        for wanted in ('CROP DISASTER REPORT', 'AFFECTED PARCELS AND CROPS', 'Typhoon', 'Ana Multi', 'Ben Multi', 'TOTAL', 'Winds flattened the crops'):
            self.assertIn(wanted, text)

    def test_the_photos_of_the_event_are_in_the_report(self):
        ids = self.log(photos=[png('wind.png')])
        doc = self.client.get(URL, {'ids': self.ids(ids)}).json()
        self.assertEqual(len(doc['photos']), 1)
        self.assertEqual(self.client.get(PDF, {'ids': self.ids(ids)}).status_code, 200)

    def test_bad_requests_are_refused(self):
        ids = self.log()
        for params in ({}, {'ids': ''}, {'ids': 'abc'}, {'ids': f'{ids[0]},999999'}):
            self.assertEqual(self.client.get(URL, params).status_code, 400, params)
            self.assertEqual(self.client.get(PDF, params).status_code, 400, params)
        self.assertEqual(self.client.get(URL, {'ids': ','.join(str(i) for i in range(1, 1003))}).status_code, 400)

    def test_only_staff_may_ask(self):
        ids = self.log()
        self.client.force_authenticate(self.focal)
        self.assertEqual(self.client.get(URL, {'ids': self.ids(ids)}).status_code, 200)
        self.client.force_authenticate(make_citizen('ev-ana', 'FARMER', self.ana.id))
        self.assertEqual(self.client.get(URL, {'ids': self.ids(ids)}).status_code, 403)
        self.assertEqual(self.client.get(PDF, {'ids': self.ids(ids)}).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(URL, {'ids': self.ids(ids)}).status_code, (401, 403))
