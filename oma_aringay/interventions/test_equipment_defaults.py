"""Crop Settings > Equipment Types and Fisheries Settings > Equipment Types start with the equipment names the organization forms already use, so
the farmer Machinery dropdown, the organization Equipment dropdown and the assistance Equipment dropdown all read one list an Admin can edit."""
import importlib

from django.apps import apps
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from associations.models import FarmersOrganizationEquipment, FisherfolkOrganizationEquipment
from interventions.equipment_defaults import DEFAULT_EQUIPMENT
from interventions.models import AssistanceOption

migration = importlib.import_module('interventions.migrations.0024_equipment_type_defaults')

CHOICES = '/api/interventions/assistance-choices/'


def organization_names(model):
    return [value for value in model.EquipmentName.values if value != 'Other']


class DefaultListTests(APITestCase):
    def test_the_defaults_are_the_organization_equipment_names_without_other(self):
        self.assertEqual(list(DEFAULT_EQUIPMENT['crop']), organization_names(FarmersOrganizationEquipment))
        self.assertEqual(list(DEFAULT_EQUIPMENT['fisheries']), organization_names(FisherfolkOrganizationEquipment))

    def test_other_is_never_a_default_because_the_dropdowns_add_it_themselves(self):
        for names in DEFAULT_EQUIPMENT.values():
            self.assertNotIn('Other', names)

    def test_no_default_is_repeated(self):
        for names in DEFAULT_EQUIPMENT.values():
            self.assertEqual(len(set(names)), len(names))


class MigrationTests(APITestCase):
    def setUp(self):
        AssistanceOption.objects.filter(kind='equipment').delete()

    def names(self, domain):
        return list(AssistanceOption.objects.filter(domain=domain, kind='equipment').values_list('name', flat=True))

    def test_an_empty_list_is_filled_with_the_defaults(self):
        migration.fill_equipment_types(apps, None)
        self.assertCountEqual(self.names('crop'), DEFAULT_EQUIPMENT['crop'])
        self.assertCountEqual(self.names('fisheries'), DEFAULT_EQUIPMENT['fisheries'])

    def test_a_list_an_admin_already_curated_is_left_alone(self):
        AssistanceOption.objects.create(domain='crop', kind='equipment', name='Mini Tiller')
        migration.fill_equipment_types(apps, None)
        self.assertEqual(self.names('crop'), ['Mini Tiller'])
        self.assertCountEqual(self.names('fisheries'), DEFAULT_EQUIPMENT['fisheries'])   # the other domain was empty, so it is filled

    def test_running_it_twice_adds_nothing(self):
        migration.fill_equipment_types(apps, None)
        before = AssistanceOption.objects.count()
        migration.fill_equipment_types(apps, None)
        self.assertEqual(AssistanceOption.objects.count(), before)

    def test_the_units_lists_are_not_touched(self):
        AssistanceOption.objects.create(domain='crop', kind='unit', name='tray')
        migration.fill_equipment_types(apps, None)
        self.assertEqual(list(AssistanceOption.objects.filter(kind='unit').values_list('name', flat=True)), ['tray'])


class DropdownListTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='eq-admin', password='pw', role='ADMIN', email='eq@x.test')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_a_fresh_database_already_offers_the_defaults_in_both_domains(self):
        for domain in ('crop', 'fisheries'):
            equipment = self.client.get(CHOICES, {'domain': domain}).json()['equipment']
            self.assertCountEqual(equipment, DEFAULT_EQUIPMENT[domain], domain)

    def test_a_name_an_admin_adds_joins_the_dropdowns_and_a_deleted_one_leaves(self):
        added = self.client.post('/api/interventions/options/', {'domain': 'crop', 'kind': 'equipment', 'name': 'Mini Tiller'}, format='json')
        self.assertEqual(added.status_code, 201, added.content[:200])
        self.assertIn('Mini Tiller', self.client.get(CHOICES, {'domain': 'crop'}).json()['equipment'])
        gone = AssistanceOption.objects.get(domain='crop', kind='equipment', name='Hand Tractor')
        self.assertEqual(self.client.delete(f'/api/interventions/options/{gone.id}/').status_code, 204)
        self.assertNotIn('Hand Tractor', self.client.get(CHOICES, {'domain': 'crop'}).json()['equipment'])
