"""Crop Monitoring grouped by crop or by farmer: each group row carries the facts its columns show (how many farmers grow a crop; a farmer's RSBSA
number and contact number), like the ordinary table's columns."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import Farmer
from associations.models import FarmersOrganization
from production.models import CropMonitoringRecord, CropType
from production.test_monitoring_list_query_count import make_record

URL = '/api/production/monitoring/groups/'


class MonitoringGroupColumnTests(APITestCase):
    def setUp(self):
        self.client.force_authenticate(get_user_model().objects.create_user(username='mg-admin', password='pw', role='ADMIN', email='mg@x.test'))

    def groups(self, group_by):
        response = self.client.get(URL, {'group_by': group_by})
        self.assertEqual(response.status_code, 200, response.content[:200])
        return response.json()['results']

    def test_a_crop_group_says_how_many_different_farmers_grow_it(self):
        first = make_record()
        second = make_record()
        make_record()
        CropMonitoringRecord.objects.create(
            farmer=first.farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=first.crop_type, season='Dry', year=2026,
            date_planted=first.date_planted, area_planted_ha='0.50')     # a second crop of the first farmer: still one farmer
        group = next(g for g in self.groups('crop') if g['id'] == first.crop_type_id)
        self.assertEqual((group['count'], group['farmers']), (4, 3))
        self.assertEqual(second.crop_type_id, first.crop_type_id)

    def test_a_crop_with_no_records_is_not_listed(self):
        make_record()
        ids = [g['id'] for g in self.groups('crop')]
        self.assertEqual(len(ids), 1)
        self.assertNotIn(CropType.objects.order_by('-id').first().id, ids)

    def test_a_farmer_group_carries_the_rsbsa_number_and_contact_number(self):
        record = make_record()
        Farmer.objects.filter(pk=record.farmer_id).update(contact_number='09175550000')
        group = next(g for g in self.groups('farmer') if g['id'] == record.farmer_id)
        self.assertEqual(group['rsbsa_number'], record.farmer.rsbsa_number)
        self.assertEqual(group['contact_number'], '09175550000')
        self.assertEqual(group['barangay'], 'Alaska')
        self.assertEqual(group['count'], 1)

    def test_an_organization_group_has_no_personal_facts(self):
        record = make_record()
        org = FarmersOrganization.objects.order_by('-id').first()
        CropMonitoringRecord.objects.filter(pk=record.pk).update(farmer=None, farmers_organization=org)
        groups = self.groups('farmer')
        group = next(g for g in groups if g['key'].startswith('o'))
        self.assertEqual((group['rsbsa_number'], group['contact_number']), ('', ''))

    def test_every_group_kind_still_has_its_old_fields(self):
        make_record()
        for group_by in ('crop', 'farmer', 'parcel'):
            group = self.groups(group_by)[0]
            for key in ('key', 'id', 'name', 'barangay', 'count', 'area_planted_ha', 'near_harvest'):
                self.assertIn(key, group, f'{group_by}: {key}')
