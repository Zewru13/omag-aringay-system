"""PCIC insurance recorded ONCE per production cycle (Start Production Cycle), not separately for each pond/cage.

The cycle's checkbox marks every pond/cage of the cycle insured and its stocking record (which also holds the one uploaded document); the
Aquaculture Monitoring table reads the record's flag. Per-pond/cage flags sent the old way still work, and no migration is involved.

Run ONLY against an isolated test database (never the shared Supabase database)."""
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile

from accounts.models import UserLinkedRecord
from fisheries.models import StockingRecord
from monitoring.models import AquacultureProductionCycle, AquacultureProductionUnit
from monitoring.tests import ProductionCycleBase

STOCKING = '/api/fisheries/stocking/'


def _png():
    """A real (tiny) PNG: the photo field checks that an upload is a picture."""
    import io
    from PIL import Image
    buf = io.BytesIO()
    Image.new('RGB', (4, 4), (30, 120, 60)).save(buf, format='PNG')
    return buf.getvalue()


PNG = _png()


class CycleLevelPcicTests(ProductionCycleBase):
    def start(self, **over):
        response = self.post(**over)
        self.assertEqual(response.status_code, 201, response.content[:300])
        cycle = AquacultureProductionCycle.objects.order_by('-id').first()
        return response.json(), cycle, StockingRecord.objects.get(production_cycle=cycle)

    def test_the_one_checkbox_insures_the_cycle_and_every_pond(self):
        body, cycle, record = self.start(pcic_insured=True)
        self.assertEqual([u.has_pcic_insurance for u in cycle.units.order_by('unit_number')], [True, True])
        self.assertTrue(record.has_pcic_insurance)
        self.assertTrue(body['has_pcic_insurance'])
        self.assertEqual(body['stocking_record_id'], record.id)

    def test_not_ticked_is_not_insured(self):
        body, cycle, record = self.start()
        self.assertEqual([u.has_pcic_insurance for u in cycle.units.all()], [False, False])
        self.assertFalse(record.has_pcic_insurance)
        self.assertFalse(body['has_pcic_insurance'])

    def test_the_cycle_checkbox_needs_the_stocking_it_is_recorded_with(self):
        response = self.post(pcic_insured=True, species_option=None)
        self.assertEqual(response.status_code, 400)

    def test_a_pond_flagged_the_old_way_still_insures_the_cycle_only_as_before(self):
        units = [{'length_m': 4, 'width_m': 2, 'fingerling_count': 20, 'has_pcic_insurance': True}, {'length_m': 5, 'width_m': 2, 'fingerling_count': 30}]
        body, cycle, record = self.start(units=units)
        self.assertEqual([u.has_pcic_insurance for u in cycle.units.order_by('unit_number')], [True, False])
        self.assertTrue(record.has_pcic_insurance)

    def test_the_document_is_uploaded_to_the_cycles_stocking_record_and_comes_back_with_the_cycle(self):
        body, cycle, record = self.start(pcic_insured=True)
        upload = self.client.post(f'{STOCKING}{record.id}/pcic-form/', {'photo': SimpleUploadedFile('form.png', PNG, content_type='image/png')}, format='multipart')
        self.assertEqual(upload.status_code, 200, upload.content[:300])
        detail = self.client.get(f'{self.CYCLES}{cycle.id}/').json()
        self.assertTrue(detail['has_pcic_insurance'])
        self.assertEqual(len(detail['pcic_form_photos']), 1)
        self.assertTrue(detail['pcic_form_photos'][0]['url'])

    def test_every_insured_pond_shows_the_cycles_form_in_the_panel(self):
        body, cycle, record = self.start(pcic_insured=True)
        self.client.post(f'{STOCKING}{record.id}/pcic-form/', {'photo': SimpleUploadedFile('form.png', PNG, content_type='image/png')}, format='multipart')
        units = self.client.get(f'{STOCKING}{record.id}/production-units/').json()['units']
        self.assertEqual([(u['has_pcic_insurance'], len(u['pcic_form_photos'])) for u in units], [(True, 1), (True, 1)])

    def test_a_pond_with_its_own_photo_keeps_it(self):
        body, cycle, record = self.start(pcic_insured=True)
        self.client.post(f'{STOCKING}{record.id}/pcic-form/', {'photo': SimpleUploadedFile('form.png', PNG, content_type='image/png')}, format='multipart')
        unit = cycle.units.order_by('unit_number').first()
        unit.pcic_form_photo.save('own.png', SimpleUploadedFile('own.png', PNG, content_type='image/png'), save=True)
        units = self.client.get(f'{STOCKING}{record.id}/production-units/').json()['units']
        self.assertEqual([len(u['pcic_form_photos']) for u in units], [1, 1])   # its own one; the other falls back to the cycle's
        self.assertNotEqual(units[0]['pcic_form_photos'][0]['url'], units[1]['pcic_form_photos'][0]['url'])

    def test_the_stocking_list_rows_carry_the_cycles_flag_and_form(self):
        body, cycle, record = self.start(pcic_insured=True)
        plain_body, plain_cycle, plain_record = self.start()
        self.client.post(f'{STOCKING}{record.id}/pcic-form/', {'photo': SimpleUploadedFile('form.png', PNG, content_type='image/png')}, format='multipart')
        rows = self.client.get(STOCKING).json()
        rows = {r['id']: r for r in (rows['results'] if isinstance(rows, dict) else rows)}
        self.assertTrue(rows[record.id]['has_pcic_insurance'])
        self.assertEqual(len(rows[record.id]['pcic_form_photos']), 1)
        self.assertFalse(rows[plain_record.id]['has_pcic_insurance'])

    def test_a_fisherfolk_starts_their_own_insured_cycle_and_uploads_its_form(self):
        User = get_user_model()
        user = User.objects.create_user(username='ff-pcic', password='pw', role='CITIZEN', email='ffp@x.test')
        UserLinkedRecord.objects.create(user=user, record_type=User.LinkedRecordType.FISHERFOLK, record_id=self.ff_a.id, is_active=True)
        self.client.force_authenticate(user)
        body, cycle, record = self.start(pcic_insured=True)
        self.assertEqual(cycle.fisherfolk_id, self.ff_a.id)
        self.assertTrue(record.has_pcic_insurance)
        upload = self.client.post(f'{STOCKING}{record.id}/pcic-form/', {'photo': SimpleUploadedFile('form.png', PNG, content_type='image/png')}, format='multipart')
        self.assertEqual(upload.status_code, 200)

    def test_another_fisherfolk_cannot_attach_a_form_to_it(self):
        body, cycle, record = self.start(pcic_insured=True)
        User = get_user_model()
        other = User.objects.create_user(username='ff-other2', password='pw', role='CITIZEN', email='fo2@x.test')
        UserLinkedRecord.objects.create(user=other, record_type=User.LinkedRecordType.FISHERFOLK, record_id=self.ff_b.id, is_active=True)
        self.client.force_authenticate(other)
        upload = self.client.post(f'{STOCKING}{record.id}/pcic-form/', {'photo': SimpleUploadedFile('form.png', PNG, content_type='image/png')}, format='multipart')
        self.assertEqual(upload.status_code, 404)

    def test_no_second_pcic_record_is_created(self):
        before = AquacultureProductionUnit.objects.count()
        body, cycle, record = self.start(pcic_insured=True)
        self.assertEqual(AquacultureProductionUnit.objects.count(), before + 2)   # the ponds, nothing more
        self.assertEqual(StockingRecord.objects.filter(production_cycle=cycle).count(), 1)
