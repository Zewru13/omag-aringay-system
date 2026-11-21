"""No settings list takes the same name twice (audit request 2026-11-21).

The database refuses an exact repeat, but on the live Postgres database "palay" and "Palay", or "Palay " with a stray space, were different
names. Every "Add" in the settings now tidies the name (extra spaces) and refuses one that is already in the list ignoring capitals, spaces and
punctuation, with a message that names the one already there. Lists that group their names (varieties of one crop, subcategories of one
category, signers of one role) only compare within the group. Editing a row to its own name, or only changing its capitals, stays allowed.

Run ONLY against an isolated test database (never the shared Supabase database)."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from production.models import CropCategory

User = get_user_model()

# (label, list url, the fields besides the name that the form sends)
LISTS = [
    ('seed source', '/api/production/seed-sources/', {}),
    ('crop activity type', '/api/production/activity-types/', {}),
    ('crop category', '/api/production/crop-categories/', {}),
    ('input type', '/api/production/input-types/', {'input_type': 'Fertilizer'}),
    ('species category', '/api/fisheries/species-categories/', {}),
    ('fisheries activity type', '/api/fisheries/activity-types/', {}),
    ('feed type', '/api/fisheries/feed-types/', {}),
    ('disease type', '/api/fisheries/disease-types/', {}),
    # these already refused an exact repeat in any capitals; now spaces and punctuation count as the same name too
    ('source agency', '/api/interventions/agencies/', {}),
    ('parcel classification', '/api/farmers/parcel-classifications/', {}),
    ('fingerling source', '/api/fisheries/fingerling-sources/', {}),
]
VARIANTS = ['Local Seed Bank', 'local seed bank', '  LOCAL   SEED  BANK ', 'Local-Seed Bank', 'local seed bank.']


class SettingsDuplicateTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='sd-admin', password='pw', role='ADMIN', email='sd-admin@x.test')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def post(self, url, name, extra=None):
        return self.client.post(url, {'name': name, **(extra or {})}, format='json')

    def test_a_name_is_tidied_and_the_same_name_in_any_spelling_is_refused(self):
        for label, url, extra in LISTS:
            first = self.post(url, '  Local   Seed Bank ', extra)
            self.assertEqual(first.status_code, 201, (label, first.content))
            self.assertEqual(first.json()['name'], 'Local Seed Bank', f'{label}: extra spaces are tidied')
            for variant in VARIANTS:
                again = self.post(url, variant, extra)
                self.assertEqual(again.status_code, 400, (label, variant, again.content))
                self.assertIn('name', again.json(), (label, variant))
                self.assertIn('Local Seed Bank', str(again.json()['name']), f'{label}: the message names the one already there')
            self.assertEqual(self.client.get(url).status_code, 200)

    def test_a_different_name_is_still_accepted(self):
        for label, url, extra in LISTS:
            self.assertEqual(self.post(url, 'First Name', extra).status_code, 201, label)
            self.assertEqual(self.post(url, 'Second Name', extra).status_code, 201, label)

    def test_a_blank_name_or_one_with_no_letters_is_refused(self):
        for label, url, extra in LISTS:
            for name in ('', '   ', '---'):
                self.assertEqual(self.post(url, name, extra).status_code, 400, (label, name))

    def test_editing_a_row(self):
        for label, url, extra in LISTS:
            a = self.post(url, 'Alpha List', extra).json()
            b = self.post(url, 'Beta List', extra).json()
            detail = f'{url}{a["id"]}/'
            self.assertEqual(self.client.patch(detail, {'name': 'Alpha List'}, format='json').status_code, 200, f'{label}: its own name')
            self.assertEqual(self.client.patch(detail, {'name': 'ALPHA list'}, format='json').status_code, 200, f'{label}: only the capitals')
            self.assertEqual(self.client.patch(detail, {'name': ' beta  LIST'}, format='json').status_code, 400, f'{label}: another row\'s name')
            self.assertEqual(self.client.patch(f'{url}{b["id"]}/', {'name': 'Gamma List'}, format='json').status_code, 200, f'{label}: a new name')

    # --- lists that group their names
    def test_a_subcategory_name_may_repeat_in_another_category_but_not_in_its_own(self):
        cereals = CropCategory.objects.create(name='Cereals')
        fruits = CropCategory.objects.create(name='Fruits')
        url = '/api/production/crop-subcategories/'
        self.assertEqual(self.client.post(url, {'name': 'Local', 'category': cereals.id}, format='json').status_code, 201)
        self.assertEqual(self.client.post(url, {'name': ' LOCAL ', 'category': cereals.id}, format='json').status_code, 400)
        self.assertEqual(self.client.post(url, {'name': 'Local', 'category': fruits.id}, format='json').status_code, 201)

    def test_a_signer_is_the_same_person_only_within_one_role(self):
        url = '/api/reports/signatories/'
        self.assertEqual(self.client.post(url, {'name': 'Ana Cruz', 'role': 'noted'}, format='json').status_code, 201)
        again = self.client.post(url, {'name': ' ana  cruz', 'role': 'noted'}, format='json')
        self.assertEqual(again.status_code, 400, again.content)
        self.assertIn('Ana Cruz', str(again.json()['name']))
        self.assertEqual(self.client.post(url, {'name': 'Ana Cruz', 'role': 'approved'}, format='json').status_code, 201, 'the same person may sign in another role')

    def test_the_assistance_lists_compare_the_same_way(self):
        options = '/api/interventions/options/'
        for kind, domain in (('equipment', 'crop'), ('training', 'crop'), ('gear', 'fisheries')):
            self.assertEqual(self.client.post(options, {'domain': domain, 'kind': kind, 'name': 'Local Seed Bank'}, format='json').status_code, 201)
            for variant in VARIANTS:
                r = self.client.post(options, {'domain': domain, 'kind': kind, 'name': variant}, format='json')
                self.assertEqual(r.status_code, 400, (kind, variant, r.content))
        types = '/api/interventions/assistance-types/'
        self.assertEqual(self.client.post(types, {'name': 'Pest Spray', 'domains': ['crop']}, format='json').status_code, 201)
        for variant in ('pest spray', 'PEST-SPRAY', ' Pest   Spray.'):
            self.assertEqual(self.client.post(types, {'name': variant, 'domains': ['crop']}, format='json').status_code, 400, variant)
