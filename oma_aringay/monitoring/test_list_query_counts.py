"""The aquaculture cycle list is opened on every Aquaculture Monitoring page: its queries must not grow with the number of cycles, ponds or
cages (each insured pond/cage has PCIC form photos to read)."""
from django.db import connection
from django.test.utils import CaptureQueriesContext

from monitoring.models import AquacultureProductionUnit
from monitoring.tests import ProductionCycleBase


class CycleListQueryCountTests(ProductionCycleBase):
    def queries(self):
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(self.CYCLES)
        self.assertEqual(response.status_code, 200, response.content[:200])
        return len(ctx.captured_queries), response.json()

    def add_cycles(self, count):
        for _ in range(count):
            self.assertEqual(self.post().status_code, 201)
        AquacultureProductionUnit.objects.update(has_pcic_insurance=True)   # insured units are the ones that read their form photos

    def test_the_number_of_queries_does_not_grow_with_the_number_of_cycles(self):
        self.add_cycles(2)
        few, body_few = self.queries()
        self.add_cycles(5)
        many, body_many = self.queries()
        self.assertEqual((len(body_few), len(body_many)), (2, 7))
        self.assertLessEqual(many, few, f'{few} queries for 2 cycles but {many} for 7')

    def test_the_units_of_each_cycle_still_say_whether_they_are_insured(self):
        self.add_cycles(1)
        _, body = self.queries()
        self.assertEqual([u['has_pcic_insurance'] for u in body[0]['units']], [True, True])
