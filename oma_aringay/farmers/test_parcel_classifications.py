"""Parcel classifications: the Admin-managed list of "check all that apply" classifications a farm parcel can carry."""
from datetime import date

from django.contrib.auth import get_user_model
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from rest_framework.test import APITestCase

from .models import FarmParcel, Farmer, ParcelClassification
from .serializers import FarmParcelSerializer

LIST = '/api/farmers/parcel-classifications/'
DEFAULTS = {'Organic Farm', 'Within Ancestral Domain', 'Agrarian Reform Beneficiary'}


def make_farmer(number=1):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % (800 + number), first_name='Ana', last_name='Lim', gender='Female',
        birthdate=date(1985, 3, 3), barangay='Alaska', civil_status='Single')


class ParcelClassificationApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='adm', password='pw', role='ADMIN', email='a@x.test')
        cls.focal = User.objects.create_user(username='foc', password='pw', role='EVALUATOR', email='f@x.test')
        cls.citizen = User.objects.create_user(username='cit', password='pw', role='CITIZEN', email='c@x.test')
        cls.farmer = make_farmer()

    def names(self, user=None):
        self.client.force_authenticate(user or self.admin)
        r = self.client.get(LIST)
        self.assertEqual(r.status_code, 200)
        return [c['name'] for c in r.json()]

    def test_the_three_original_tick_boxes_are_the_starting_list(self):
        self.assertEqual(set(self.names()), DEFAULTS)

    def test_everyone_signed_in_reads_it_only_staff_change_it(self):
        self.assertEqual(set(self.names(self.citizen)), DEFAULTS)
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.post(LIST, {'name': 'Irrigated'}).status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(LIST).status_code, 401)
        self.client.force_authenticate(self.focal)
        self.assertEqual(self.client.post(LIST, {'name': 'Irrigated'}).status_code, 201)

    def test_add_rename_hide_and_delete(self):
        self.client.force_authenticate(self.admin)
        created = self.client.post(LIST, {'name': '  Rainfed   Area ', 'is_active': True}).json()
        self.assertEqual(created['name'], 'Rainfed Area')
        url = f'{LIST}{created["id"]}/'
        self.assertEqual(self.client.patch(url, {'name': 'Rainfed Farm'}).json()['name'], 'Rainfed Farm')
        self.assertFalse(self.client.patch(url, {'is_active': False}).json()['is_active'])
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertNotIn('Rainfed Farm', self.names())

    def test_a_name_cannot_be_blank_or_repeated(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(LIST, {'name': '   '}).status_code, 400)
        self.assertEqual(self.client.post(LIST, {'name': 'organic farm'}).status_code, 400)
        organic = ParcelClassification.objects.get(name='Organic Farm')
        self.assertEqual(self.client.patch(f'{LIST}{organic.id}/', {'name': 'Organic Farm'}).status_code, 200)   # its own name is fine

    def test_a_parcel_is_saved_with_the_ticked_names_as_the_list_spells_them(self):
        self.client.force_authenticate(self.admin)
        r = self.client.post(f'/api/farmers/{self.farmer.id}/parcels/', {
            'parcel_number': '', 'area_hectares': '1.00', 'barangay': 'Alaska', 'land_ownership': 'Owner',
            'classifications': ['organic farm', 'Within Ancestral Domain', 'ORGANIC FARM', ' ']}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['classifications'], ['Organic Farm', 'Within Ancestral Domain'])
        self.assertEqual(FarmParcel.objects.get(pk=r.json()['id']).classifications, ['Organic Farm', 'Within Ancestral Domain'])

    def test_a_name_that_is_not_offered_is_refused(self):
        self.client.force_authenticate(self.admin)
        body = {'area_hectares': '1.00', 'barangay': 'Alaska', 'land_ownership': 'Owner'}
        r = self.client.post(f'/api/farmers/{self.farmer.id}/parcels/', {**body, 'classifications': ['Made Up']}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('classifications', r.json())
        ParcelClassification.objects.filter(name='Organic Farm').update(is_active=False)      # hidden = no longer offered
        r = self.client.post(f'/api/farmers/{self.farmer.id}/parcels/', {**body, 'classifications': ['Organic Farm']}, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.client.post(f'/api/farmers/{self.farmer.id}/parcels/', {**body, 'classifications': 'Organic Farm'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_a_parcel_keeps_a_classification_that_was_renamed_hidden_or_deleted(self):
        parcel = FarmParcel.objects.create(farmer=self.farmer, area_hectares='1.00', barangay='Alaska', classifications=['Organic Farm'])
        organic = ParcelClassification.objects.get(name='Organic Farm')
        organic.name = 'Certified Organic'
        organic.is_active = False
        organic.save()
        self.assertEqual(FarmParcel.objects.get(pk=parcel.pk).classifications, ['Organic Farm'])
        organic.delete()
        self.assertEqual(FarmParcel.objects.get(pk=parcel.pk).classifications, ['Organic Farm'])
        # editing the parcel can still carry the old name, but cannot add it to another parcel
        keep = FarmParcelSerializer(parcel, data={'classifications': ['Organic Farm']}, partial=True)
        self.assertTrue(keep.is_valid(), keep.errors)
        other = FarmParcelSerializer(data={'area_hectares': '1.00', 'barangay': 'Alaska', 'land_ownership': 'Owner',
                                           'classifications': ['Organic Farm']})
        self.assertFalse(other.is_valid())


class ParcelImportTemplateTests(APITestCase):
    def test_the_template_names_what_is_offered_right_now_and_not_what_is_hidden(self):
        import io
        import openpyxl
        admin = get_user_model().objects.create_user(username='adm', password='pw', role='ADMIN', email='a@x.test')
        self.client.force_authenticate(admin)
        ParcelClassification.objects.filter(name='Organic Farm').update(is_active=False)
        ParcelClassification.objects.create(name='Irrigated by NIA')
        r = self.client.get('/api/farmers/parcels/import/template/')
        self.assertEqual(r.status_code, 200)
        ws = openpyxl.load_workbook(io.BytesIO(r.content)).active
        cells = [str(c) for row in ws.iter_rows(values_only=True) for c in row if c is not None]
        note = next(c for c in cells if c.startswith('How to fill this in'))
        self.assertIn('Irrigated by NIA', note)
        self.assertIn('Within Ancestral Domain', note)
        self.assertNotIn('Organic Farm', note.split('Classifications:')[1].split('Cropping Schedule')[0])
        self.assertIn('Classifications', cells)


class ParcelClassificationMigrationTests(TransactionTestCase):
    """The old tick-boxes become names, going forward; and back again if the migration is reversed."""
    migrate_from = [('farmers', '0031_remove_farmer_is_active_and_more')]
    migrate_to = [('farmers', '0032_parcel_classifications')]

    def migrate(self, targets):
        executor = MigrationExecutor(connection)
        executor.migrate(targets)
        return executor.loader.project_state(targets).apps

    def tearDown(self):
        # leave the test database fully migrated for whatever runs next
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())

    def test_ticks_become_names_and_back(self):
        old = self.migrate(self.migrate_from)
        Farmer_, Parcel_ = old.get_model('farmers', 'Farmer'), old.get_model('farmers', 'FarmParcel')
        farmer = Farmer_.objects.create(
            rsbsa_number='01-033-02-019-000850', first_name='Ana', last_name='Lim', gender='Female', birthdate=date(1985, 3, 3),
            barangay='Alaska', civil_status='Single')
        both = Parcel_.objects.create(farmer=farmer, area_hectares='1.00', barangay='Alaska', is_organic=True, is_agrarian_reform_beneficiary=True)
        none = Parcel_.objects.create(farmer=farmer, area_hectares='1.00', barangay='Alaska')

        new = self.migrate(self.migrate_to)
        Parcel_ = new.get_model('farmers', 'FarmParcel')
        self.assertEqual(Parcel_.objects.get(pk=both.pk).classifications, ['Organic Farm', 'Agrarian Reform Beneficiary'])
        self.assertEqual(Parcel_.objects.get(pk=none.pk).classifications, [])
        self.assertEqual(set(new.get_model('farmers', 'ParcelClassification').objects.values_list('name', flat=True)), DEFAULTS)

        old = self.migrate(self.migrate_from)       # reverse: the ticks come back
        Parcel_ = old.get_model('farmers', 'FarmParcel')
        row = Parcel_.objects.get(pk=both.pk)
        self.assertEqual((row.is_organic, row.within_ancestral_domain, row.is_agrarian_reform_beneficiary), (True, False, True))
