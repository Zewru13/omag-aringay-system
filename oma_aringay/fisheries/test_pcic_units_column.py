"""Aquaculture Monitoring has a PCIC INSURED column: each row (a production cycle's stocking record) says which of the cycle's ponds / cages are
insured, so the table can show one tick per pond or cage."""
from django.db import connection
from django.test.utils import CaptureQueriesContext

from fisheries.models import StockingRecord
from monitoring.models import AquacultureProductionUnit
from monitoring.tests import ProductionCycleBase

LIST = '/api/fisheries/stocking/'


class PcicUnitsColumnTests(ProductionCycleBase):
    def rows(self, url=LIST):
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200, response.content[:200])
        body = response.json()
        return body['results'] if isinstance(body, dict) else body

    def make_cycle(self, insured_numbers=()):
        self.assertEqual(self.post().status_code, 201)
        record = StockingRecord.objects.order_by('-id').first()
        units = list(AquacultureProductionUnit.objects.filter(production_cycle_id=record.production_cycle_id).order_by('unit_number'))
        for unit in units:
            if unit.unit_number in insured_numbers:
                unit.has_pcic_insurance = True
                unit.save()
        return record, units

    def test_each_row_lists_the_ponds_or_cages_of_its_cycle_with_their_insurance(self):
        record, units = self.make_cycle(insured_numbers=(1,))
        row = next(r for r in self.rows() if r['id'] == record.id)
        self.assertEqual(
            row['pcic_units'],
            [{'id': units[0].id, 'label': f'{units[0].get_unit_type_display()} 1', 'insured': True},
             {'id': units[1].id, 'label': f'{units[1].get_unit_type_display()} 2', 'insured': False}],
        )

    def test_nothing_insured_is_all_false(self):
        record, _ = self.make_cycle()
        row = next(r for r in self.rows() if r['id'] == record.id)
        self.assertEqual([u['insured'] for u in row['pcic_units']], [False, False])

    def test_a_stocking_record_without_a_cycle_has_no_units(self):
        record, _ = self.make_cycle()
        StockingRecord.objects.filter(pk=record.pk).update(production_cycle=None)
        row = next(r for r in self.rows() if r['id'] == record.id)
        self.assertEqual(row['pcic_units'], [])

    def test_the_history_and_detail_answers_have_it_too(self):
        record, units = self.make_cycle(insured_numbers=(2,))
        history = next(r for r in self.rows('/api/fisheries/stocking/history/') if r['id'] == record.id)
        self.assertEqual([u['insured'] for u in history['pcic_units']], [False, True])
        detail = self.client.get(f'{LIST}{record.id}/').json()
        self.assertEqual([u['insured'] for u in detail['pcic_units']], [False, True])

    def test_the_number_of_queries_does_not_grow_with_the_number_of_cycles(self):
        for _ in range(2):
            self.make_cycle(insured_numbers=(1,))
        with CaptureQueriesContext(connection) as few_ctx:
            few_rows = self.rows()
        for _ in range(5):
            self.make_cycle(insured_numbers=(1, 2))
        with CaptureQueriesContext(connection) as many_ctx:
            many_rows = self.rows()
        self.assertEqual((len(few_rows), len(many_rows)), (2, 7))
        self.assertLessEqual(len(many_ctx.captured_queries), len(few_ctx.captured_queries),
                             f'{len(few_ctx.captured_queries)} queries for 2 rows but {len(many_ctx.captured_queries)} for 7')
