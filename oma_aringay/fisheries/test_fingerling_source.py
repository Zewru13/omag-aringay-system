"""Fingerling sources: the list managed in Fisheries Settings, and the source chosen when a production cycle starts (saved on the
cycle's stocking record)."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from fisheries.models import FingerlingSource, StockingRecord
from monitoring.models import AquacultureProductionCycle
from monitoring.tests import ProductionCycleBase

URL = '/api/fisheries/fingerling-sources/'


class FingerlingSourceSettingsTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='fs-admin', password='pw', role='ADMIN', email='fsa@x.test')
        cls.focal = User.objects.create_user(username='fs-focal', password='pw', role='EVALUATOR', email='fsf@x.test')
        cls.citizen = User.objects.create_user(username='fs-cit', password='pw', role='CITIZEN', email='fsc@x.test')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def names(self):
        return [s['name'] for s in self.client.get(URL).json()]

    def test_the_three_original_sources_start_the_list(self):
        self.assertEqual(self.names(), ['BFAR', 'Own Production', 'Private Hatchery'])

    def test_a_source_can_be_added_renamed_and_deleted(self):
        r = self.client.post(URL, {'name': '  Bureau   Hatchery  '}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['name'], 'Bureau Hatchery')                      # spaces tidied
        pk = r.data['id']
        self.assertEqual(self.client.patch(f'{URL}{pk}/', {'name': 'Provincial Hatchery'}, format='json').status_code, 200)
        self.assertIn('Provincial Hatchery', self.names())
        self.assertEqual(self.client.delete(f'{URL}{pk}/').status_code, 204)
        self.assertNotIn('Provincial Hatchery', self.names())

    def test_a_blank_or_repeated_name_is_refused_whatever_the_case(self):
        self.assertEqual(self.client.post(URL, {'name': '   '}, format='json').status_code, 400)
        r = self.client.post(URL, {'name': 'bfar'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('already exists', r.data['name'][0])
        keep = FingerlingSource.objects.create(name='Coop Hatchery')
        self.assertEqual(self.client.patch(f'{URL}{keep.pk}/', {'name': 'Own production'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(f'{URL}{keep.pk}/', {'name': 'COOP HATCHERY'}, format='json').status_code, 200)   # itself is fine

    def test_staff_manage_it_and_a_fisherfolk_account_may_only_read_it(self):
        self.client.force_authenticate(self.focal)
        self.assertEqual(self.client.post(URL, {'name': 'Focal Source'}, format='json').status_code, 201)
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.get(URL).status_code, 403)         # a citizen who is not a fisherfolk has no access at all
        fisherfolk = self.make_fisherfolk_user()
        self.client.force_authenticate(fisherfolk)
        self.assertEqual(self.client.get(URL).status_code, 200)
        self.assertEqual(self.client.post(URL, {'name': 'Mine'}, format='json').status_code, 403)
        pk = FingerlingSource.objects.first().pk
        self.assertEqual(self.client.patch(f'{URL}{pk}/', {'name': 'Changed'}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(f'{URL}{pk}/').status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(URL).status_code, (401, 403))

    def make_fisherfolk_user(self):
        from datetime import date

        from fisheries.models import Fisherfolk
        ff = Fisherfolk.objects.create(
            first_name='Fs', last_name='Fisher', gender='Male', birthdate=date(1990, 1, 1), barangay='Poblacion',
            fisherfolk_type='Aquaculture', rsbsa_number='01-033-02-019-960001')
        User = get_user_model()
        user = User.objects.create_user(username='fs-ff', password='pw', role='CITIZEN', email='fsff@x.test')
        UserLinkedRecord.objects.create(user=user, record_type=User.LinkedRecordType.FISHERFOLK, record_id=ff.id, is_active=True)
        return user


class CycleFingerlingSourceTests(ProductionCycleBase):
    def test_the_source_chosen_when_a_cycle_starts_is_saved_on_its_stocking_record(self):
        r = self.post(fingerling_source='BFAR')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['fingerling_source'], 'BFAR')
        self.assertEqual(StockingRecord.objects.get(production_cycle_id=r.data['id']).fingerling_source, 'BFAR')
        self.assertEqual(self.client.get(f'{self.CYCLES}{r.data["id"]}/').data['fingerling_source'], 'BFAR')

    def test_a_source_added_in_settings_can_be_chosen_and_is_matched_whatever_the_case(self):
        FingerlingSource.objects.create(name='Coop Hatchery')
        r = self.post(fingerling_source='coop hatchery')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['fingerling_source'], 'Coop Hatchery')       # saved as the list spells it

    def test_a_source_not_in_the_list_is_refused_and_nothing_is_saved(self):
        r = self.post(fingerling_source='Somewhere else')
        self.assertEqual(r.status_code, 400)
        self.assertIn('fingerling_source', r.data)
        self.assertEqual(AquacultureProductionCycle.objects.count(), 0)

    def test_the_source_is_optional(self):
        r = self.post()
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['fingerling_source'], '')
        self.assertEqual(self.post(fingerling_source='').status_code, 201)

    def test_editing_the_cycle_does_not_change_the_source(self):
        cid = self.post(fingerling_source='BFAR').data['id']
        r = self.client.patch(f'{self.CYCLES}{cid}/', {'notes': 'edited', 'fingerling_source': 'Own Production'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['fingerling_source'], 'BFAR')

    def test_removing_a_source_from_settings_keeps_the_records_that_used_it(self):
        cid = self.post(fingerling_source='Private Hatchery').data['id']
        FingerlingSource.objects.filter(name='Private Hatchery').delete()
        self.assertEqual(StockingRecord.objects.get(production_cycle_id=cid).fingerling_source, 'Private Hatchery')
        self.assertEqual(self.client.get(f'{self.CYCLES}{cid}/').data['fingerling_source'], 'Private Hatchery')

    def test_the_stocking_record_exposes_the_source_it_was_saved_with(self):
        cid = self.post(fingerling_source='Own Production').data['id']
        rec = StockingRecord.objects.get(production_cycle_id=cid)
        data = self.client.get(f'/api/fisheries/stocking/{rec.id}/').data
        self.assertEqual(data['fingerling_source'], 'Own Production')
