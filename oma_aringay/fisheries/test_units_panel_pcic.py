"""The PCIC check of a pond / cage lives inside the ponds/cages panel that opens when a row of Aquaculture Monitoring is clicked
(GET /fisheries/stocking/<id>/production-units/): each unit says whether it is insured. The list rows themselves carry no PCIC column."""
from fisheries.models import StockingRecord
from monitoring.models import AquacultureProductionUnit
from monitoring.tests import ProductionCycleBase

STOCKING = '/api/fisheries/stocking/'


class UnitsPanelPcicTests(ProductionCycleBase):
    def make_cycle(self, insured_numbers=()):
        self.assertEqual(self.post().status_code, 201)
        record = StockingRecord.objects.order_by('-id').first()
        units = list(AquacultureProductionUnit.objects.filter(production_cycle_id=record.production_cycle_id).order_by('unit_number'))
        for unit in units:
            if unit.unit_number in insured_numbers:
                unit.has_pcic_insurance = True
                unit.save()
        return record, units

    def panel(self, record):
        response = self.client.get(f'{STOCKING}{record.id}/production-units/')
        self.assertEqual(response.status_code, 200, response.content[:200])
        return response.json()['units']

    def test_each_unit_in_the_panel_says_whether_it_is_insured(self):
        record, units = self.make_cycle(insured_numbers=(1,))
        self.assertEqual([(u['id'], u['has_pcic_insurance']) for u in self.panel(record)], [(units[0].id, True), (units[1].id, False)])

    def test_nothing_insured_is_all_false(self):
        record, _ = self.make_cycle()
        self.assertEqual([u['has_pcic_insurance'] for u in self.panel(record)], [False, False])

    def test_the_list_rows_have_no_pcic_units_column_any_more(self):
        record, _ = self.make_cycle(insured_numbers=(1,))
        body = self.client.get(STOCKING).json()
        rows = body['results'] if isinstance(body, dict) else body
        row = next(r for r in rows if r['id'] == record.id)
        self.assertNotIn('pcic_units', row)
        self.assertIn('has_pcic_insurance', row)   # the record's own flag stays (older records without ponds/cages)
