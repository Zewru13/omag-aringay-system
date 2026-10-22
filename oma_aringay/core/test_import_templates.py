"""Every import has a template to download, and the template is what the import reads.

Round trip: download the template, upload it untouched, and the importer must accept it (no header error) and find nothing to
import (its sample row and note are skipped). A route guard fails when an import is added without a template route."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import URLPattern, URLResolver, get_resolver
from rest_framework.test import APITestCase

from associations.models import FarmersOrganization, FisherfolkOrganization
from farmers.models import Farmer
from interventions.test_confirmation_photos import make_org

_N = itertools.count(1)


def _routes(patterns=None, prefix=''):
    """Every route string of the project, e.g. 'api/organizations/farmers/<int:pk>/members/import/'."""
    patterns = get_resolver().url_patterns if patterns is None else patterns
    for p in patterns:
        route = prefix + str(p.pattern)
        if isinstance(p, URLResolver):
            yield from _routes(p.url_patterns, route)
        elif isinstance(p, URLPattern):
            yield route


class TemplateRoundTripTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='tpl-admin', password='pw', role='ADMIN', email='tpl@x.test')
        cls.farmers_org = make_org(FarmersOrganization, 'Template Farmers')
        cls.fisher_org = make_org(FisherfolkOrganization, 'Template Fishers')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (960000 + next(_N)), first_name='Tina', last_name='Template', gender='Female',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def pairs(self):
        o, f, farmer = self.farmers_org.id, self.fisher_org.id, self.farmer.id
        return {
            'farmer organizations': ('/api/organizations/farmers/import/template/', '/api/organizations/farmers/import/'),
            'fisherfolk organizations': ('/api/organizations/fisherfolk/import/template/', '/api/organizations/fisherfolk/import/'),
            'farmer organization members': (f'/api/organizations/farmers/{o}/members/import/template/', f'/api/organizations/farmers/{o}/members/import/'),
            'fisherfolk organization members': (f'/api/organizations/fisherfolk/{f}/members/import/template/', f'/api/organizations/fisherfolk/{f}/members/import/'),
            'farmer organization equipment': (f'/api/organizations/farmers/{o}/equipment/import/template/', f'/api/organizations/farmers/{o}/equipment/import/'),
            'fisherfolk organization equipment': (f'/api/organizations/fisherfolk/{f}/equipment/import/template/', f'/api/organizations/fisherfolk/{f}/equipment/import/'),
            'crop assistance': ('/api/interventions/beneficiaries/adhoc/import/template/', '/api/interventions/beneficiaries/adhoc/import/'),
            'fisheries assistance': ('/api/interventions/fisherfolk-beneficiaries/adhoc/import/template/', '/api/interventions/fisherfolk-beneficiaries/adhoc/import/'),
            'farm parcels': ('/api/farmers/parcels/import/template/', f'/api/farmers/{farmer}/parcels/import/'),
            'wizard crops': ('/api/farmers/parcel-crops/template/', '/api/farmers/parcel-crops/parse/'),
        }

    def download(self, url):
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200, f'{url}: {res.status_code}')
        self.assertIn('spreadsheetml', res['Content-Type'], url)
        return SimpleUploadedFile('template.xlsx', res.content, content_type=res['Content-Type'])

    def test_each_template_is_accepted_by_its_import_and_holds_nothing_to_import(self):
        for name, (template_url, import_url) in self.pairs().items():
            with self.subTest(name):
                upload = self.download(template_url)
                res = self.client.post(import_url, {'file': upload, 'dry_run': 'true'}, format='multipart')
                self.assertEqual(res.status_code, 200, f'{name}: {res.status_code} {res.content[:300]}')
                data = res.json()
                self.assertEqual(data.get('rows', data.get('crops', [])), [], f'{name}: the template\'s own sample row was read as data')
                self.assertEqual(data.get('created', 0), 0, name)

    def test_the_registry_template_is_accepted_and_is_empty(self):
        upload = self.download('/api/farmers/rsbsa-import/template/')
        res = self.client.post('/api/farmers/rsbsa-import/preview/', {'file': upload}, format='multipart')
        # An accepted header row with no data rows is the importer's own "nothing to import" answer; a wrong header is a different error.
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn('valid header row but no data rows', res.json()['detail'])

    def test_the_registry_template_has_the_exact_columns_the_importer_checks(self):
        import io

        import openpyxl
        from farmers.rsbsa_import import EXPECTED_HEADERS_V2

        res = self.client.get('/api/farmers/rsbsa-import/template/')
        book = openpyxl.load_workbook(io.BytesIO(res.content))
        first = book.worksheets[0]
        self.assertEqual([c.value for c in first[1]], EXPECTED_HEADERS_V2)
        self.assertEqual(first.max_row, 1, 'the data sheet carries headers only')
        self.assertGreaterEqual(len(book.worksheets), 2)       # a "how to fill this in" sheet

    def test_only_staff_download_the_registry_template(self):
        citizen = get_user_model().objects.create_user(username='tpl-citizen', password='pw', role='CITIZEN', email='tplc@x.test')
        self.client.force_authenticate(citizen)
        self.assertEqual(self.client.get('/api/farmers/rsbsa-import/template/').status_code, 403)


class EveryImportHasATemplateTests(APITestCase):
    # `X/import/` needs `X/import/template/`; these imports have their template under a different route.
    SPECIAL = {
        'api/farmers/<int:farmer_id>/parcels/import/': 'api/farmers/parcels/import/template/',
        'api/farmers/rsbsa-import/preview/': 'api/farmers/rsbsa-import/template/',
        'api/farmers/parcel-crops/parse/': 'api/farmers/parcel-crops/template/',
    }

    def test_every_import_route_has_a_template_route(self):
        routes = set(_routes())
        imports = [r for r in routes if r.endswith('import/') and not r.endswith('/template/')] + [r for r in self.SPECIAL if r in routes]
        self.assertGreaterEqual(len(imports), 11, 'the route scan found too few imports; the guard would pass for the wrong reason')
        missing = []
        for route in sorted(set(imports)):
            wanted = self.SPECIAL.get(route, route + 'template/')
            if wanted not in routes:
                missing.append(f'{route} -> {wanted}')
        self.assertEqual(missing, [], 'Every import needs a template download route. Missing: ' + '; '.join(missing))
