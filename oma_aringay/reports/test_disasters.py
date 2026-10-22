"""Reports 4 and 5: the Fisheries Disaster report and the Crop / Parcel Disaster report - filters, content, JSON / PDF / Excel."""
import io
from datetime import date, timedelta
from decimal import Decimal

import openpyxl
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from farmers.models import FarmParcel, Farmer
from fisheries.models import (
    FisheriesDisasterReport, Fisherfolk, SpeciesCategory, SpeciesOption, StockingRecord,
)
from production.models import CropDisasterReport, CropMonitoringRecord, CropType

FISH = '/api/reports/disasters/fisheries/'
CROP = '/api/reports/disasters/crops/'


def _fisher(first, rsbsa, barangay):
    return Fisherfolk.objects.create(
        rsbsa_number=rsbsa, first_name=first, last_name='Sea', gender='Male', birthdate=date(1980, 1, 1),
        barangay=barangay, fisherfolk_type='Aquaculture')


class DisasterReportsTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='adm', password='pw', role='ADMIN', email='a@x.test')
        cls.citizen = User.objects.create_user(username='cit', password='pw', role='CITIZEN', email='c@x.test')
        today = timezone.localdate()
        cls.today = today

        # fisheries: one report on a stock, one general report with no stock
        cls.pedro = _fisher('Pedro', '01-033-02-019-000401', 'Alaska')
        cls.ana = _fisher('Ana', '01-033-02-019-000402', 'Baracbac')
        cat, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        cls.tilapia = SpeciesOption.objects.create(
            species_name='Rpt Tilapia', category=cat, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=Decimal('80'), default_avg_body_weight_kg=Decimal('0.25'))
        cls.stock = StockingRecord.objects.create(
            fisherfolk=cls.pedro, species=cls.tilapia, culture_type='Pond', date_stocked=today - timedelta(days=20),
            number_of_fingerlings=500, season='Dry', year=today.year)
        cls.fd_stock = FisheriesDisasterReport.objects.create(
            stocking_record=cls.stock, disaster_type='Typhoon', date_of_occurrence=today - timedelta(days=5),
            volume_lost_kg='120.50', is_total_loss=True)
        cls.fd_general = FisheriesDisasterReport.objects.create(
            fisherfolk=cls.ana, disaster_type='Other', disaster_type_other_specify='Oil spill',
            date_of_occurrence=today - timedelta(days=60), status='Recovered', recovered_date=today)

        # crops: one on a parcel, one on an organization-only record
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-000451', first_name='Maria', last_name='Santos', gender='Female',
            birthdate=date(1985, 3, 3), barangay='Alaska', civil_status='Single')
        cls.parcel = FarmParcel.objects.create(farmer=cls.farmer, parcel_number='P-7', area_hectares='2.00', barangay='Alaska')
        cls.crop_type = CropType.objects.order_by('id').first()
        record = lambda **o: CropMonitoringRecord.objects.create(**{
            'farm_location_barangay': 'Alaska', 'land_status': 'Owner', 'crop_type': cls.crop_type, 'season': 'Wet',
            'year': today.year, 'date_planted': today - timedelta(days=40), 'area_planted_ha': '1.50', 'status': 'Planted', **o})
        cls.rec_a = record(farmer=cls.farmer, farm_parcel=cls.parcel)
        cls.rec_b = record(farmer=cls.farmer, farm_location_barangay='Baracbac')
        cls.cd_a = CropDisasterReport.objects.create(
            monitoring_record=cls.rec_a, disaster_type='Flood', date_of_occurrence=today - timedelta(days=3), area_affected_ha='0.75')
        cls.cd_b = CropDisasterReport.objects.create(
            monitoring_record=cls.rec_b, disaster_type='Other', disaster_type_other_specify='Hail', date_of_occurrence=today - timedelta(days=90),
            status='Recovered', area_affected_ha='1.00')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def get(self, url, **params):
        r = self.client.get(url, params)
        self.assertEqual(r.status_code, 200, r.content[:300])
        return r.json()

    @staticmethod
    def rows(doc):
        return doc['sections'][0]['rows']

    # --- access and input checks
    def test_citizens_are_refused(self):
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.get(FISH).status_code, 403)
        self.assertEqual(self.client.get(CROP).status_code, 403)

    def test_bad_filters_are_a_400(self):
        for url in (FISH, CROP):
            self.assertEqual(self.client.get(url, {'date_from': 'soon'}).status_code, 400)
            self.assertEqual(self.client.get(url, {'status': 'Maybe'}).status_code, 400)
            self.assertEqual(self.client.get(url, {'disaster_type': 'Earthquake'}).status_code, 400)
            self.assertEqual(self.client.get(url, {'date_from': '2030-01-02', 'date_to': '2030-01-01'}).status_code, 400)

    # --- fisheries
    def test_fisheries_lists_every_report_newest_first_with_its_stock_owner_and_volume(self):
        doc = self.get(FISH)
        self.assertEqual(doc['title'], 'Fisheries Disaster Reports')
        rows = self.rows(doc)
        self.assertEqual([r[0] for r in rows], [self.fd_stock.report_number, self.fd_general.report_number])
        stock_row, general_row = rows
        self.assertEqual(stock_row[1:5], ['Pedro Sea', 'Alaska', 'Rpt Tilapia', 'Typhoon'])
        self.assertEqual(stock_row[6:9], ['120.50', 'Yes', 'Active'])
        self.assertEqual(general_row[1:5], ['Ana Sea', 'Baracbac', 'General (no stock)', 'Other — Oil spill'])
        self.assertEqual(general_row[6:9], ['—', 'No', 'Recovered'])
        self.assertEqual(dict(map(tuple, doc['stats'])), {
            'Total Reports': 2, 'Active': 1, 'Recovered': 1, 'Total Losses': 1, 'Volume Lost (kg)': '120.50'})

    def test_fisheries_filters(self):
        names = lambda **p: [r[1] for r in self.rows(self.get(FISH, **p))]
        self.assertEqual(names(barangay='Baracbac'), ['Ana Sea'])
        self.assertEqual(names(status='Active'), ['Pedro Sea'])
        self.assertEqual(names(disaster_type='Typhoon'), ['Pedro Sea'])
        self.assertEqual(names(date_from=str(self.today - timedelta(days=10))), ['Pedro Sea'])
        self.assertEqual(names(date_to=str(self.today - timedelta(days=30))), ['Ana Sea'])
        self.assertEqual(names(search='tilapia'), ['Pedro Sea'])
        self.assertEqual(names(search='ana'), ['Ana Sea'])
        self.assertEqual(names(search=self.fd_general.report_number), ['Ana Sea'])
        self.assertEqual(names(search='zzzz'), [])

    def test_fisheries_date_range_includes_both_ends(self):
        day = str(self.today - timedelta(days=5))
        self.assertEqual(len(self.rows(self.get(FISH, date_from=day, date_to=day))), 1)

    # --- crops
    def test_crops_lists_every_report_with_farmer_crop_parcel_and_area(self):
        doc = self.get(CROP)
        self.assertEqual(doc['title'], 'Crop / Parcel Disaster Reports')
        rows = self.rows(doc)
        self.assertEqual(len(rows), 2)
        a, b = rows
        self.assertTrue(a[0].startswith('CDR-'))
        self.assertEqual(a[1:8], ['Maria Santos', 'Alaska', self.crop_type.name, 'P-7', 'Flood', text_date(self.today - timedelta(days=3)), '0.75'])
        self.assertEqual(a[8:10], ['No', 'Active'])
        self.assertEqual(b[2:5], ['Baracbac', self.crop_type.name, '—'])
        self.assertEqual(b[5], 'Other — Hail')
        self.assertEqual(dict(map(tuple, doc['stats'])), {
            'Total Reports': 2, 'Active': 1, 'Recovered': 1, 'Total Losses': 0, 'Area Affected (ha)': '1.75'})

    def test_crop_filters(self):
        farmers = lambda **p: [r[5] for r in self.rows(self.get(CROP, **p))]
        self.assertEqual(farmers(barangay='Baracbac'), ['Other — Hail'])
        self.assertEqual(farmers(barangay='alaska'), ['Flood'])
        self.assertEqual(farmers(status='Recovered'), ['Other — Hail'])
        self.assertEqual(farmers(disaster_type='Flood'), ['Flood'])
        self.assertEqual(farmers(date_to=str(self.today - timedelta(days=30))), ['Other — Hail'])
        self.assertEqual(farmers(search='santos'), ['Flood', 'Other — Hail'])
        self.assertEqual(farmers(search=f'CDR-{self.cd_a.date_reported.year}-{self.cd_a.pk:05d}'), ['Flood'])
        self.assertEqual(farmers(search='zzzz'), [])

    def test_an_empty_result_is_a_normal_document(self):
        doc = self.get(CROP, search='zzzz')
        self.assertEqual(self.rows(doc), [])
        self.assertEqual(doc['stats'][0], ['Total Reports', 0])
        self.assertTrue(doc['sections'][0]['empty'])

    # --- formats
    def test_pdf_and_excel_for_both_reports(self):
        for url in (FISH, CROP):
            pdf = self.client.get(url, {'format': 'pdf', 'prepared_by': 'Clerk'})
            self.assertEqual(pdf['Content-Type'], 'application/pdf')
            self.assertTrue(pdf.content.startswith(b'%PDF'))
            self.assertIn(b'/MediaBox [ 0 0 792 612 ]', pdf.content)  # 10+ columns: landscape
            xl = self.client.get(url, {'format': 'excel'})
            ws = openpyxl.load_workbook(io.BytesIO(xl.content)).active
            cells = [str(c) for row in ws.iter_rows(values_only=True) for c in row if c is not None]
            self.assertIn('Total Reports', cells)
            self.assertIn('Reference No.', cells)

    def test_an_empty_pdf_still_builds(self):
        self.assertTrue(self.client.get(CROP, {'format': 'pdf', 'search': 'zzzz'}).content.startswith(b'%PDF'))


def text_date(d):
    return d.strftime('%b %d, %Y')
