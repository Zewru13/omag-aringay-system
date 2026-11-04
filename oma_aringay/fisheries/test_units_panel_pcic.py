"""The PCIC check of a pond / cage lives inside the ponds/cages panel that opens when a row of Aquaculture Monitoring is clicked
(GET /fisheries/stocking/<id>/production-units/): each unit says whether it is insured. The list rows themselves carry no PCIC column."""
from fisheries.models import StockingRecord
from monitoring.models import AquacultureProductionUnit
from monitoring.tests import ProductionCycleBase

STOCKING = '/api/fisheries/stocking/'


class _CycleHelpers(ProductionCycleBase):
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


class UnitsPanelPcicTests(_CycleHelpers):
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


class UnitsPanelPcicDocumentTests(_CycleHelpers):
    """The panel's "View form" opens the unit's uploaded PCIC photos inside the app, so each unit lists them (signed links from the logged-in API)."""

    def attach(self, unit, extra=0):
        from django.contrib.contenttypes.models import ContentType
        from django.core.files.base import ContentFile
        from core.models import PcicFormPhoto
        unit.pcic_form_photo.save('form.png', ContentFile(b'main'), save=True)
        for i in range(extra):
            PcicFormPhoto.objects.create(
                content_type=ContentType.objects.get_for_model(unit, for_concrete_model=False), object_id=unit.pk,
                image=ContentFile(b'page', name=f'page{i}.png'))

    def test_an_insured_unit_lists_its_form_photos_main_first(self):
        record, units = self.make_cycle(insured_numbers=(1,))
        self.attach(units[0], extra=1)
        photos = self.panel(record)[0]['pcic_form_photos']
        self.assertEqual([p['id'] for p in photos][0], 'main')
        self.assertEqual(len(photos), 2)
        self.assertTrue(all(p['url'] for p in photos))

    def test_an_uninsured_unit_or_one_without_a_photo_lists_none(self):
        record, units = self.make_cycle(insured_numbers=(1,))   # unit 1 insured but no photo yet, unit 2 not insured
        self.assertEqual([u['pcic_form_photos'] for u in self.panel(record)], [[], []])

    def test_each_unit_gets_its_own_photos(self):
        record, units = self.make_cycle(insured_numbers=(1, 2))
        self.attach(units[0], extra=2)
        self.attach(units[1])
        self.assertEqual([len(u['pcic_form_photos']) for u in self.panel(record)], [3, 1])

    def test_signed_out_requests_get_nothing(self):
        record, units = self.make_cycle(insured_numbers=(1,))
        self.attach(units[0])
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(f'{STOCKING}{record.id}/production-units/').status_code, (401, 403))

    def test_a_farmer_account_cannot_read_a_fisheries_form(self):
        from django.contrib.auth import get_user_model
        from accounts.models import UserLinkedRecord
        User = get_user_model()
        record, units = self.make_cycle(insured_numbers=(1,))
        self.attach(units[0])
        user = User.objects.create_user(username='farmer-x', password='pw', role='CITIZEN', email='fx@x.test')
        UserLinkedRecord.objects.create(user=user, record_type=User.LinkedRecordType.FARMER, record_id=1, is_active=True)
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get(f'{STOCKING}{record.id}/production-units/').status_code, 403)

    def test_another_fisherfolk_cannot_read_it_but_the_owner_can(self):
        from django.contrib.auth import get_user_model
        from accounts.models import UserLinkedRecord
        User = get_user_model()
        record, units = self.make_cycle(insured_numbers=(1,))
        self.attach(units[0])
        other = User.objects.create_user(username='ff-other', password='pw', role='CITIZEN', email='fo@x.test')
        UserLinkedRecord.objects.create(user=other, record_type=User.LinkedRecordType.FISHERFOLK, record_id=self.ff_b.id, is_active=True)
        owner = User.objects.create_user(username='ff-owner', password='pw', role='CITIZEN', email='fw@x.test')
        UserLinkedRecord.objects.create(user=owner, record_type=User.LinkedRecordType.FISHERFOLK, record_id=record.fisherfolk_id, is_active=True)
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(f'{STOCKING}{record.id}/production-units/').status_code, 404)
        self.client.force_authenticate(owner)
        response = self.client.get(f'{STOCKING}{record.id}/production-units/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['units'][0]['pcic_form_photos']), 1)
