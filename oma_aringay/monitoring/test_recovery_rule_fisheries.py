"""A fisheries disaster cannot be marked Recovered once every stock and pond it affected is harvested or a total loss."""
import itertools

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from fisheries.models import (
    FisheriesDisasterReport, FisheriesDisasterStockLoss, Fisherfolk, SpeciesCategory, SpeciesOption, StockingRecord,
)

_RSBSA = itertools.count(991000)


class FisheriesRecoveryRuleTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='fr-admin', password='pw', role='ADMIN', email='fr@x.test')
        cls.person = Fisherfolk.objects.create(
            first_name='Rule', last_name='Fish', gender='Male', birthdate=timezone.localdate().replace(year=1990),
            barangay='Poblacion', fisherfolk_type='Aquaculture', rsbsa_number='01-033-02-019-%06d' % next(_RSBSA))
        category, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        cls.species, _ = SpeciesOption.objects.get_or_create(species_name='Tilapia', defaults=dict(
            category=category, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=80, default_avg_body_weight_kg='0.25'))

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def stock(self, status='Stocked'):
        stock = StockingRecord.objects.create(
            fisherfolk=self.person, species=self.species, date_stocked=timezone.localdate().replace(month=1, day=1), number_of_fingerlings=100,
            season='Wet', year=timezone.localdate().year, area_hectares='1.00')
        if status != 'Stocked':
            StockingRecord.objects.filter(pk=stock.pk).update(status=status)
        return stock

    def report(self, stocks, total_flags=None, **over):
        report = FisheriesDisasterReport.objects.create(
            stocking_record=stocks[0], disaster_type='Flooding', date_of_occurrence=timezone.localdate(), estimated_damage='x', **over)
        for i, stock in enumerate(stocks):
            FisheriesDisasterStockLoss.objects.create(
                disaster_report=report, stocking_record=stock, fingerlings_lost=5, is_total_loss=bool(total_flags and total_flags[i]))
        return report

    def resolve(self, report):
        return self.client.post(f'/api/fisheries/disasters/{report.id}/resolve/', {'recovery_note': 'ok'}, format='json')

    def row(self, report):
        data = self.client.get('/api/fisheries/disaster-reports/', {'page': 1}).json()
        rows = data['results'] if isinstance(data, dict) else data
        return next(r for r in rows if r['id'] == report.id)

    def test_a_disaster_on_a_stocked_pond_can_be_recovered(self):
        report = self.report([self.stock('Stocked')])
        self.assertEqual(self.row(report)['fisherfolk_id'], self.person.id)   # the person the screen groups by
        self.assertTrue(self.row(report)['can_recover'])
        self.assertEqual(self.resolve(report).status_code, 200)

    def test_when_every_stock_is_harvested_it_cannot_be_recovered(self):
        report = self.report([self.stock('Harvested'), self.stock('Harvested')])
        row = self.row(report)
        self.assertFalse(row['can_recover'])
        self.assertIn('harvested', row['recovery_block_reason'].lower())
        response = self.resolve(report)
        self.assertEqual(response.status_code, 400)
        self.assertIn('harvested', response.json()['detail'].lower())

    def test_it_can_still_be_recovered_while_one_affected_stock_is_still_open(self):
        report = self.report([self.stock('Harvested'), self.stock('Near Harvest')])
        self.assertTrue(self.row(report)['can_recover'])
        self.assertEqual(self.resolve(report).status_code, 200)

    def test_when_every_affected_pond_was_a_total_loss_it_cannot_be_recovered(self):
        report = self.report([self.stock('Stocked'), self.stock('Stocked')], total_flags=[True, True])
        self.assertFalse(self.row(report)['can_recover'])
        self.assertEqual(self.resolve(report).status_code, 400)

    def test_a_total_loss_stock_cannot_be_recovered(self):
        report = self.report([self.stock('Total Loss')])
        self.assertFalse(self.row(report)['can_recover'])

    def test_the_details_document_carries_the_same_answer(self):
        report = self.report([self.stock('Harvested')])
        doc = self.client.get(f'/api/fisheries/disaster-reports/{report.id}/').json()
        self.assertFalse(doc['can_recover'])
        self.assertTrue(doc['recovery_block_reason'])

    def test_the_activity_panel_feed_carries_the_flag(self):
        stock = self.stock('Stocked')
        report = self.report([stock])
        feed = self.client.get(f'/api/fisheries/stocking/{stock.id}/suggestions/').json()['disaster_response']
        self.assertEqual([(d['disaster_id'], d['can_recover']) for d in feed], [(report.id, True)])
