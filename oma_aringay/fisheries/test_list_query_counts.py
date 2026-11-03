"""Ponds and stocking records carry PCIC insurance (and its form photos): their lists must not make a query per insured row."""
from django.db import connection
from django.test.utils import CaptureQueriesContext

from fisheries.models import Pond, StockingRecord
from monitoring.tests import ProductionCycleBase


class FisheriesListQueryCountTests(ProductionCycleBase):
    def queries(self, url):
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(url)
        self.assertEqual(response.status_code, 200, response.content[:200])
        body = response.json()
        return len(ctx.captured_queries), (body['results'] if isinstance(body, dict) else body)

    def test_the_stocking_lists_do_not_grow_with_the_number_of_insured_records(self):
        for url in ('/api/fisheries/stocking/', '/api/fisheries/stocking/history/'):
            StockingRecord.objects.all().delete()
            for _ in range(2):
                self.assertEqual(self.post().status_code, 201)
            StockingRecord.objects.update(has_pcic_insurance=True)
            few, rows_few = self.queries(url)
            for _ in range(5):
                self.assertEqual(self.post().status_code, 201)
            StockingRecord.objects.update(has_pcic_insurance=True)
            many, rows_many = self.queries(url)
            self.assertGreater(len(rows_many), len(rows_few), url)
            self.assertLessEqual(many, few, f'{url}: {few} queries for {len(rows_few)} rows but {many} for {len(rows_many)}')

    def test_the_pond_list_does_not_grow_with_the_number_of_insured_ponds(self):
        url = f'/api/fisheries/fisherfolk/{self.ff_a.id}/ponds/'
        for i in range(2):
            Pond.objects.create(fisherfolk=self.ff_a, name=f'Pond {i}', has_pcic_insurance=True)
        few, rows_few = self.queries(url)
        for i in range(2, 8):
            Pond.objects.create(fisherfolk=self.ff_a, name=f'Pond {i}', has_pcic_insurance=True)
        many, rows_many = self.queries(url)
        self.assertEqual((len(rows_few), len(rows_many)), (2, 8))
        self.assertLessEqual(many, few, f'{few} queries for 2 ponds but {many} for 8')
