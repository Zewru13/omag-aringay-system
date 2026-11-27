"""Every address of the API belongs to one module of the Audit Log, named the way the menu names it; search, the module filter and
the kind of account shown under Who."""
from datetime import date
from importlib import import_module

from django.core.cache import cache
from django.test import SimpleTestCase
from django.urls import get_resolver
from rest_framework.test import APITestCase

from auditlog.models import AuditLogEntry
from auditlog.modules import MODULES, module_of
from auditlog.test_audit_log import LOGIN, SOURCES, make_citizen, make_staff
from farmers.models import Farmer


def all_api_routes():
    """Every api/ address served by a view, whatever it does (writing addresses and the ones that send files)."""
    def walk(patterns, prefix=''):
        for p in patterns:
            route = prefix + str(p.pattern)
            if hasattr(p, 'url_patterns'):
                yield from walk(p.url_patterns, route)
            else:
                yield route, p.callback
    return {route[len('api/'):] for route, callback in walk(get_resolver().url_patterns)
            if route.startswith('api/') and (getattr(callback, 'view_class', None) or getattr(callback, 'cls', None))}


class ModuleTests(SimpleTestCase):
    def test_every_address_has_a_module(self):
        routes = all_api_routes()
        self.assertGreater(len(routes), 340)
        missing = [r for r in sorted(routes) if not r.startswith('auditlog/') and module_of(r) not in MODULES]
        self.assertEqual(missing, [], 'addresses without a module in auditlog.modules')

    def test_examples(self):
        for route, module in {
            'farmers/create/': 'Registration', 'farmers/<int:farmer_id>/machinery/': 'Registration',
            'farmers/<int:farmer_id>/parcels/bulk/': 'Crop Management', 'farmers/parcel-classifications/': 'Classification Settings',
            'fisheries/ponds/<int:pk>/': 'Registration', 'monitoring/farm-visits/': 'Registration',
            'monitoring/aquaculture-cycles/': 'Fisheries Management', 'fisheries/species/<int:species_id>/stages/': 'Fisheries Settings',
            'fisheries/activity-types/': 'Activity Settings', 'production/activity-types/': 'Activity Settings',
            'production/crop-types/<int:crop_type_id>/stages/': 'Crop Settings', 'production/stages/<int:pk>/': 'Crop Settings',
            'production/harvest-unit-weights/group/': 'Harvest Unit Settings', 'production/monitoring/bulk-logs/': 'Crop Management',
            'production/monitoring/<int:monitoring_id>/disasters/': 'Disaster', 'monitoring/fisherfolk-disasters/': 'Disaster',
            'production/disaster-logs/<int:pk>/pdf/': 'Disaster', 'reports/disasters/crops/': 'Reports',
            'reports/signatories/': 'Signatories', 'reports/spec-pdf/': 'Reports', 'organizations/my-equipment/request/': 'Cooperatives',
            'interventions/agencies/': 'Assistance Settings', 'interventions/beneficiaries/adhoc/': 'Assistance',
            'accounts/users/create/': 'User Management', 'accounts/login/': 'Sign-in & Account',
            'staff/change-requests/<int:pk>/<str:action>/': 'Sign-in & Account', 'backups/restore/': 'Backup & Restore',
        }.items():
            self.assertEqual(module_of(route), module, route)

    def test_a_dropdown_entry_goes_to_the_settings_page_that_holds_it(self):
        option = lambda name: [{'model': 'interventions.assistanceoption', 'name': name}]
        for name, module in {'crop equipment: Hand Tractor': 'Crop Settings', 'fisheries gear: Gill Net': 'Fisheries Settings',
                             'fisheries equipment: Aerator': 'Fisheries Settings', 'crop seed: Hybrid': 'Assistance Settings'}.items():
            self.assertEqual(module_of('interventions/options/<int:pk>/', option(name)), module, name)
        self.assertEqual(module_of('interventions/options/', ()), 'Assistance Settings')

    def test_odd_input_never_raises(self):
        # a module must never cost the entry: whatever the changes look like, the answer is a string
        with self.assertLogs('auditlog.modules', level='ERROR'):   # what cannot be worked out is logged, never raised
            for changes in (None, [{}], [{'name': None, 'model': None}], 'nonsense'):
                self.assertIsInstance(module_of('interventions/options/', changes), str)
                self.assertIsInstance(module_of('imports/batches/<uuid:batch_id>/undo/', changes), str)
            self.assertEqual(module_of('interventions/options/', [None]), '')
            self.assertEqual(module_of(None), '')

    def test_an_undone_import_goes_where_its_records_belong(self):
        route = 'imports/batches/<uuid:batch_id>/undo/'
        for model, module in {'associations.farmersorganization': 'Cooperatives', 'interventions.beneficiaryrecord': 'Assistance',
                              'farmers.farmparcel': 'Crop Management', 'production.cropmonitoringrecord': 'Crop Management',
                              'monitoring.aquacultureproductioncycle': 'Fisheries Management', 'farmers.farmer': 'Registration'}.items():
            self.assertEqual(module_of(route, [{'model': model, 'name': 'x'}]), module, model)
        self.assertEqual(module_of(route, ()), 'Registration')


LIST = '/api/auditlog/'


class ListFilterTests(APITestCase):
    PASSWORD = 'Staff-pass#2026'

    @classmethod
    def setUpTestData(cls):
        cls.admin = make_staff('md-admin')
        cls.focal = make_staff('md-focal', 'EVALUATOR', 'Fina Focal')

    def setUp(self):
        cache.clear()
        self.client.force_authenticate(self.admin)

    def rows(self, **params):
        res = self.client.get(LIST, params)
        self.assertEqual(res.status_code, 200, res.content)
        return res.data

    def test_a_recorded_action_carries_its_module(self):
        AuditLogEntry.objects.all().delete()
        self.assertEqual(self.client.post(SOURCES, {'name': 'Module Seeds'}, format='json').status_code, 201)
        self.assertEqual(AuditLogEntry.objects.get().module, 'Crop Settings')
        self.assertEqual(self.rows()['results'][0]['module'], 'Crop Settings')

    def test_sign_in_and_download_carry_theirs(self):
        AuditLogEntry.objects.all().delete()
        res = self.client.get('/api/reports/organization-assistance/', {'kind': 'farmers', 'format': 'pdf'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(AuditLogEntry.objects.get().module, 'Reports')
        self.client.force_authenticate(None)
        for password, status in ((self.PASSWORD, 200), ('nope', 401)):
            AuditLogEntry.objects.all().delete()
            res = self.client.post(LOGIN, {'email': self.admin.email, 'password': password}, format='json')
            self.assertEqual(res.status_code, status, res.content)
            self.assertEqual(AuditLogEntry.objects.get().module, 'Sign-in & Account')

    def test_search_takes_words_in_any_order(self):
        AuditLogEntry.objects.all().delete()
        AuditLogEntry.objects.create(user=self.admin, action='UPDATE', object_repr='Updated a farmer: Juan dela Cruz')
        for typed in ('Cruz, Juan', 'juan cruz', 'ada farmer', 'md-admin@x.test', '  CRUZ  '):
            self.assertEqual(self.rows(search=typed)['count'], 1, typed)
        self.assertEqual(self.rows(search='pedro')['count'], 0)
        self.assertEqual(self.rows(search='juan pedro')['count'], 0)

    def test_search_finds_older_entries_by_the_accounts_name(self):
        AuditLogEntry.objects.all().delete()
        old = AuditLogEntry.objects.create(user=self.admin, action='UPDATE', object_repr='Updated a seed source: Bank')
        AuditLogEntry.objects.filter(pk=old.pk).update(user_name='', user_email='')     # written before names were kept
        # an entry that kept its own name is searched by that name only (a restore can put another account under its id)
        AuditLogEntry.objects.create(user=self.admin, action='UPDATE', object_repr='Something else', user_name='Gone Person',
                                     user_email='gone@x.test')
        for typed in ('ada admin', 'admin ada bank', 'md-admin@x.test'):
            self.assertEqual([r['object_repr'] for r in self.rows(search=typed)['results']], ['Updated a seed source: Bank'], typed)
        self.assertEqual(self.rows(search='gone')['count'], 1)

    def test_module_filter(self):
        AuditLogEntry.objects.all().delete()
        for module in ('Disaster', 'Reports', ''):
            AuditLogEntry.objects.create(user=self.admin, action='UPDATE', object_repr=f'x {module}', module=module)
        self.assertEqual([r['module'] for r in self.rows(module='Disaster')['results']], ['Disaster'])
        self.assertEqual(self.rows()['count'], 3)

    def test_ten_to_a_page(self):
        AuditLogEntry.objects.all().delete()
        for i in range(11):
            AuditLogEntry.objects.create(user=self.admin, action='UPDATE', object_repr=f'Entry {i}')
        first, second = self.rows(), self.rows(page=2)
        self.assertEqual((first['count'], len(first['results']), len(second['results'])), (11, 10, 1))

    def test_who_shows_the_kind_of_account(self):
        farmer = Farmer.objects.create(rsbsa_number='01-033-02-019-940001', first_name='Role', last_name='Farmer', gender='Female',
                                       birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        people = {
            'Admin': self.admin, 'Focal Person': self.focal,
            'Farmer': make_citizen('md-farmer', 'FARMER', farmer.id),
            'Fisherfolk': make_citizen('md-fisher', 'FISHERFOLK', 7001),
            'Cooperative': make_citizen('md-coop', 'FARMERS_ORG', 7002),
        }
        AuditLogEntry.objects.all().delete()
        for role, user in people.items():
            AuditLogEntry.objects.create(user=user, action='UPDATE', object_repr=role)
        AuditLogEntry.objects.create(user=None, action='UPDATE', object_repr='gone', user_name='Gone Person')
        found = {r['object_repr']: r['user']['role'] for r in self.rows()['results']}
        self.assertEqual(found, {**{role: role for role in people}, 'gone': ''})

    def test_older_entries_are_given_a_module(self):
        old = import_module('auditlog.migrations.0003_auditlogentry_module').module_for_old
        for (action, model_name), module in {
            ('SIGN_IN', 'accounts.user'): 'Sign-in & Account', ('SIGN_IN_FAILED', 'accounts.user'): 'Sign-in & Account',
            ('SIGN_OUT', ''): 'Sign-in & Account', ('BACKUP', ''): 'Backup & Restore',
            ('RESTORE', 'backups.backuprecord'): 'Backup & Restore', ('UPDATE', 'Farmer'): 'Registration',
            ('UPDATE', 'FarmParcel'): 'Crop Management', ('CREATE', 'User'): 'User Management',
            ('CREATE', 'BeneficiaryRecord'): 'Assistance', ('DELETE', 'FisherfolkBeneficiaryRecord'): 'Assistance',
            ('CREATE', 'HarvestRecord'): 'Crop Management', ('UPDATE', 'Fisherfolk'): 'Registration',
            ('CREATE', 'interventions.assistanceagency'): 'Assistance Settings', ('CREATE', 'production.croptype'): 'Crop Settings',
            ('CREATE', 'production.cropdisasterreport'): 'Disaster', ('CREATE', 'fisheries.fisheriesdisasterreport'): 'Disaster',
            ('CREATE', 'associations.farmersorganizationmember'): 'Cooperatives', ('CREATE', 'fisheries.pond'): 'Registration',
            ('CREATE', 'fisheries.speciesoption'): 'Fisheries Settings', ('CREATE', 'production.activitytype'): 'Activity Settings',
            ('CREATE', 'production.harvestunitweight'): 'Harvest Unit Settings',
            ('CREATE', 'farmers.parcelclassification'): 'Classification Settings',
            ('CREATE', 'monitoring.aquacultureproductioncycle'): 'Fisheries Management', ('CREATE', 'reports.signatory'): 'Signatories',
            ('CREATE', 'core.profilechangerequest'): 'Sign-in & Account', ('UPDATE', 'accounts.user'): 'User Management',
            ('DOWNLOAD', 'download'): '', ('UPDATE', ''): '',
        }.items():
            self.assertEqual(old(action, model_name), module, (action, model_name))
            self.assertIn(old(action, model_name), (*MODULES, ''))
