"""Production reports on records the way real data looks: a harvest or crop record owned through its crop
monitoring record, with no farm parcel (HarvestRecord.farm_parcel and most CropMonitoringRecord.farm_parcel
values are empty in the live database)."""
import io
from datetime import date

import openpyxl
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from associations.models import FarmersOrganization
from farmers.models import Farmer
from production.models import CropMonitoringRecord, CropType, HarvestRecord

SEASONAL = '/api/reports/production/'
HARVESTED_CROP = '/api/reports/production/harvested-crop/'


def _sheet_rows(response):
    ws = openpyxl.load_workbook(io.BytesIO(response.content)).active
    return [[('' if v is None else str(v)) for v in row] for row in ws.iter_rows(values_only=True)]


class ParcellessProductionReportTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(
            username='admin1', password='pw', role='ADMIN', email='admin1@x.test')
        cls.crop = CropType.objects.order_by('id').first()
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-000151', first_name='Maria', last_name='Santos', gender='Female',
            birthdate=date(1985, 3, 3), barangay='Alaska', civil_status='Single')
        cls.org = FarmersOrganization.objects.create(
            name='Alaska Farmers Org', barangay='Alaska', contact_person='X', contact_number='1',
            registration_number='ORG-1', date_organized=date(2020, 1, 1))

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def monitoring(self, **over):
        data = dict(farm_location_barangay='Alaska', land_status='Owner', crop_type=self.crop, season='Wet',
                    year=2026, date_planted=date(2026, 5, 1), area_planted_ha='1.50', status='Harvested',
                    actual_harvest_date=date(2026, 9, 1))
        data.update(over)
        return CropMonitoringRecord.objects.create(**data)

    def harvest(self, monitoring):
        return HarvestRecord.objects.create(
            monitoring_record=monitoring, season='Wet', year=2026, crop_name=self.crop.name,
            area_harvested_hectares='1.50', volume_kg='3000.00')

    # --- Seasonal production report (reads HarvestRecord)
    def test_seasonal_report_names_the_farmer_of_a_parcelless_harvest(self):
        self.harvest(self.monitoring(farmer=self.farmer))
        r = self.client.get(SEASONAL)
        self.assertEqual(r.status_code, 200)
        text = r.content.decode('utf-8-sig')
        self.assertIn('Maria Santos', text)
        self.assertIn('01-033-02-019-000151', text)
        self.assertIn('Alaska', text)

    def test_seasonal_report_names_the_organization_of_an_organization_harvest(self):
        self.harvest(self.monitoring(farmers_organization=self.org))
        r = self.client.get(SEASONAL)
        self.assertEqual(r.status_code, 200)
        self.assertIn('Alaska Farmers Org', r.content.decode('utf-8-sig'))

    def test_seasonal_report_survives_a_harvest_with_no_owner_at_all(self):
        HarvestRecord.objects.create(season='Wet', year=2026, crop_name='Palay', area_harvested_hectares='1.00', volume_kg='10.00')
        self.assertEqual(self.client.get(SEASONAL).status_code, 200)
        r = self.client.get(SEASONAL, {'format': 'pdf'})
        self.assertEqual((r.status_code, r.content[:5]), (200, b'%PDF-'))

    def test_seasonal_report_pdf_and_barangay_filter(self):
        self.harvest(self.monitoring(farmer=self.farmer))
        other = self.monitoring(farmer=self.farmer, farm_location_barangay='Samara')
        self.harvest(other)
        r = self.client.get(SEASONAL, {'format': 'pdf', 'barangay': 'Alaska'})
        self.assertEqual((r.status_code, r.content[:5]), (200, b'%PDF-'))
        csv_all = self.client.get(SEASONAL).content.decode('utf-8-sig')
        csv_alaska = self.client.get(SEASONAL, {'barangay': 'Alaska'}).content.decode('utf-8-sig')
        self.assertIn('Samara', csv_all)
        self.assertNotIn('Samara', csv_alaska)
        self.assertIn('Alaska', csv_alaska)

    # --- Harvested crop report (reads CropMonitoringRecord)
    def test_harvested_crop_report_shows_the_farmer_and_barangay_without_a_parcel(self):
        self.monitoring(farmer=self.farmer)
        rows = _sheet_rows(self.client.get(HARVESTED_CROP))
        header = next(i for i, row in enumerate(rows) if 'Farmer' in row)
        body = [row for row in rows[header + 1:] if any(row)]
        self.assertEqual(len(body), 1)
        record = dict(zip(rows[header], body[0]))
        self.assertEqual(record['Farmer'], 'Maria Santos')
        self.assertEqual(record['Barangay'], 'Alaska')

    def test_harvested_crop_report_barangay_filter_uses_the_record_location(self):
        self.monitoring(farmer=self.farmer)
        self.monitoring(farmer=self.farmer, farm_location_barangay='Samara')
        rows = _sheet_rows(self.client.get(HARVESTED_CROP, {'barangay': 'Samara'}))
        header = next(i for i, row in enumerate(rows) if 'Barangay' in row)
        body = [row for row in rows[header + 1:] if any(row)]
        self.assertEqual([dict(zip(rows[header], row))['Barangay'] for row in body], ['Samara'])
