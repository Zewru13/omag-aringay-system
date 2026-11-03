"""The Fisheries Forecasting "By fisherfolk" view groups the stocking history by fisherfolk; each record names its fisherfolk's RSBSA number,
barangay and contact number so the group row can show them like the ordinary table does."""
from fisheries.models import Fisherfolk
from monitoring.tests import ProductionCycleBase

HISTORY = '/api/fisheries/stocking/history/'


class StockingHistoryFactsTests(ProductionCycleBase):
    def rows(self):
        response = self.client.get(HISTORY)
        self.assertEqual(response.status_code, 200, response.content[:200])
        body = response.json()
        return body['results'] if isinstance(body, dict) else body

    def test_each_record_carries_its_fisherfolks_rsbsa_barangay_and_contact_number(self):
        Fisherfolk.objects.filter(pk=self.ff_a.pk).update(contact_number='09170001111')
        self.assertEqual(self.post().status_code, 201)
        row = self.rows()[0]
        self.assertEqual(row['fisherfolk_rsbsa_number'], self.ff_a.rsbsa_number)
        self.assertEqual(row['fisherfolk_barangay'], 'Poblacion')
        self.assertEqual(row['fisherfolk_contact_number'], '09170001111')

    def test_a_fisherfolk_with_no_contact_number_has_an_empty_one(self):
        self.assertEqual(self.post().status_code, 201)
        self.assertEqual(self.rows()[0]['fisherfolk_contact_number'], '')

    def test_the_existing_fields_are_unchanged(self):
        self.assertEqual(self.post().status_code, 201)
        row = self.rows()[0]
        for key in ('id', 'fisherfolk', 'fisherfolk_name', 'status', 'species_name'):
            self.assertIn(key, row)
