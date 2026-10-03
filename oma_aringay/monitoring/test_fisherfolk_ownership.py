"""Fisherfolk accounts reuse the Admin Fisheries pages; the backend must limit them to their OWN records.

Pablo (fisherfolk A) and Joshua (fisherfolk B) each own a production cycle (with its stocking record,
units, feeding/health logs, harvest, disaster report, catch log and assistance). Pablo must only ever
receive Pablo's data - in lists, details, nested endpoints, creates and updates - while Admin keeps
seeing everything. Staff-governance actions (deletes, bulk import) stay staff-only.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from associations.models import FisherfolkOrganization, FisherfolkOrganizationMember
from fisheries.models import (
    Fisherfolk, FisheriesDisasterReport, FisheriesHarvestRecord, FishingTripLog, SpeciesCategory,
    SpeciesOption, StockingRecord,
)
from interventions.models import FisherfolkBeneficiaryRecord
from monitoring.models import AquacultureFeedingLog, AquacultureHealthLog, AquacultureProductionUnit

CYCLES = '/api/monitoring/aquaculture-cycles/'
STOCKING = '/api/fisheries/stocking/'


def _citizen(username, record_type, record_id):
    user = get_user_model().objects.create_user(username=username, password='pw', role='CITIZEN')
    UserLinkedRecord.objects.create(user=user, record_type=record_type, record_id=record_id, is_active=True)
    return user


class FisherfolkOwnershipTests(APITestCase):

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='admin1', password='pw', role='ADMIN')
        cls.evaluator = User.objects.create_user(username='eval1', password='pw', role='EVALUATOR')
        make = lambda n: Fisherfolk.objects.create(
            first_name=n, last_name='Test', gender='Male', birthdate=date(1990, 1, 1),
            barangay='Poblacion', fisherfolk_type='Aquaculture',
        )
        cls.ff_a, cls.ff_b = make('Pablo'), make('Joshua')
        cls.pablo = _citizen('pablo', 'FISHERFOLK', cls.ff_a.id)
        cls.joshua = _citizen('joshua', 'FISHERFOLK', cls.ff_b.id)
        # A FARMER-linked citizen whose linked id happens to equal Joshua's fisherfolk id.
        cls.farmer_collision = _citizen('farmer1', 'FARMER', cls.ff_b.id)
        cls.unlinked = get_user_model().objects.create_user(username='nolink', password='pw', role='CITIZEN')
        org = lambda n: FisherfolkOrganization.objects.create(
            name=n, barangay='Poblacion', contact_person='X', contact_number='1', registration_number=n,
        )
        cls.org_a, cls.org_b = org('OrgA'), org('OrgB')
        FisherfolkOrganizationMember.objects.create(organization=cls.org_a, fisherfolk=cls.ff_a, date_joined=date(2020, 1, 1))
        FisherfolkOrganizationMember.objects.create(organization=cls.org_b, fisherfolk=cls.ff_b, date_joined=date(2020, 1, 1))
        cat, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        cls.species, _ = SpeciesOption.objects.get_or_create(
            species_name='Tilapia', defaults=dict(
                category=cat, culture_environment='Freshwater', culture_duration_days=120,
                default_survival_rate_pct=80, default_avg_body_weight_kg=0.25,
            ),
        )

    def setUp(self):
        # Records for both fisherfolk, created by Admin through the same API the Admin pages use.
        self.client.force_authenticate(self.admin)
        self.cycle_a = self._cycle(self.ff_a, self.org_a)
        self.cycle_b = self._cycle(self.ff_b, self.org_b)
        self.rec_a = StockingRecord.objects.get(production_cycle_id=self.cycle_a)
        self.rec_b = StockingRecord.objects.get(production_cycle_id=self.cycle_b)
        self.units_a = list(AquacultureProductionUnit.objects.filter(production_cycle_id=self.cycle_a).order_by('unit_number'))
        self.units_b = list(AquacultureProductionUnit.objects.filter(production_cycle_id=self.cycle_b).order_by('unit_number'))
        today = date.today()
        self.feed_b = AquacultureFeedingLog.objects.create(production_cycle_id=self.cycle_b, feeding_date=today, feed_type='Pellets', quantity_kg=Decimal('5'))
        self.health_b = AquacultureHealthLog.objects.create(production_cycle_id=self.cycle_b, production_unit=self.units_b[0],
                                                            log_date=today, observation='Fin Rot', mortality_count=0)
        self.harvest_b = FisheriesHarvestRecord.objects.create(stocking_record=self.rec_b, harvest_date=today, quantity_kg=Decimal('5'))
        self.disaster_a = FisheriesDisasterReport.objects.create(fisherfolk=self.ff_a, disaster_type='Flood', date_of_occurrence=today)
        self.disaster_b = FisheriesDisasterReport.objects.create(fisherfolk=self.ff_b, disaster_type='Flood', date_of_occurrence=today)
        self.trip_a = FishingTripLog.objects.create(fisherfolk=self.ff_a, trip_date=today, fishing_ground='Bay', gear_used='Net')
        self.trip_b = FishingTripLog.objects.create(fisherfolk=self.ff_b, trip_date=today, fishing_ground='Bay', gear_used='Net')
        self.aid_a = FisherfolkBeneficiaryRecord.objects.create(fisherfolk=self.ff_a, date_given=today)
        self.aid_b = FisherfolkBeneficiaryRecord.objects.create(fisherfolk=self.ff_b, date_given=today)

    def _cycle(self, ff, org, **over):
        data = {
            'fisherfolk': ff.id, 'organization': org.id, 'cycle_name': 'Grow-out Phase', 'species_farmed': 'Tilapia',
            'species_option': self.species.id, 'culture_system': 'Fishpond',
            'pond_location_barangay': 'Poblacion', 'water_source': 'River',
            'stocking_date': str(date.today() - timedelta(days=1)),
            'units': [{'length_m': 4, 'width_m': 2, 'fingerling_count': 20},
                      {'length_m': 5, 'width_m': 2, 'fingerling_count': 30}],
        }
        data.update(over)
        r = self.client.post(CYCLES, data, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        return r.data['id']

    def rows(self, url, params=None):
        r = self.client.get(url, params or {})
        self.assertEqual(r.status_code, 200, (url, r.data))
        return r.data['results'] if isinstance(r.data, dict) and 'results' in r.data else r.data

    def as_user(self, user):
        self.client.force_authenticate(user)

    # --- 1. Lists: own records only (and Admin/Evaluator still see everything)
    def test_fisherfolk_lists_contain_only_their_own_records(self):
        self.as_user(self.pablo)
        self.assertEqual({c['id'] for c in self.rows(CYCLES)}, {self.cycle_a})
        self.assertEqual({s['id'] for s in self.rows(STOCKING, {'status': 'Stocked,Near Harvest,Harvested'})}, {self.rec_a.id})
        self.assertEqual({s['id'] for s in self.rows(f'{STOCKING}history/')}, {self.rec_a.id})
        self.assertEqual({d['id'] for d in self.rows('/api/monitoring/fisherfolk-disasters/')}, {self.disaster_a.id})
        self.assertEqual({t['id'] for t in self.rows('/api/fisheries/fishing-trips/')}, {self.trip_a.id})
        self.assertEqual({a['id'] for a in self.rows('/api/interventions/fisherfolk-beneficiaries/adhoc/')}, {self.aid_a.id})
        self.assertEqual({f['id'] for f in self.rows('/api/fisheries/fisherfolk/')}, {self.ff_a.id})
        # a filter naming another fisherfolk never widens the scope
        self.assertEqual(self.rows(CYCLES, {'fisherfolk': self.ff_b.id}), [])
        self.assertEqual(self.rows('/api/fisheries/fishing-trips/', {'fisherfolk': self.ff_b.id}), [])
        orgs = self.rows('/api/organizations/fisherfolk/', {'fisherfolk': self.ff_b.id})
        self.assertEqual([o['name'] for o in orgs], ['OrgA'])                       # own memberships only
        summary = self.client.get('/api/fisheries/fishing-trips/summary/').data
        self.assertEqual(summary['totals']['trip_count'], 1)                        # aggregates own trips only

    def test_joshua_sees_only_joshuas_records(self):
        self.as_user(self.joshua)
        self.assertEqual({c['id'] for c in self.rows(CYCLES)}, {self.cycle_b})
        self.assertEqual({d['id'] for d in self.rows('/api/monitoring/fisherfolk-disasters/')}, {self.disaster_b.id})
        self.assertEqual({a['id'] for a in self.rows('/api/interventions/fisherfolk-beneficiaries/adhoc/')}, {self.aid_b.id})

    def test_admin_and_evaluator_still_see_every_record(self):
        for user in (self.admin, self.evaluator):
            self.as_user(user)
            self.assertTrue({self.cycle_a, self.cycle_b} <= {c['id'] for c in self.rows(CYCLES)})
            self.assertTrue({self.rec_a.id, self.rec_b.id} <= {s['id'] for s in self.rows(STOCKING, {'status': 'Stocked,Near Harvest,Harvested'})})
            self.assertTrue({self.disaster_a.id, self.disaster_b.id} <= {d['id'] for d in self.rows('/api/monitoring/fisherfolk-disasters/')})
            self.assertTrue({self.trip_a.id, self.trip_b.id} <= {t['id'] for t in self.rows('/api/fisheries/fishing-trips/')})
            self.assertTrue({self.aid_a.id, self.aid_b.id} <= {a['id'] for a in self.rows('/api/interventions/fisherfolk-beneficiaries/adhoc/')})
            self.assertEqual(self.client.get(f'{CYCLES}{self.cycle_b}/').status_code, 200)
            self.assertEqual(self.client.get(f'{STOCKING}{self.rec_b.id}/variance-details/').status_code, 200)

    # --- 2. Direct ids / nested endpoints: never another fisherfolk's data (IDOR)
    def test_direct_and_nested_access_to_another_fisherfolks_records_is_denied(self):
        self.as_user(self.pablo)
        denied = [
            ('get', f'{CYCLES}{self.cycle_b}/', None),
            ('patch', f'{CYCLES}{self.cycle_b}/', {'notes': 'x'}),
            ('get', f'{CYCLES}{self.cycle_b}/feeding/', None),
            ('post', f'{CYCLES}{self.cycle_b}/feeding/', {'feeding_date': str(date.today()), 'feed_type': 'Pellets', 'quantity_kg': '1'}),
            ('get', f'{CYCLES}{self.cycle_b}/health/', None),
            ('post', f'{CYCLES}{self.cycle_b}/health/', {'log_date': str(date.today()), 'unit_logs': [
                {'production_unit': self.units_b[1].id, 'observation': 'Fin Rot', 'mortality_count': 0}]}),
            ('get', f'{CYCLES}{self.cycle_b}/inputs/', None),
            ('delete', f'{CYCLES}feeding/{self.feed_b.id}/', None),
            ('delete', f'{CYCLES}health/{self.health_b.id}/', None),
            ('get', f'{STOCKING}{self.rec_b.id}/', None),
            ('patch', f'{STOCKING}{self.rec_b.id}/', {'notes': 'x'}),
            ('get', f'{STOCKING}{self.rec_b.id}/variance-details/', None),
            ('get', f'{STOCKING}{self.rec_b.id}/harvests/', None),
            ('post', f'{STOCKING}{self.rec_b.id}/harvests/', {'harvest_date': str(date.today()), 'quantity_kg': '1'}),
            ('get', f'{STOCKING}harvests/{self.harvest_b.id}/detail/', None),
            ('get', f'{STOCKING}{self.rec_b.id}/logs/', None),
            ('get', f'{STOCKING}{self.rec_b.id}/disasters/', None),
            ('get', f'/api/monitoring/fisherfolk-disasters/{self.disaster_b.id}/', None),
            ('patch', f'/api/monitoring/fisherfolk-disasters/{self.disaster_b.id}/', {'description': 'x'}),
            ('get', f'/api/fisheries/fishing-trips/{self.trip_b.id}/', None),
            ('patch', f'/api/fisheries/fishing-trips/{self.trip_b.id}/', {'gear_used': 'x'}),
            ('get', f'/api/fisheries/fishing-trips/{self.trip_b.id}/species/', None),
            ('post', f'/api/interventions/fisherfolk-beneficiaries/{self.aid_b.id}/confirm-received/', {}),
        ]
        for method, url, body in denied:
            r = getattr(self.client, method)(url, body, format='json') if body is not None else getattr(self.client, method)(url)
            self.assertIn(r.status_code, (403, 404), (method, url, r.status_code))
            self.assertNotIn('Joshua', str(getattr(r, 'data', '')), (method, url))
        # nothing of Joshua's was changed or removed
        self.assertTrue(AquacultureFeedingLog.objects.filter(pk=self.feed_b.pk).exists())
        self.assertTrue(AquacultureHealthLog.objects.filter(pk=self.health_b.pk).exists())
        self.assertEqual(AquacultureFeedingLog.objects.filter(production_cycle_id=self.cycle_b).count(), 1)
        self.assertEqual(FisheriesHarvestRecord.objects.filter(stocking_record=self.rec_b).count(), 1)

    def test_citizen_of_another_domain_or_without_a_link_is_rejected(self):
        for user in (self.farmer_collision, self.unlinked):
            self.as_user(user)
            self.assertEqual(self.client.get(CYCLES).status_code, 403)
            self.assertEqual(self.client.get(f'{STOCKING}{self.rec_b.id}/harvests/').status_code, 403)
            self.assertEqual(self.client.get(f'{STOCKING}{self.rec_b.id}/logs/').status_code, 403)
            self.assertEqual(self.client.get('/api/monitoring/fisherfolk-disasters/').status_code, 403)

    # --- 3. Creates / updates are always the fisherfolk's own
    def test_creates_and_updates_are_forced_onto_the_fisherfolks_own_record(self):
        self.as_user(self.pablo)
        new_cycle = self._cycle(self.ff_b, self.org_a)                               # names Joshua...
        self.assertEqual(self.client.get(f'{CYCLES}{new_cycle}/').data['fisherfolk'], self.ff_a.id)   # ...stored as Pablo
        r = self.client.post(CYCLES, {**self._cycle_payload(), 'fisherfolk': self.ff_b.id, 'organization': self.org_b.id}, format='json')
        self.assertEqual(r.status_code, 400)                                         # Joshua's organization is not Pablo's
        d = self.client.post('/api/monitoring/fisherfolk-disasters/', {'fisherfolk': self.ff_b.id, 'disaster_type': 'Flood',
                                                                       'date_of_occurrence': str(date.today())}, format='json')
        self.assertEqual((d.status_code, d.data['fisherfolk']), (201, self.ff_a.id))
        t = self.client.post('/api/fisheries/fishing-trips/', {'fisherfolk': self.ff_b.id, 'trip_date': str(date.today()),
                                                               'fishing_ground': 'Bay', 'gear_used': 'Net'}, format='json')
        self.assertEqual((t.status_code, t.data['fisherfolk']), (201, self.ff_a.id))
        p = self.client.patch(f'{CYCLES}{self.cycle_a}/', {'fisherfolk': self.ff_b.id}, format='json')
        self.assertEqual((p.status_code, p.data['fisherfolk']), (200, self.ff_a.id))
        s = self.client.patch(f'{STOCKING}{self.rec_a.id}/', {'fisherfolk': self.ff_b.id, 'notes': 'mine'}, format='json')
        self.assertEqual(s.status_code, 200, s.data)
        self.rec_a.refresh_from_db()
        self.assertEqual((self.rec_a.fisherfolk_id, self.rec_a.notes), (self.ff_a.id, 'mine'))
        dp = self.client.patch(f'/api/monitoring/fisherfolk-disasters/{self.disaster_a.id}/', {'fisherfolk': self.ff_b.id}, format='json')
        self.assertEqual((dp.status_code, dp.data['fisherfolk']), (200, self.ff_a.id))

    def _cycle_payload(self):
        return {
            'cycle_name': 'Grow-out Phase', 'species_farmed': 'Tilapia', 'species_option': self.species.id,
            'culture_system': 'Fishpond', 'pond_location_barangay': 'Poblacion', 'water_source': 'River',
            'stocking_date': str(date.today() - timedelta(days=1)),
            'units': [{'length_m': 4, 'width_m': 2, 'fingerling_count': 20}],
        }

    # --- 4. The full Admin workflow works on their own records
    def test_fisherfolk_can_use_the_full_workflow_on_their_own_cycle(self):
        self.as_user(self.pablo)
        self.assertEqual(self.client.get(f'{CYCLES}{self.cycle_a}/').status_code, 200)
        self.assertEqual(self.client.get('/api/fisheries/species/').status_code, 200)
        self.assertEqual(self.client.get(f'{CYCLES}estimate-harvest/', {'species': self.species.id, 'fingerlings': 100}).status_code, 200)
        f = self.client.post(f'{CYCLES}{self.cycle_a}/feeding/', {'feeding_date': str(date.today()), 'feed_type': 'Pellets',
                             'unit_quantities': [{'production_unit': self.units_a[0].id, 'quantity_kg': '2.5'}]}, format='json')
        self.assertEqual(f.status_code, 201, f.data)
        bad_unit = self.client.post(f'{CYCLES}{self.cycle_a}/feeding/', {'feeding_date': str(date.today()), 'feed_type': 'Pellets',
                                    'unit_quantities': [{'production_unit': self.units_b[0].id, 'quantity_kg': '1'}]}, format='json')
        self.assertEqual(bad_unit.status_code, 400)                                  # Joshua's pond can't be used
        h = self.client.post(f'{CYCLES}{self.cycle_a}/health/', {'log_date': str(date.today()), 'unit_logs': [
            {'production_unit': self.units_a[0].id, 'observation': 'Bacterial Infection', 'mortality_count': 0}]}, format='json')
        self.assertEqual(h.status_code, 201, h.data)
        harvest = self.client.post(f'{STOCKING}{self.rec_a.id}/harvests/', {'harvest_date': str(date.today()),
                                   'unit_quantities': [{'production_unit': self.units_a[0].id, 'quantity_kg': '12.50'}]}, format='json')
        self.assertEqual(harvest.status_code, 201, harvest.data)                     # Force Harvest of own pond
        self.assertIs(harvest.data['is_force_harvest'], True)
        v = self.client.get(f'{STOCKING}{self.rec_a.id}/variance-details/')
        self.assertEqual(v.status_code, 200)
        self.assertEqual({u['id'] for u in v.data['production_units']}, {u.id for u in self.units_a})
        self.assertTrue(all(l['production_unit'] in {u.id for u in self.units_a} for l in v.data['health_logs']))
        self.assertEqual(self.client.get('/api/fisheries/yield-analysis/summary/').status_code, 200)
        self.assertEqual(self.client.delete(f'{CYCLES}feeding/{f.data["id"]}/').status_code, 204)   # own log

    # --- 5. Staff governance stays staff-only
    def test_governance_actions_stay_staff_only(self):
        self.as_user(self.pablo)
        self.assertEqual(self.client.delete(f'{CYCLES}{self.cycle_a}/').status_code, 403)
        self.assertEqual(self.client.delete(f'{STOCKING}{self.rec_a.id}/').status_code, 403)
        self.assertEqual(self.client.delete(f'/api/monitoring/fisherfolk-disasters/{self.disaster_a.id}/').status_code, 403)
        self.assertEqual(self.client.delete(f'/api/fisheries/fishing-trips/{self.trip_a.id}/').status_code, 403)
        self.assertEqual(self.client.post(STOCKING, {}, format='json').status_code, 403)
        self.assertEqual(self.client.get(f'{STOCKING}forecasting/template/').status_code, 403)
        self.assertEqual(self.client.post('/api/fisheries/species/', {'species_name': 'X'}, format='json').status_code, 403)
        self.assertEqual(self.client.post('/api/interventions/fisherfolk-beneficiaries/adhoc/', {'fisherfolk': self.ff_a.id,
                         'date_given': str(date.today())}, format='json').status_code, 403)
        self.assertTrue(StockingRecord.objects.filter(pk=self.rec_a.pk).exists())


import io
import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

_MEDIA = tempfile.mkdtemp(prefix='oma_test_media_')


def _png(name='damage.png'):
    from PIL import Image
    buf = io.BytesIO()
    Image.new('RGB', (4, 4), (200, 30, 30)).save(buf, format='PNG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/png')


@override_settings(MEDIA_ROOT=_MEDIA)
class DisasterDamagePhotoTests(FisherfolkOwnershipTests):
    """Photo Documentation of Damage on the general (fisherfolk) disaster report: optional, 0-10 photos,
    each stored as its own FisheriesDisasterReportPhoto on the report being created - which is always the
    logged-in fisherfolk's own."""
    URL = '/api/monitoring/fisherfolk-disasters/'

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(_MEDIA, ignore_errors=True)

    def report(self, n_photos, **extra):
        body = {'fisherfolk': self.ff_b.id, 'disaster_type': 'Flooding', 'date_of_occurrence': str(date.today()),
                'estimated_damage': 'Dike breached', 'equipment_damaged': 'Fishpond Dike, Water Pump'}
        body.update(extra)
        body['photos'] = [_png(f'p{i}.png') for i in range(n_photos)]
        return self.client.post(self.URL, body, format='multipart')

    def test_zero_to_ten_photos_are_accepted_and_each_is_stored(self):
        from fisheries.models import FisheriesDisasterReportPhoto
        self.as_user(self.pablo)
        for n in (0, 1, 5, 10):
            r = self.report(n)
            self.assertEqual(r.status_code, 201, (n, r.data))
            self.assertEqual(r.data['fisherfolk'], self.ff_a.id)                     # forced to Pablo
            self.assertEqual(len(r.data['photos']), n)
            stored = FisheriesDisasterReportPhoto.objects.filter(disaster_report_id=r.data['id'])
            self.assertEqual(stored.count(), n)
            self.assertEqual(len({p.image.name for p in stored}), n)                 # n separate files

    def test_eleven_photos_are_rejected_and_nothing_is_saved(self):
        from fisheries.models import FisheriesDisasterReport, FisheriesDisasterReportPhoto
        self.as_user(self.pablo)
        before = FisheriesDisasterReport.objects.count()
        r = self.report(11)
        self.assertEqual(r.status_code, 400)
        self.assertIn('Maximum of 10 photos', str(r.data['photos']))
        self.assertEqual(FisheriesDisasterReport.objects.count(), before)
        self.assertEqual(FisheriesDisasterReportPhoto.objects.count(), 0)

    def test_a_non_image_photo_is_rejected_and_nothing_is_saved(self):
        from fisheries.models import FisheriesDisasterReport
        self.as_user(self.pablo)
        before = FisheriesDisasterReport.objects.count()
        body = {'disaster_type': 'Flooding', 'date_of_occurrence': str(date.today()),
                'photos': [_png(), SimpleUploadedFile('notes.txt', b'not an image', content_type='text/plain')]}
        r = self.client.post(self.URL, body, format='multipart')
        self.assertEqual(r.status_code, 400)
        self.assertIn('photos', r.data)
        self.assertEqual(FisheriesDisasterReport.objects.count(), before)

    def test_photos_are_only_visible_through_the_owners_report(self):
        self.as_user(self.joshua)
        r = self.report(2)
        self.assertEqual((r.status_code, r.data['fisherfolk']), (201, self.ff_b.id))
        self.as_user(self.pablo)                                                      # another fisherfolk
        self.assertEqual(self.client.get(f"{self.URL}{r.data['id']}/").status_code, 404)
        self.assertNotIn(r.data['id'], {d['id'] for d in self.rows(self.URL)})
        self.as_user(self.admin)                                                      # staff see them
        self.assertEqual(len(self.client.get(f"{self.URL}{r.data['id']}/").data['photos']), 2)
