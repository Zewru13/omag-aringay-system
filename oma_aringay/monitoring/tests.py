import itertools
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from associations.models import FisherfolkOrganization, FisherfolkOrganizationMember
from fisheries.models import Fisherfolk, SpeciesCategory, SpeciesOption, StockingRecord
from monitoring.models import AquacultureProductionCycle


_RSBSA = itertools.count(900001)


def _rsbsa():
    """A unique, well-formed RSBSA number: every fisherfolk now needs one."""
    return '01-033-02-019-%06d' % next(_RSBSA)


class ProductionCycleBase(APITestCase):
    """Shared data and helpers for the production cycle tests. It holds no tests itself, so the
    classes that inherit it get the setup without re-running each other's tests."""
    CYCLES = '/api/monitoring/aquaculture-cycles/'
    ORGS = '/api/organizations/fisherfolk/'

    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(username='admin1', password='pw', role='ADMIN', email='admin1@x.test')
        make = lambda n: Fisherfolk.objects.create(
            first_name=n, last_name='Test', gender='Male', birthdate=date(1990, 1, 1),
            barangay='Poblacion', fisherfolk_type='Aquaculture', rsbsa_number=_rsbsa(),
        )
        cls.ff_a, cls.ff_b, cls.ff_none = make('Ann'), make('Ben'), make('Cy')
        org = lambda n: FisherfolkOrganization.objects.create(
            name=n, barangay='Poblacion', contact_person='X', contact_number='1', registration_number=n,
        )
        cls.org_a, cls.org_a2, cls.org_b, cls.org_inactive = org('OrgA'), org('OrgA2'), org('OrgB'), org('OrgInactive')
        join = lambda o, f, **kw: FisherfolkOrganizationMember.objects.create(organization=o, fisherfolk=f, date_joined=date(2020, 1, 1), **kw)
        join(cls.org_a, cls.ff_a); join(cls.org_a2, cls.ff_a); join(cls.org_b, cls.ff_b)
        join(cls.org_inactive, cls.ff_a, is_active=False)
        cat, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        cls.species, _ = SpeciesOption.objects.get_or_create(
            species_name='Tilapia', defaults=dict(
                category=cat, culture_environment='Freshwater', culture_duration_days=120,
                default_survival_rate_pct=80, default_avg_body_weight_kg=0.25,
            ),
        )

    def setUp(self):
        self.client.force_authenticate(self.user)

    def payload(self, **over):
        data = {
            'fisherfolk': self.ff_a.id, 'cycle_name': 'Grow-out Phase', 'species_farmed': 'Tilapia',
            'species_option': self.species.id, 'culture_system': 'Fishpond',
            'pond_location_barangay': 'Poblacion', 'water_source': 'River',
            'stocking_date': str(date.today() - timedelta(days=1)),
            'units': [{'length_m': 4, 'width_m': 2, 'fingerling_count': 20},
                      {'length_m': 5, 'width_m': 2, 'fingerling_count': 30}],
        }
        data.update(over)
        return data

    def post(self, **over):
        return self.client.post(self.CYCLES, self.payload(**over), format='json')

    # --- organization list (existing endpoint, new fisherfolk filter)
    def names(self, fisherfolk_id):
        r = self.client.get(self.ORGS, {'fisherfolk': fisherfolk_id})
        self.assertEqual(r.status_code, 200)
        rows = r.data['results'] if isinstance(r.data, dict) else r.data
        return sorted(o['name'] for o in rows)

    # --- Estimated Harvest Biomass (shared existing formula)
    def expected(self, n, species=None):
        s = species or self.species
        return (Decimal(n) * s.default_survival_rate_pct / 100 * s.default_avg_body_weight_kg).quantize(Decimal('0.01'))

    def units(self, *counts):
        return [{'length_m': 4, 'width_m': 1, 'fingerling_count': c} for c in counts]

    # --- Feeding Log: per pond/cage quantities (View Cycle > Feeding Log > Log Feeding)
    def feeding(self, cycle_id, **body):
        base = {'feeding_date': str(date.today()), 'feed_type': 'Pellets'}
        base.update(body)
        return self.client.post(f'{self.CYCLES}{cycle_id}/feeding/', base, format='json')

    def legacy_cycle_without_units(self):
        """An older Fishpen cycle (no ponds/cages). New cycles are Fishpond/Fishcage only, so this legacy
        data is created directly, the way it already exists in the database."""
        cycle = AquacultureProductionCycle.objects.create(
            fisherfolk=self.ff_a, cycle_name='Grow-out Phase', species_farmed='Tilapia', culture_system='Fishpen',
            stocking_date=date.today() - timedelta(days=1), stocking_count=100)
        return {'id': cycle.id, 'units': []}

    # --- Health Log: Force Harvest defaults to YES for fish mortality / disease
    def unit_ids(self, cycle_id):
        from monitoring.models import AquacultureProductionUnit
        return list(AquacultureProductionUnit.objects.filter(production_cycle_id=cycle_id).values_list('id', flat=True))

    def health(self, cycle_id, **body):
        from monitoring.models import AquacultureHealthLog
        base = {'log_date': str(date.today()), 'observation': 'Fish Mortality', 'mortality_count': 5}
        ids = self.unit_ids(cycle_id)
        if ids and 'production_unit' not in body:
            # The affected pond/cage is required when the cycle has units; default to the first one that
            # has no Health Log yet (a unit cannot be reported twice in a cycle).
            reported = set(AquacultureHealthLog.objects.filter(production_cycle_id=cycle_id).values_list('production_unit_id', flat=True))
            base['production_unit'] = next((i for i in ids if i not in reported), ids[0])
        base.update({k: v for k, v in body.items() if not (k == 'production_unit' and v is Ellipsis)})
        if base.get('production_unit') is Ellipsis:
            base.pop('production_unit')
        return self.client.post(f'{self.CYCLES}{cycle_id}/health/', base, format='json')

    # --- Health Log: affected pond/cage (unit-specific record and Force Harvest)
    def unit_status(self, cycle_id):
        """{unit_id: True/False} - Force Harvest per pond/cage, derived from that unit's own logs."""
        logs = self.client.get(f'{self.CYCLES}{cycle_id}/health/').data
        return {uid: any(l['force_harvest'] for l in logs if l['production_unit'] == uid) for uid in self.unit_ids(cycle_id)}

    # --- Fisheries Monitoring: Harvest button data + Record Harvest workflow (force harvest, duplicates)
    STOCKING = '/api/fisheries/stocking/'

    def stocking_row(self, cycle_id):
        rec = StockingRecord.objects.get(production_cycle_id=cycle_id)
        return rec, self.client.get(f'{self.STOCKING}{rec.id}/').data

    def harvest(self, rec, **body):
        base = {'harvest_date': str(date.today()), 'quantity_kg': '125.50', 'is_final': True, 'early_late_reason': 'Emergency harvest — disaster damage'}
        base.update(body)
        return self.client.post(f'{self.STOCKING}{rec.id}/harvests/', base, format='json')

    # --- Unit-aware Force Harvest: ONE harvest record, only the affected ponds/cages, ONE total kg
    def force_cycle(self, n=3):
        cid = self.post(units=self.units(*([10] * n))).data['id']
        return cid, self.unit_ids(cid), StockingRecord.objects.get(production_cycle_id=cid)

    def unit_harvest(self, rec, unit_ids, kg, **extra):
        body = {'harvest_date': str(date.today()), 'quantity_kg': kg, 'production_units': unit_ids}
        body.update(extra)
        return self.client.post(f'{self.STOCKING}{rec.id}/harvests/', body, format='json')

    def per_unit_harvest(self, rec, kg_by_unit, **extra):
        """Per-unit actual kg: {unit_id: kg}. No combined quantity_kg is sent."""
        body = {'harvest_date': str(date.today()),
                'unit_quantities': [{'production_unit': uid, 'quantity_kg': kg} for uid, kg in kg_by_unit.items()]}
        body.update(extra)
        return self.client.post(f'{self.STOCKING}{rec.id}/harvests/', body, format='json')

    def units_state(self, rec):
        return {u['label']: (u['force_harvest'], u['harvested']) for u in self.client.get(f'{self.STOCKING}{rec.id}/').data['harvest_units']}

    # --- Normal harvest of selected units (is_force_harvest=False) alongside Force Harvest (True)
    def past_half(self, rec):
        # Past the 50% rule and harvested ON TIME (expected = today), so no early/late reason is involved.
        StockingRecord.objects.filter(pk=rec.pk).update(
            date_stocked=date.today() - timedelta(days=100), expected_harvest_date=date.today())


class ProductionCycleOrganizationTests(ProductionCycleBase):

    def test_org_list_only_shows_the_fisherfolks_active_organizations(self):
        self.assertEqual(self.names(self.ff_a.id), ['OrgA', 'OrgA2'])   # inactive membership excluded
        self.assertEqual(self.names(self.ff_b.id), ['OrgB'])
        self.assertEqual(self.names(self.ff_none.id), [])
        self.assertEqual(self.names('abc'), [])
        # unfiltered behaviour is unchanged: every organization
        r = self.client.get(self.ORGS)
        self.assertEqual(r.data['count'], FisherfolkOrganization.objects.count())

    # --- create
    def test_create_with_organization_stores_id(self):
        r = self.post(organization=self.org_a.id)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['organization'], self.org_a.id)
        self.assertEqual(r.data['organization_name'], 'OrgA')
        self.assertEqual(AquacultureProductionCycle.objects.get(pk=r.data['id']).organization_id, self.org_a.id)
        detail = self.client.get(f"{self.CYCLES}{r.data['id']}/")
        self.assertEqual(detail.data['organization_name'], 'OrgA')

    def test_create_without_organization(self):
        for extra in ({}, {'organization': None}):
            r = self.post(**extra)
            self.assertEqual(r.status_code, 201, r.data)
            self.assertIsNone(r.data['organization'])
            self.assertIsNone(r.data['organization_name'])

    def test_fisherfolk_with_no_organizations_can_still_create(self):
        r = self.post(fisherfolk=self.ff_none.id)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertIsNone(r.data['organization'])

    def test_organization_of_another_fisherfolk_is_rejected(self):
        r = self.post(organization=self.org_b.id)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['organization'][0], 'Selected organization is not registered to this fisherfolk.')
        self.assertFalse(AquacultureProductionCycle.objects.exists())
        self.assertFalse(StockingRecord.objects.exists())

    def test_inactive_membership_and_fisherfolk_without_membership_rejected(self):
        self.assertEqual(self.post(organization=self.org_inactive.id).status_code, 400)
        self.assertEqual(self.post(fisherfolk=self.ff_none.id, organization=self.org_a.id).status_code, 400)
        self.assertEqual(self.post(organization=999999).status_code, 400)
        self.assertFalse(AquacultureProductionCycle.objects.exists())

    def test_patch_cannot_attach_a_foreign_organization(self):
        cid = self.post().data['id']
        self.assertEqual(self.client.patch(f'{self.CYCLES}{cid}/', {'organization': self.org_b.id}, format='json').status_code, 400)
        r = self.client.patch(f'{self.CYCLES}{cid}/', {'organization': self.org_a2.id}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['organization_name'], 'OrgA2')

    # --- existing behaviour must be unchanged
    def test_existing_flow_units_stocking_record_estimate_target_date_logs(self):
        target = str(date.today() + timedelta(days=100))
        r = self.post(organization=self.org_a.id, target_harvest_date=target)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['target_harvest_date'], target)
        self.assertEqual([u['size_sqm'] for u in r.data['units']], ['8.00', '10.00'])   # length x width, server side
        self.assertEqual(r.data['stocking_count'], 50)
        self.assertEqual(Decimal(r.data['area_sqm']), Decimal('18.00'))
        rec = StockingRecord.objects.get(production_cycle_id=r.data['id'])
        self.assertEqual(rec.number_of_fingerlings, 50)
        self.assertEqual(rec.species_id, self.species.id)
        self.assertEqual(rec.fisherfolk_id, self.ff_a.id)
        self.assertEqual(rec.expected_harvest_date, rec.date_stocked + timedelta(days=120))
        expected = (Decimal(50) * self.species.default_survival_rate_pct / 100 * self.species.default_avg_body_weight_kg).quantize(Decimal('0.01'))
        self.assertEqual(rec.estimated_harvest_kg, expected)   # existing estimated_harvest_kg formula, untouched
        cid = r.data['id']
        self.assertEqual(self.client.post(f'{self.CYCLES}{cid}/feeding/', {'feeding_date': str(date.today()), 'feed_type': 'Pellets', 'quantity_kg': '2.5'}, format='json').status_code, 201)
        self.assertEqual(self.client.post(f'{self.CYCLES}{cid}/health/', {'log_date': str(date.today()), 'observation': 'Normal', 'production_unit': self.unit_ids(cid)[0]}, format='json').status_code, 201)
        d = self.client.get(f'{self.CYCLES}{cid}/').data
        self.assertEqual((len(d['feeding_logs']), len(d['health_logs'])), (1, 1))

    def test_biomass_one_pond_multiple_ponds_and_cages(self):
        for system, counts in (('Fishpond', (1000,)), ('Fishpond', (1000, 1500)), ('Fishcage', (500, 700, 600))):
            r = self.post(culture_system=system, units=self.units(*counts))
            self.assertEqual(r.status_code, 201, r.data)
            total = sum(counts)
            rec = StockingRecord.objects.get(production_cycle_id=r.data['id'])
            self.assertEqual(rec.number_of_fingerlings, total)                              # aggregated over all units
            self.assertEqual(Decimal(r.data['estimated_harvest_kg']), self.expected(total))  # cycle value
            self.assertEqual(rec.estimated_harvest_kg, self.expected(total))                 # linked record: same value

    def test_biomass_uses_the_existing_stocking_formula_and_species_data(self):
        r = self.post(units=self.units(20, 30))
        rec = StockingRecord.objects.get(production_cycle_id=r.data['id'])
        self.assertEqual(rec.survival_rate_pct, self.species.default_survival_rate_pct)      # from SpeciesOption, not invented
        self.assertEqual(rec.avg_body_weight_kg, self.species.default_avg_body_weight_kg)
        self.assertEqual(rec.estimated_harvest_kg, self.expected(50))
        # the preview endpoint agrees with the stored value
        p = self.client.get(f'{self.CYCLES}estimate-harvest/', {'species': self.species.id, 'fingerlings': 50})
        self.assertEqual(p.status_code, 200)
        self.assertEqual(Decimal(p.data['estimated_harvest_kg']), rec.estimated_harvest_kg)
        # a plain StockingRecord created the ordinary way gets the same number (one formula)
        plain = StockingRecord.objects.create(fisherfolk=self.ff_a, species=self.species, date_stocked=date.today(),
                                              number_of_fingerlings=50, season='Wet', year=date.today().year)
        self.assertEqual(plain.estimated_harvest_kg, rec.estimated_harvest_kg)

    def test_biomass_follows_fingerlings_and_species(self):
        est = lambda n, s: Decimal(self.client.get(f'{self.CYCLES}estimate-harvest/', {'species': s.id, 'fingerlings': n}).data['estimated_harvest_kg'])
        other = SpeciesOption.objects.create(
            species_name='Test Other Fish', category=self.species.category, culture_environment='Freshwater',
            culture_duration_days=90, default_survival_rate_pct=50, default_avg_body_weight_kg=1,
        )
        self.assertEqual(est(1000, self.species), self.expected(1000))
        self.assertEqual(est(1200, self.species), self.expected(1200))                        # more fingerlings -> new value
        self.assertEqual(est(1200, other), Decimal('600.00'))                                # other species -> its own data
        self.assertNotEqual(est(1200, other), est(1200, self.species))

    def test_client_cannot_submit_an_estimate(self):
        r = self.post(units=self.units(20, 30), estimated_harvest_kg='999999', estimated_kg='999999')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Decimal(r.data['estimated_harvest_kg']), self.expected(50))
        rec = StockingRecord.objects.get(production_cycle_id=r.data['id'])
        self.assertEqual(rec.estimated_harvest_kg, self.expected(50))
        p = self.client.patch(f"{self.CYCLES}{r.data['id']}/", {'estimated_harvest_kg': '1'}, format='json')
        self.assertEqual(Decimal(p.data['estimated_harvest_kg']), self.expected(50))

    def test_estimate_endpoint_rejects_bad_input(self):
        self.assertEqual(self.client.get(f'{self.CYCLES}estimate-harvest/', {'species': 'x', 'fingerlings': 5}).status_code, 400)
        self.assertEqual(self.client.get(f'{self.CYCLES}estimate-harvest/', {'species': 999999, 'fingerlings': 5}).status_code, 400)

    def test_feeding_per_pond_total_is_the_sum(self):
        cycle = self.post(units=self.units(10, 10, 10, 10, 10)).data
        ids = [u['id'] for u in cycle['units']]
        self.assertEqual(len(ids), 5)
        qty = ['2.50', '3.00', '2.80', '3.20', '2.50']
        r = self.feeding(cycle['id'], quantity_kg='999', unit_quantities=[
            {'production_unit': i, 'quantity_kg': q} for i, q in zip(ids, qty)], notes='morning')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Decimal(r.data['quantity_kg']), Decimal('14.00'))       # backend total; the client's 999 is ignored
        self.assertEqual([x['unit_label'] for x in r.data['unit_quantities']], [f'Pond {n}' for n in range(1, 6)])
        self.assertEqual([Decimal(x['quantity_kg']) for x in r.data['unit_quantities']], [Decimal(q) for q in qty])
        listed = self.client.get(f"{self.CYCLES}{cycle['id']}/feeding/").data
        self.assertEqual(len(listed), 1)
        self.assertEqual(Decimal(listed[0]['quantity_kg']), Decimal('14.00'))
        self.assertEqual(len(listed[0]['unit_quantities']), 5)
        detail = self.client.get(f"{self.CYCLES}{cycle['id']}/").data                 # nested in Cycle detail too
        self.assertEqual(len(detail['feeding_logs'][0]['unit_quantities']), 5)

    def test_feeding_per_cage_labels_and_zero_units(self):
        cycle = self.post(culture_system='Fishcage', units=self.units(10, 10, 10)).data
        ids = [u['id'] for u in cycle['units']]
        r = self.feeding(cycle['id'], unit_quantities=[
            {'production_unit': ids[0], 'quantity_kg': '1.5'}, {'production_unit': ids[1], 'quantity_kg': 0}, {'production_unit': ids[2], 'quantity_kg': '2'}])
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Decimal(r.data['quantity_kg']), Decimal('3.50'))
        self.assertEqual([x['unit_label'] for x in r.data['unit_quantities']], ['Cage 1', 'Cage 2', 'Cage 3'])

    def test_feeding_validation(self):
        a = self.post(units=self.units(10, 10)).data
        b = self.post(units=self.units(10, 10)).data
        a_ids, b_ids = [u['id'] for u in a['units']], [u['id'] for u in b['units']]
        bad = lambda rows: self.feeding(a['id'], unit_quantities=rows).status_code
        self.assertEqual(bad([{'production_unit': b_ids[0], 'quantity_kg': '1'}]), 400)                         # unit of another cycle
        self.assertEqual(bad([{'production_unit': a_ids[0], 'quantity_kg': '1'}, {'production_unit': a_ids[0], 'quantity_kg': '1'}]), 400)  # duplicate
        self.assertEqual(bad([{'production_unit': a_ids[0], 'quantity_kg': '-1'}, {'production_unit': a_ids[1], 'quantity_kg': '3'}]), 400)  # negative
        self.assertEqual(bad([{'production_unit': a_ids[0], 'quantity_kg': '0'}, {'production_unit': a_ids[1], 'quantity_kg': '0'}]), 400)   # total 0
        self.assertEqual(self.feeding(a['id']).status_code, 400)                                                # no quantity at all
        self.assertEqual(self.client.get(f"{self.CYCLES}{a['id']}/feeding/").data, [])

    def test_new_cycle_accepts_only_fishpond_or_fishcage_and_needs_a_fisherfolk(self):
        existing = AquacultureProductionCycle.objects.count()   # some test classes create cycles in setUp
        for system in ('Fishpen', 'Oyster', 'Mussel', 'Seaweed', 'Other'):
            r = self.post(culture_system=system, units=[], stocking_count=100)
            self.assertEqual(r.status_code, 400, system)
            self.assertIn('culture_system', r.data)
        payload = self.payload()
        payload.pop('fisherfolk')
        self.assertEqual(self.client.post(self.CYCLES, payload, format='json').status_code, 400)
        self.assertEqual(AquacultureProductionCycle.objects.count(), existing)          # nothing was created
        for system in ('Fishpond', 'Fishcage'):
            self.assertEqual(self.post(culture_system=system).status_code, 201, system)
        # an older Fishpen cycle stays readable and editable (its recorded system is kept)
        legacy = self.legacy_cycle_without_units()
        r = self.client.patch(f"{self.CYCLES}{legacy['id']}/", {'notes': 'still editable'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['culture_system'], 'Fishpen')

    def test_feeding_single_quantity_still_works(self):
        with_units = self.post(units=self.units(10, 10)).data
        no_units = self.legacy_cycle_without_units()
        for cid in (with_units['id'], no_units['id']):
            r = self.feeding(cid, quantity_kg='4.25')
            self.assertEqual(r.status_code, 201, r.data)
            self.assertEqual(Decimal(r.data['quantity_kg']), Decimal('4.25'))
            self.assertEqual(r.data['unit_quantities'], [])
        # deleting a per-unit log removes its rows too
        ids = [u['id'] for u in with_units['units']]
        log = self.feeding(with_units['id'], unit_quantities=[{'production_unit': ids[0], 'quantity_kg': '1'}]).data
        self.assertEqual(self.client.delete(f"{self.CYCLES}feeding/{log['id']}/").status_code, 204)
        from monitoring.models import AquacultureFeedingLogUnit
        self.assertEqual(AquacultureFeedingLogUnit.objects.count(), 0)

    def test_health_log_identifies_the_affected_pond_and_force_harvest_is_per_unit(self):
        cid = self.post(units=self.units(10, 10, 10)).data['id']
        p1, p2, p3 = self.unit_ids(cid)
        r = self.health(cid, production_unit=p2, mortality_count=10)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['production_unit'], r.data['unit_label'], r.data['observation'], r.data['mortality_count'], r.data['force_harvest']),
                         (p2, 'Pond 2', 'Fish Mortality', 10, True))
        self.assertEqual(r.data['production_cycle'], cid)
        self.assertEqual(self.unit_status(cid), {p1: False, p2: True, p3: False})     # only Pond 2
        # a disease in Pond 3: Pond 3 becomes Force Harvest, Pond 1 stays normal, Pond 2 keeps its own status
        d = self.health(cid, production_unit=p3, observation='Bacterial Infection', mortality_count=0)
        self.assertEqual(d.status_code, 201, d.data)
        self.assertEqual((d.data['unit_label'], d.data['force_harvest'], d.data['treatment_applied']), ('Pond 3', True, ''))
        self.assertEqual(self.unit_status(cid), {p1: False, p2: True, p3: True})
        # a non-disease observation in Pond 1 does not mark it, and does not change the others
        n = self.health(cid, production_unit=p1, observation='Feeding Issue', mortality_count=0, treatment_applied='Adjust Feeding Schedule')
        self.assertEqual((n.status_code, n.data['force_harvest'], n.data['unit_label']), (201, False, 'Pond 1'))
        self.assertEqual(self.unit_status(cid), {p1: False, p2: True, p3: True})
        # history carries the unit on every row, incl. the nested copy in the cycle payload
        history = self.client.get(f'{self.CYCLES}{cid}/health/').data
        self.assertEqual(sorted((h['unit_label'], h['observation']) for h in history),
                         [('Pond 1', 'Feeding Issue'), ('Pond 2', 'Fish Mortality'), ('Pond 3', 'Bacterial Infection')])
        nested = self.client.get(f'{self.CYCLES}{cid}/').data['health_logs']
        self.assertEqual(sorted(h['unit_label'] for h in nested), ['Pond 1', 'Pond 2', 'Pond 3'])

    def test_health_log_works_the_same_for_cages(self):
        cid = self.post(culture_system='Fishcage', units=self.units(10, 10, 10)).data['id']
        c1, c2, c3 = self.unit_ids(cid)
        r = self.health(cid, production_unit=c2, mortality_count=7)
        self.assertEqual((r.status_code, r.data['unit_label'], r.data['force_harvest']), (201, 'Cage 2', True))
        self.assertEqual(self.unit_status(cid), {c1: False, c2: True, c3: False})

    def test_affected_unit_is_required_when_the_cycle_has_units(self):
        cid = self.post(units=self.units(10, 10)).data['id']
        missing = self.health(cid, production_unit=Ellipsis)
        self.assertEqual(missing.status_code, 400)
        self.assertEqual(missing.data['production_unit'][0], 'Please select the affected pond/cage.')
        self.assertEqual(self.health(cid, production_unit=None).status_code, 400)
        self.assertEqual(self.client.get(f'{self.CYCLES}{cid}/health/').data, [])

    def test_unit_of_another_cycle_is_rejected(self):
        a = self.post(units=self.units(10, 10)).data['id']
        b = self.post(units=self.units(10, 10)).data['id']
        b_unit = self.unit_ids(b)[1]
        r = self.health(a, production_unit=b_unit)
        self.assertEqual(r.status_code, 400)
        self.assertIn('does not belong to this production cycle', r.data['production_unit'][0])
        self.assertEqual(self.health(a, production_unit=999999).status_code, 400)          # unknown unit
        self.assertEqual(self.client.get(f'{self.CYCLES}{a}/health/').data, [])
        self.assertEqual(self.health(b, production_unit=b_unit).status_code, 201)          # the same unit on its own cycle is fine

    def test_cycle_without_units_keeps_the_old_behaviour(self):
        cid = self.legacy_cycle_without_units()['id']
        r = self.health(cid)                                        # no unit, none exists
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['production_unit'], r.data['unit_label'], r.data['force_harvest']), (None, None, True))
        other_unit = self.unit_ids(self.post(units=self.units(10)).data['id'])[0]
        self.assertEqual(self.health(cid, production_unit=other_unit).status_code, 400)    # still cannot point at another cycle's unit

    def test_historical_logs_keep_no_invented_unit(self):
        from monitoring.models import AquacultureHealthLog
        cid = self.post(units=self.units(10, 10)).data['id']
        old = AquacultureHealthLog.objects.create(production_cycle_id=cid, log_date=date.today(), observation='Fish Mortality', mortality_count=3)
        row = self.client.get(f'{self.CYCLES}{cid}/health/').data[0]
        self.assertEqual((row['id'], row['production_unit'], row['unit_label'], row['mortality_count']), (old.id, None, None, 3))

    def test_force_harvest_yes_for_mortality_and_every_disease(self):
        cid = self.post(units=self.units(*[10] * 9)).data['id']      # one unit per log (a unit is reported once)
        r = self.health(cid, treatment_applied='Remove dead fish and disinfect pond')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertIs(r.data['force_harvest'], True)
        self.assertEqual(r.data['mortality_count'], 5)
        for disease in ('Bacterial Infection', 'Fungal Infection', 'Fin Rot', 'Gill Disease', 'White Spot (Ich)', 'Parasites'):
            r = self.health(cid, observation=disease, mortality_count=0, treatment_applied='x')
            self.assertEqual(r.status_code, 201, r.data)
            self.assertIs(r.data['force_harvest'], True, disease)
        # case/whitespace variations are the same observation; mortality recorded on another observation counts too
        self.assertIs(self.health(cid, observation='  fish mortality ').data['force_harvest'], True)
        self.assertIs(self.health(cid, observation='Weak Swimming', mortality_count=3).data['force_harvest'], True)

    def test_force_harvest_not_set_for_other_observations(self):
        cid = self.post(units=self.units(*[10] * 7)).data['id']
        for obs in ('Poor Water Quality', 'Low Dissolved Oxygen', 'Weak Swimming', 'Feeding Issue', 'Injury', 'Predator Attack', 'Routine check'):
            r = self.health(cid, observation=obs, mortality_count=0, treatment_applied='x')
            self.assertEqual(r.status_code, 201, r.data)
            self.assertIs(r.data['force_harvest'], False, obs)
        listed = self.client.get(f'{self.CYCLES}{cid}/health/').data
        self.assertTrue(all('force_harvest' in row and row['force_harvest'] is False for row in listed))

    def test_fish_mortality_requires_a_mortality_count_and_stores_it(self):
        cid = self.post().data['id']
        for bad in ({'mortality_count': 0}, {'mortality_count': None}, {'mortality_count': -2}):
            r = self.health(cid, **bad)
            self.assertEqual(r.status_code, 400, bad)
            self.assertIn('mortality_count', r.data)
        omitted = self.client.post(f'{self.CYCLES}{cid}/health/', {'log_date': str(date.today()), 'observation': 'Fish Mortality', 'production_unit': self.unit_ids(cid)[0]}, format='json')
        self.assertEqual(omitted.status_code, 400)
        r = self.health(cid, mortality_count=5)                       # no treatment at all
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['mortality_count'], 5)
        self.assertIs(r.data['force_harvest'], True)
        self.assertEqual(r.data['treatment_applied'], '')             # no treatment is invented or stored
        stored = self.client.get(f'{self.CYCLES}{cid}/health/').data
        self.assertEqual([(x['mortality_count'], x['force_harvest']) for x in stored], [(5, True)])

    def test_disease_needs_no_treatment_or_mortality_count(self):
        cid = self.post().data['id']
        r = self.client.post(f'{self.CYCLES}{cid}/health/', {'log_date': str(date.today()), 'observation': 'Bacterial Infection', 'mortality_count': 0, 'vet_consulted': True, 'production_unit': self.unit_ids(cid)[0]}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['force_harvest'], r.data['mortality_count'], r.data['treatment_applied'], r.data['vet_consulted']), (True, 0, '', True))

    def test_historical_health_logs_keep_their_data(self):
        from monitoring.models import AquacultureHealthLog
        cycle = AquacultureProductionCycle.objects.create(
            fisherfolk=self.ff_a, cycle_name='Old', species_farmed='Tilapia', culture_system='Fishpen', stocking_date=date.today())
        old = AquacultureHealthLog.objects.create(production_cycle=cycle, log_date=date.today(), observation='Fish Mortality',
                                                  mortality_count=7, treatment_applied='Remove dead fish and disinfect pond')
        row = self.client.get(f'{self.CYCLES}{cycle.id}/health/').data[0]
        self.assertEqual((row['mortality_count'], row['treatment_applied'], row['force_harvest']), (7, 'Remove dead fish and disinfect pond', False))

    def test_client_cannot_override_force_harvest(self):
        cid = self.post(units=self.units(10, 10, 10)).data['id']
        self.assertIs(self.health(cid, force_harvest=False).data['force_harvest'], True)                                  # mortality
        self.assertIs(self.health(cid, observation='Fin Rot', mortality_count=0, force_harvest=False).data['force_harvest'], True)  # disease
        self.assertIs(self.health(cid, observation='Injury', mortality_count=0, force_harvest=True).data['force_harvest'], False)   # not client-settable either

    def test_health_log_does_not_create_or_change_any_harvest(self):
        from fisheries.models import FisheriesHarvestRecord
        cid = self.post(units=self.units(20, 30)).data['id']
        rec = StockingRecord.objects.get(production_cycle_id=cid)
        before = (rec.status, rec.estimated_harvest_kg, rec.number_of_fingerlings)
        self.assertEqual(self.health(cid).status_code, 201)
        self.assertEqual(self.health(cid, observation='Parasites', mortality_count=0, treatment_applied='Formalin Bath').status_code, 201)
        self.assertEqual(FisheriesHarvestRecord.objects.count(), 0)                    # no actual harvest recorded
        cycle = AquacultureProductionCycle.objects.get(pk=cid)
        self.assertIsNone(cycle.harvest_volume_kg)
        self.assertIsNone(cycle.actual_harvest_date)
        self.assertEqual(cycle.status, 'Active')
        rec.refresh_from_db()
        self.assertEqual((rec.status, rec.estimated_harvest_kg, rec.number_of_fingerlings), before)

    def test_stocking_row_flags_force_harvest_per_cycle(self):
        normal, mortality, disease, other = (self.post(units=self.units(10)).data['id'] for _ in range(4))
        self.assertEqual(self.health(mortality).status_code, 201)
        self.assertEqual(self.health(disease, observation='Fin Rot', mortality_count=0, treatment_applied='x').status_code, 201)
        self.assertEqual(self.health(other, observation='Injury', mortality_count=0, treatment_applied='x').status_code, 201)
        flags = {name: self.stocking_row(cid)[1]['force_harvest'] for name, cid in
                 (('normal', normal), ('mortality', mortality), ('disease', disease), ('other', other))}
        self.assertEqual(flags, {'normal': False, 'mortality': True, 'disease': True, 'other': False})
        # multiple health logs: a normal one after the mortality does not clear it
        self.health(mortality, observation='Feeding Issue', mortality_count=0, treatment_applied='x')
        self.health(other, observation='Feeding Issue', mortality_count=0, treatment_applied='x')
        self.assertTrue(self.stocking_row(mortality)[1]['force_harvest'])
        self.assertFalse(self.stocking_row(other)[1]['force_harvest'])
        # the list endpoint the table uses carries the same flag
        rows = self.client.get(self.STOCKING).data
        rows = rows['results'] if isinstance(rows, dict) else rows
        self.assertEqual({r['production_cycle']: r['force_harvest'] for r in rows}[mortality], True)
        # a stocking record with no production cycle is never force-harvest
        plain = StockingRecord.objects.create(fisherfolk=self.ff_a, species=self.species, date_stocked=date.today(),
                                              number_of_fingerlings=10, season='Wet', year=date.today().year)
        self.assertFalse(self.client.get(f'{self.STOCKING}{plain.id}/').data['force_harvest'])

    def test_legacy_health_log_without_flag_still_counts(self):
        from monitoring.models import AquacultureHealthLog
        cid = self.post().data['id']
        AquacultureHealthLog.objects.create(production_cycle_id=cid, log_date=date.today(), observation='Fish Mortality', mortality_count=4)
        self.assertFalse(AquacultureHealthLog.objects.get(production_cycle_id=cid).force_harvest)   # stored flag is False (pre-flag row)
        self.assertTrue(self.stocking_row(cid)[1]['force_harvest'])                                 # ...but the condition is still detected

    def test_normal_cycle_is_gated_but_force_harvest_cycle_can_harvest_early(self):
        normal = self.post(units=self.units(20, 30)).data['id']
        force = self.post(units=self.units(20, 30)).data['id']
        f1, f2 = self.unit_ids(force)
        self.health(force, production_unit=f1)      # a harvest is per pond/cage: every affected one is listed
        self.health(force, production_unit=f2)
        rec_n, _ = self.stocking_row(normal)
        rec_f, _ = self.stocking_row(force)
        blocked = self.harvest(rec_n)
        self.assertEqual(blocked.status_code, 400)                       # existing 50%-duration rule still applies
        self.assertIn('half', str(blocked.data['detail']))
        before = (rec_f.estimated_harvest_kg, rec_f.number_of_fingerlings)
        ok = self.per_unit_harvest(rec_f, {f1: '15.25', f2: '25.00'})
        self.assertEqual(ok.status_code, 201, ok.data)                    # force harvest: recorded before the target date
        rec_f.refresh_from_db()
        self.assertEqual(rec_f.status, StockingRecord.Status.HARVESTED)   # existing status update
        self.assertEqual((rec_f.estimated_harvest_kg, rec_f.number_of_fingerlings), before)   # estimate preserved, separate from actual
        row = self.stocking_row(force)[1]
        self.assertEqual(row['total_harvested_kg'], 40.25)
        self.assertEqual(Decimal(row['estimated_harvest_kg']), before[0])

    def test_harvest_cannot_be_recorded_twice(self):
        from fisheries.models import FisheriesHarvestRecord
        cid = self.post(units=self.units(20, 30)).data['id']
        p1, p2 = self.unit_ids(cid)
        self.health(cid, production_unit=p1)
        self.health(cid, production_unit=p2)
        rec, _ = self.stocking_row(cid)
        self.assertEqual(self.per_unit_harvest(rec, {p1: '60.50', p2: '65.00'}).status_code, 201)
        second = self.harvest(rec, quantity_kg='10')
        self.assertEqual(second.status_code, 400)
        self.assertIn('already been harvested', second.data['detail'])
        self.assertEqual(FisheriesHarvestRecord.objects.filter(stocking_record=rec).count(), 1)
        rec.refresh_from_db()
        self.assertEqual(rec.status, StockingRecord.Status.HARVESTED)

    def test_existing_harvest_validation_still_applies_for_force_harvest(self):
        cid = self.post(units=self.units(20)).data['id']
        self.health(cid)
        rec, _ = self.stocking_row(cid)
        self.assertEqual(self.harvest(rec, harvest_date=str(date.today() + timedelta(days=2))).status_code, 400)   # not in the future
        self.assertEqual(self.harvest(rec, early_late_reason='').status_code, 400)                                  # >7 days early needs a reason
        self.assertEqual(self.harvest(rec, quantity_kg='').status_code, 400)                                        # actual kg required
        self.assertEqual(self.client.get(f'{self.STOCKING}{rec.id}/harvests/').data, [])

    def test_one_affected_pond_is_harvested_alone(self):
        from fisheries.models import FisheriesHarvestRecord
        cid, (p1, p2, p3), rec = self.force_cycle(3)
        self.assertEqual(self.health(cid, production_unit=p2, mortality_count=10).status_code, 201)
        self.assertEqual(self.units_state(rec), {'Pond 1': (False, False), 'Pond 2': (True, False), 'Pond 3': (False, False)})
        info = {u['label']: u['reasons'] for u in self.client.get(f'{self.STOCKING}{rec.id}/').data['harvest_units']}
        self.assertEqual(info['Pond 2'], ['Fish Mortality'])
        r = self.unit_harvest(rec, [p2], '25.50')                         # no reason typed, no is_final sent
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['production_units'], [p2])
        self.assertEqual(r.data['production_unit_labels'], ['Pond 2'])
        self.assertEqual(Decimal(r.data['quantity_kg']), Decimal('25.50'))
        self.assertEqual(r.data['early_late_reason'], 'Fish Mortality')  # taken from the Health Log
        self.assertIs(r.data['is_final'], False)                         # Pond 1 and Pond 3 keep growing
        rec.refresh_from_db()
        self.assertNotEqual(rec.status, StockingRecord.Status.HARVESTED)
        self.assertEqual(FisheriesHarvestRecord.objects.filter(stocking_record=rec).count(), 1)
        self.assertEqual(self.units_state(rec), {'Pond 1': (False, False), 'Pond 2': (True, True), 'Pond 3': (False, False)})
        row = self.client.get(f'{self.STOCKING}{rec.id}/').data
        self.assertEqual(row['total_harvested_kg'], 25.5)
        self.assertFalse(row['force_harvest'])                           # nothing left awaiting force harvest

    def test_two_affected_ponds_are_harvested_together_with_per_unit_kg(self):
        from fisheries.models import FisheriesHarvestRecord
        cid, (p1, p2, p3), rec = self.force_cycle(3)
        self.health(cid, production_unit=p2, mortality_count=10)
        self.health(cid, production_unit=p3, observation='Bacterial Infection', mortality_count=0)
        self.assertEqual(self.units_state(rec), {'Pond 1': (False, False), 'Pond 2': (True, False), 'Pond 3': (True, False)})
        r = self.per_unit_harvest(rec, {p2: '30.25', p3: '18.50'})
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(sorted(r.data['production_unit_labels']), ['Pond 2', 'Pond 3'])
        self.assertEqual(Decimal(r.data['quantity_kg']), Decimal('48.75'))        # record total = sum of the units
        self.assertEqual({u['label']: Decimal(u['quantity_kg']) for u in r.data['unit_harvests']},
                         {'Pond 2': Decimal('30.25'), 'Pond 3': Decimal('18.50')})
        self.assertEqual(r.data['early_late_reason'], 'Fish Mortality; Bacterial Infection')
        self.assertEqual(FisheriesHarvestRecord.objects.filter(stocking_record=rec).count(), 1)   # not one record per pond
        harvest = FisheriesHarvestRecord.objects.get(stocking_record=rec)
        self.assertEqual(set(harvest.production_units.values_list('id', flat=True)), {p2, p3})
        self.assertEqual(self.units_state(rec), {'Pond 1': (False, False), 'Pond 2': (True, True), 'Pond 3': (True, True)})
        self.assertFalse(harvest.is_final)
        self.assertEqual(self.client.get(f'{self.STOCKING}{rec.id}/').data['total_harvested_kg'], 48.75)

    def test_unaffected_ponds_can_never_be_included(self):
        cid, (p1, p2, p3, p4), rec = self.force_cycle(4)
        self.health(cid, production_unit=p2, mortality_count=4)
        self.health(cid, production_unit=p3, observation='Fin Rot', mortality_count=0)
        # Before 50%, anything but an actual Force Harvest selection is refused by the waiting rule.
        for bad in ([p1], [p4], [p2, p4], [p1, p2, p3]):
            r = self.unit_harvest(rec, bad, '10')
            self.assertEqual(r.status_code, 400, bad)
            self.assertIn('detail', r.data)
        self.assertEqual(self.client.get(f'{self.STOCKING}{rec.id}/harvests/').data, [])
        self.assertEqual(self.per_unit_harvest(rec, {p2: '20', p3: '10'}).status_code, 201)
        self.assertEqual(self.units_state(rec), {'Pond 1': (False, False), 'Pond 2': (True, True), 'Pond 3': (True, True), 'Pond 4': (False, False)})

    def test_units_of_another_cycle_are_rejected(self):
        cid_a, (a1, a2), rec_a = self.force_cycle(2)
        cid_b, (b1,), rec_b = self.force_cycle(1)
        self.health(cid_a, production_unit=a2)
        self.health(cid_b, production_unit=b1)
        self.past_half(rec_a)       # past the 50% rule, so the pond/cage checks (not the waiting rule) decide
        r = self.unit_harvest(rec_a, [a2, b1], '10')
        self.assertEqual(r.status_code, 400)
        self.assertIn('belong to this production cycle', str(r.data['production_units']))
        self.assertEqual(self.unit_harvest(rec_a, [b1], '10').status_code, 400)
        self.assertEqual(self.unit_harvest(rec_a, [999999], '10').status_code, 400)
        self.assertEqual(self.client.get(f'{self.STOCKING}{rec_a.id}/harvests/').data, [])

    def test_an_already_harvested_unit_cannot_be_harvested_again(self):
        from fisheries.models import FisheriesHarvestRecord
        cid, (p1, p2, p3), rec = self.force_cycle(3)
        self.health(cid, production_unit=p2)
        self.assertEqual(self.unit_harvest(rec, [p2], '20').status_code, 201)
        self.past_half(rec)         # past the 50% rule, so the pond/cage checks (not the waiting rule) decide
        again = self.unit_harvest(rec, [p2], '5')
        self.assertEqual(again.status_code, 400)
        self.assertIn('already been harvested', str(again.data['production_units']))
        # a later condition in another pond is a new, separate force harvest of just that pond
        self.health(cid, production_unit=p3, observation='Gill Disease', mortality_count=0)
        self.assertEqual(self.units_state(rec), {'Pond 1': (False, False), 'Pond 2': (True, True), 'Pond 3': (True, False)})
        self.assertEqual(self.unit_harvest(rec, [p3], '12').status_code, 201)
        self.assertEqual(FisheriesHarvestRecord.objects.filter(stocking_record=rec).count(), 2)

    def test_cycle_closes_only_when_every_unit_has_been_harvested(self):
        cid, (p1, p2), rec = self.force_cycle(2)
        self.health(cid, production_unit=p1)
        self.health(cid, production_unit=p2, observation='Parasites', mortality_count=0)
        r = self.per_unit_harvest(rec, {p1: '20.0', p2: '13.3'})       # every pond affected -> nothing left to grow
        self.assertEqual(r.status_code, 201, r.data)
        self.assertIs(r.data['is_final'], True)
        rec.refresh_from_db()
        self.assertEqual(rec.status, StockingRecord.Status.HARVESTED)
        self.assertEqual(self.harvest(rec, quantity_kg='1').status_code, 400)   # and no further harvest is possible

    def test_force_harvest_workflow_needs_affected_units_from_the_health_log(self):
        cid, (p1, p2), rec = self.force_cycle(2)
        self.assertEqual(self.unit_harvest(rec, [p1], '10').status_code, 400)             # no health log at all
        self.health(cid, production_unit=p2, observation='Feeding Issue', mortality_count=0, treatment_applied='x')
        self.assertEqual(self.unit_harvest(rec, [p2], '10').status_code, 400)             # a non-disease log does not qualify
        plain = StockingRecord.objects.create(fisherfolk=self.ff_a, species=self.species, date_stocked=date.today(),
                                              number_of_fingerlings=10, season='Wet', year=date.today().year)
        self.assertEqual(self.unit_harvest(plain, [p1], '10').status_code, 400)           # no production cycle -> no units

    def test_legacy_log_without_a_unit_is_never_attributed_to_a_pond(self):
        from monitoring.models import AquacultureHealthLog
        cid, (p1, p2), rec = self.force_cycle(2)
        AquacultureHealthLog.objects.create(production_cycle_id=cid, log_date=date.today(), observation='Fish Mortality', mortality_count=6)
        row = self.client.get(f'{self.STOCKING}{rec.id}/').data
        self.assertTrue(row['force_harvest'])                                              # cycle-level behaviour, as before
        self.assertTrue(all(not u['force_harvest'] for u in row['harvest_units']))         # ...but no pond is guessed
        self.assertEqual(self.unit_harvest(rec, [p1], '5').status_code, 400)

    def test_normal_harvest_is_unchanged_and_needs_no_health_log(self):
        cid, (p1, p2), rec = self.force_cycle(2)
        old_enough = self.client.get(f'{self.STOCKING}{rec.id}/').data
        self.assertFalse(old_enough['force_harvest'])
        self.assertEqual(self.harvest(rec).status_code, 400)                              # still gated: half the culture duration
        StockingRecord.objects.filter(pk=rec.pk).update(date_stocked=date.today() - timedelta(days=100), expected_harvest_date=date.today())
        ok = self.harvest(rec, early_late_reason='', quantity_kg='77.7')                 # on time: no reason needed
        self.assertEqual(ok.status_code, 201, ok.data)
        self.assertEqual((ok.data['production_units'], ok.data['is_final']), ([], True))  # whole-cycle final harvest, no units
        rec.refresh_from_db()
        self.assertEqual(rec.status, StockingRecord.Status.HARVESTED)

    def test_force_then_normal_unit_harvests_accumulate(self):
        from fisheries.models import FisheriesHarvestRecord
        cid, (p1, p2, p3), rec = self.force_cycle(3)
        self.health(cid, production_unit=p1, observation='Bacterial Infection', mortality_count=12)
        f = self.unit_harvest(rec, [p1], '8.50')                                         # Force Harvest before 50%
        self.assertEqual(f.status_code, 201, f.data)
        self.assertEqual((f.data['is_force_harvest'], f.data['is_final']), (True, False))
        self.past_half(rec)
        n2 = self.unit_harvest(rec, [p2], '12.00')                                       # normal harvest of Pond 2
        self.assertEqual(n2.status_code, 201, n2.data)
        self.assertEqual((n2.data['is_force_harvest'], n2.data['is_final']), (False, False))
        self.assertEqual(n2.data['early_late_reason'], '')                               # no Health Log reason invented
        rec.refresh_from_db()
        self.assertNotEqual(rec.status, StockingRecord.Status.HARVESTED)
        n3 = self.unit_harvest(rec, [p3], '10.50')                                       # last pond closes the cycle
        self.assertEqual(n3.status_code, 201, n3.data)
        self.assertEqual((n3.data['is_force_harvest'], n3.data['is_final']), (False, True))
        rec.refresh_from_db()
        self.assertEqual(rec.status, StockingRecord.Status.HARVESTED)
        row = self.client.get(f'{self.STOCKING}{rec.id}/').data
        self.assertEqual(row['total_harvested_kg'], 31.0)                                # 8.50 + 12.00 + 10.50, once each
        self.assertEqual({u['label']: (u['harvested'], u['force_harvested']) for u in row['harvest_units']},
                         {'Pond 1': (True, True), 'Pond 2': (True, False), 'Pond 3': (True, False)})
        self.assertEqual(FisheriesHarvestRecord.objects.filter(stocking_record=rec).count(), 3)

    def test_normal_harvest_of_several_units_is_one_record(self):
        from fisheries.models import FisheriesHarvestRecord
        cid, (p1, p2, p3), rec = self.force_cycle(3)
        self.health(cid, production_unit=p1)
        self.assertEqual(self.unit_harvest(rec, [p1], '8.50').status_code, 201)
        self.past_half(rec)
        r = self.per_unit_harvest(rec, {p2: '12.00', p3: '10.50'})
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['is_force_harvest'], r.data['is_final'], Decimal(r.data['quantity_kg'])), (False, True, Decimal('22.50')))
        self.assertEqual(FisheriesHarvestRecord.objects.filter(stocking_record=rec).count(), 2)
        self.assertEqual(self.client.get(f'{self.STOCKING}{rec.id}/').data['total_harvested_kg'], 31.0)
        again = self.unit_harvest(rec, [p1], '1')                                        # force-harvested pond is closed
        self.assertEqual(again.status_code, 400)

    def test_normal_unit_harvest_obeys_the_fifty_percent_rule(self):
        cid, (p1, p2), rec = self.force_cycle(2)
        self.health(cid, production_unit=p1)                                             # an affected pond elsewhere...
        r = self.unit_harvest(rec, [p2], '5')                                            # ...does not unlock Pond 2
        self.assertEqual(r.status_code, 400)
        self.assertIn('detail', r.data)
        self.past_half(rec)
        self.assertEqual(self.unit_harvest(rec, [p2], '5').status_code, 201)

    def test_normal_selection_cannot_include_a_pond_awaiting_force_harvest(self):
        cid, (p1, p2, p3), rec = self.force_cycle(3)
        self.health(cid, production_unit=p1)
        self.past_half(rec)
        r = self.unit_harvest(rec, [p1, p2], '10')
        self.assertEqual(r.status_code, 400)
        self.assertIn('awaiting Force Harvest', str(r.data['production_units']))
        self.assertEqual(self.client.get(f'{self.STOCKING}{rec.id}/harvests/').data, [])

    def test_client_cannot_set_is_force_harvest(self):
        cid, (p1, p2), rec = self.force_cycle(2)
        self.past_half(rec)
        r = self.unit_harvest(rec, [p1], '5', is_force_harvest=True)                     # no Health Log -> normal
        self.assertEqual(r.status_code, 201, r.data)
        self.assertIs(r.data['is_force_harvest'], False)
        self.health(cid, production_unit=p2)
        r = self.unit_harvest(rec, [p2], '5', is_force_harvest=False)                    # affected -> force anyway
        self.assertIs(r.data['is_force_harvest'], True)

    # --- Per-unit actual kg (FisheriesHarvestUnit)
    def test_force_harvest_saves_separate_kg_per_unit(self):
        from fisheries.models import FisheriesHarvestUnit
        cid, (p1, p2, p3), rec = self.force_cycle(3)
        self.health(cid, production_unit=p1, observation='Bacterial Infection', mortality_count=0)
        self.health(cid, production_unit=p2)
        r = self.per_unit_harvest(rec, {p1: '12.50', p2: '9.00'})                        # before 50%: Force Harvest
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['is_force_harvest'], r.data['is_final'], Decimal(r.data['quantity_kg'])), (True, False, Decimal('21.50')))
        stored = {row.production_unit_id: row.quantity_kg for row in FisheriesHarvestUnit.objects.filter(harvest_id=r.data['id'])}
        self.assertEqual(stored, {p1: Decimal('12.50'), p2: Decimal('9.00')})
        row = self.client.get(f'{self.STOCKING}{rec.id}/').data
        self.assertEqual({u['label']: u['force_harvested'] for u in row['harvest_units']},
                         {'Pond 1': True, 'Pond 2': True, 'Pond 3': False})
        self.assertEqual(row['total_harvested_kg'], 21.5)

    def test_multi_unit_force_harvest_needs_kg_for_each_unit(self):
        cid, (p1, p2, p3), rec = self.force_cycle(3)
        self.health(cid, production_unit=p1)
        self.health(cid, production_unit=p2)
        combined = self.unit_harvest(rec, [p1, p2], '21.50')                              # one combined total
        self.assertEqual(combined.status_code, 400)
        self.assertIn('each affected pond/cage separately', str(combined.data['unit_quantities']))
        for bad in ({p1: '12.50', p2: ''}, {p1: '12.50', p2: None}, {p1: '12.50', p2: '0'},
                    {p1: '12.50', p2: '-3'}, {p1: 'abc', p2: '9'}):
            r = self.per_unit_harvest(rec, bad)
            self.assertEqual(r.status_code, 400, bad)
            self.assertIn('unit_quantities', r.data)
        dup = self.client.post(f'{self.STOCKING}{rec.id}/harvests/', {'harvest_date': str(date.today()), 'unit_quantities': [
            {'production_unit': p1, 'quantity_kg': '5'}, {'production_unit': p1, 'quantity_kg': '6'}]}, format='json')
        self.assertEqual(dup.status_code, 400)
        mismatch = self.per_unit_harvest(rec, {p1: '5', p2: '6'}, production_units=[p1])
        self.assertEqual(mismatch.status_code, 400)
        self.assertEqual(self.client.get(f'{self.STOCKING}{rec.id}/harvests/').data, [])   # nothing was saved

    def test_per_unit_force_plus_normal_harvest_accumulates_once(self):
        cid, (p1, p2, p3), rec = self.force_cycle(3)
        self.health(cid, production_unit=p1, observation='Bacterial Infection', mortality_count=0)
        self.health(cid, production_unit=p2)
        self.assertEqual(self.per_unit_harvest(rec, {p1: '12.5', p2: '9.0'}).status_code, 201)
        self.past_half(rec)
        n = self.unit_harvest(rec, [p3], '15.0')                                          # normal harvest of Pond 3
        self.assertEqual(n.status_code, 201, n.data)
        self.assertEqual((n.data['is_force_harvest'], n.data['is_final']), (False, True))
        self.assertEqual([(u['label'], Decimal(u['quantity_kg'])) for u in n.data['unit_harvests']], [('Pond 3', Decimal('15.00'))])
        row = self.client.get(f'{self.STOCKING}{rec.id}/').data
        self.assertEqual(row['total_harvested_kg'], 36.5)                                # 12.5 + 9.0 + 15.0, once each
        self.assertEqual(row['status'], 'Harvested')
        self.assertEqual({u['label']: u['force_harvested'] for u in row['harvest_units']},
                         {'Pond 1': True, 'Pond 2': True, 'Pond 3': False})

    def test_normal_harvest_of_several_units_needs_kg_for_each_unit(self):
        cid, (p1, p2), rec = self.force_cycle(2)
        self.past_half(rec)
        combined = self.unit_harvest(rec, [p1, p2], '22.50')                            # one combined total
        self.assertEqual(combined.status_code, 400)
        self.assertIn('each selected pond/cage separately', str(combined.data['unit_quantities']))
        for bad in ({p1: '12.50', p2: ''}, {p1: '12.50', p2: None}, {p1: '12.50', p2: '0'},
                    {p1: '12.50', p2: '-1'}, {p1: 'x', p2: '9'}):
            r = self.per_unit_harvest(rec, bad)
            self.assertEqual(r.status_code, 400, bad)
            self.assertIn('unit_quantities', r.data)
        self.assertEqual(self.client.get(f'{self.STOCKING}{rec.id}/harvests/').data, [])   # nothing saved

    def test_normal_harvest_saves_separate_kg_per_unit(self):
        from fisheries.models import FisheriesHarvestUnit
        cid, (p1, p2, p3), rec = self.force_cycle(3)
        self.past_half(rec)
        r = self.per_unit_harvest(rec, {p1: '12.50', p2: '9.00'}, avg_body_weight_kg=None)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['is_force_harvest'], r.data['is_final'], Decimal(r.data['quantity_kg'])), (False, False, Decimal('21.50')))
        self.assertIsNone(r.data['avg_body_weight_kg'])                                  # nothing invented for it
        stored = {row.production_unit_id: row.quantity_kg for row in FisheriesHarvestUnit.objects.filter(harvest_id=r.data['id'])}
        self.assertEqual(stored, {p1: Decimal('12.50'), p2: Decimal('9.00')})
        row = self.client.get(f'{self.STOCKING}{rec.id}/').data
        self.assertEqual({u['label']: (u['harvested'], u['force_harvested']) for u in row['harvest_units']},
                         {'Pond 1': (True, False), 'Pond 2': (True, False), 'Pond 3': (False, False)})
        self.assertEqual(row['total_harvested_kg'], 21.5)

    def test_normal_per_unit_harvest_before_fifty_percent_is_gated(self):
        cid, (p1, p2), rec = self.force_cycle(2)
        r = self.per_unit_harvest(rec, {p1: '5', p2: '6'})                                # not a Force Harvest
        self.assertEqual(r.status_code, 400)
        self.assertIn('detail', r.data)

    def test_other_reason_text_is_saved_as_the_reason(self):
        cid, (p1, p2), rec = self.force_cycle(2)
        StockingRecord.objects.filter(pk=rec.pk).update(
            date_stocked=date.today() - timedelta(days=100), expected_harvest_date=date.today() + timedelta(days=30))
        r = self.per_unit_harvest(rec, {p1: '5', p2: '6'}, early_late_reason='Sudden water quality deterioration')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['early_late_reason'], 'Sudden water quality deterioration')
        detail = self.client.get(f'{self.STOCKING}{rec.id}/').data['harvests'][0]
        self.assertEqual(detail['early_late_reason'], 'Sudden water quality deterioration')

    def test_per_unit_total_cannot_be_edited_on_its_own(self):
        cid, (p1, p2), rec = self.force_cycle(2)
        self.health(cid, production_unit=p1)
        hid = self.per_unit_harvest(rec, {p1: '7.25'}).data['id']
        url = f'/api/fisheries/stocking/harvests/{hid}/detail/'
        self.assertEqual(self.client.patch(url, {'quantity_kg': '99'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(url, {'unit_quantities': [{'production_unit': p1, 'quantity_kg': '1'}]}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(url, {'notes': 'ok'}, format='json').status_code, 200)

    def test_units_cannot_be_edited_on_an_existing_harvest(self):
        cid, (p1, p2), rec = self.force_cycle(2)
        self.health(cid, production_unit=p2)
        hid = self.unit_harvest(rec, [p2], '9').data['id']
        r = self.client.patch(f'/api/fisheries/stocking/harvests/{hid}/detail/', {'production_units': [p1]}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('cannot be changed', str(r.data))
        self.assertEqual(self.client.patch(f'/api/fisheries/stocking/harvests/{hid}/detail/', {'notes': 'ok'}, format='json').status_code, 200)

    def test_fishpen_cycle_can_no_longer_be_started(self):
        # Start Production Cycle is Fishpond/Fishcage only: a Fishpen request is refused and nothing is created.
        cycles, stocks = AquacultureProductionCycle.objects.count(), StockingRecord.objects.count()
        r = self.client.post(self.CYCLES, {
            'fisherfolk': self.ff_a.id, 'organization': self.org_a.id, 'cycle_name': 'Grow-out Phase',
            'species_farmed': 'Tilapia', 'species_option': self.species.id, 'culture_system': 'Fishpen',
            'pond_location_barangay': 'Poblacion', 'water_source': 'River',
            'stocking_date': str(date.today() - timedelta(days=1)), 'stocking_count': 500,
        }, format='json')
        self.assertEqual(r.status_code, 400, r.data)
        self.assertIn('culture_system', r.data)
        self.assertEqual((AquacultureProductionCycle.objects.count(), StockingRecord.objects.count()), (cycles, stocks))


class ProductionCycleSeasonTests(ProductionCycleBase):
    """Season is derived from stocking_date by core.seasons (Wet Jun-Nov, Dry Dec-May), never client-supplied."""

    def test_season_by_date_including_boundaries(self):
        cases = {
            date(2025, 9, 21): 'Wet', date(2026, 2, 15): 'Dry',
            date(2025, 5, 31): 'Dry', date(2025, 6, 1): 'Wet',
            date(2025, 11, 30): 'Wet', date(2025, 12, 1): 'Dry',
        }
        for d, expected in cases.items():
            r = self.post(stocking_date=str(d))
            self.assertEqual(r.status_code, 201, r.data)
            self.assertEqual(r.data['season'], expected, d)
            self.assertEqual(StockingRecord.objects.get(production_cycle_id=r.data['id']).season, expected, d)

    def test_client_supplied_season_is_ignored(self):
        r = self.post(stocking_date='2025-09-21', season='Dry')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['season'], 'Wet')
        self.assertEqual(StockingRecord.objects.get(production_cycle_id=r.data['id']).season, 'Wet')

    def test_patch_cannot_override_season(self):
        cid = self.post(stocking_date='2025-09-21').data['id']
        r = self.client.patch(f'{self.CYCLES}{cid}/', {'season': 'Dry'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['season'], 'Wet')


class ForecastingReadsMonitoringRecordsTests(ProductionCycleBase):
    """Fisheries Forecasting reads the same /fisheries/stocking/ records Monitoring creates - no copies."""
    STOCKING = '/api/fisheries/stocking/'

    def rows(self, **params):
        r = self.client.get(self.STOCKING, params)
        self.assertEqual(r.status_code, 200)
        return r.data['results'] if isinstance(r.data, dict) else r.data

    def test_new_cycle_appears_once_far_from_harvest_with_organization(self):
        cid = self.post(organization=self.org_a.id).data['id']   # ~120-day harvest, far outside any 7-day window
        rows = [x for x in self.rows() if x['production_cycle'] == cid]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['organization_name'], 'OrgA')
        self.assertIsNotNone(rows[0]['estimated_harvest_kg'])
        self.assertEqual(StockingRecord.objects.filter(production_cycle_id=cid).count(), 1)

    def test_species_and_search_filters(self):
        self.post()
        self.assertEqual(len(self.rows(species=self.species.id)), 1)
        self.assertEqual(len(self.rows(species=self.species.id + 999)), 0)
        self.assertEqual(len(self.rows(search='tilapia')), 1)
        self.assertEqual(len(self.rows(search='Ann')), 1)
        self.assertEqual(len(self.rows(search='nomatch')), 0)

    # --- Actual harvest in Forecasting: same records, same cumulative total as Monitoring
    FORECAST_SCOPE = {'status': 'Stocked,Near Harvest,Harvested'}   # what the Forecast tab now requests

    def forecast_row(self, rec):
        rows = [x for x in self.rows(**self.FORECAST_SCOPE) if x['id'] == rec.id]
        self.assertEqual(len(rows), 1)
        return rows[0]

    def test_unharvested_cycle_has_no_actual_harvest_or_date(self):
        cid, _units, rec = self.force_cycle(2)
        row = self.forecast_row(rec)
        self.assertEqual((row['status'], row['harvest_count'], row['total_harvested_kg'], row['actual_harvest_date']),
                         ('Stocked', 0, 0.0, None))

    def test_force_then_normal_harvest_reach_forecasting_without_double_counting(self):
        from fisheries.models import FisheriesHarvestUnit
        cid, (p1, p2, p3), rec = self.force_cycle(3)
        self.past_half(rec)
        self.health(cid, production_unit=p1, observation='Bacterial Infection', mortality_count=0)
        self.health(cid, production_unit=p2)
        earlier = date.today() - timedelta(days=5)
        f = self.per_unit_harvest(rec, {p1: '12.50', p2: '9.00'}, harvest_date=str(earlier))
        self.assertEqual(f.status_code, 201, f.data)
        # Partial: Pond 3 is still stocked -> the cycle is NOT Harvested, but the actual kg/date already show.
        row = self.forecast_row(rec)
        self.assertEqual((row['status'], row['total_harvested_kg'], row['actual_harvest_date']), ('Stocked', 21.5, str(earlier)))
        self.assertEqual(row['total_harvested_kg'], self.client.get(f'{self.STOCKING}{rec.id}/').data['total_harvested_kg'])
        n = self.unit_harvest(rec, [p3], '15.00')                                        # normal harvest, today
        self.assertEqual(n.status_code, 201, n.data)
        row = self.forecast_row(rec)
        self.assertEqual((row['status'], row['harvest_count'], row['total_harvested_kg']), ('Harvested', 2, 36.5))
        self.assertEqual(row['actual_harvest_date'], str(date.today()))                  # latest harvest record
        self.assertEqual(FisheriesHarvestUnit.objects.filter(harvest__stocking_record=rec).count(), 3)   # rows exist...
        detail = self.client.get(f'{self.STOCKING}{rec.id}/').data                      # ...yet counted once
        self.assertEqual((detail['total_harvested_kg'], detail['actual_harvest_date']), (36.5, str(date.today())))
        # Root cause of the missing row: the endpoint's no-status default leaves Harvested records out.
        self.assertFalse(any(x['id'] == rec.id for x in self.rows()))


class HarvestedUnitDetailsTests(ProductionCycleBase):
    """Harvest details name the actual ponds linked to the harvest; unharvested ponds stay Stocked."""

    def test_only_pond_1_harvested(self):
        from monitoring.models import AquacultureHealthLog
        cid = self.post(units=[{'length_m': 4, 'width_m': 2, 'fingerling_count': 20},
                               {'length_m': 5, 'width_m': 2, 'fingerling_count': 30},
                               {'length_m': 6, 'width_m': 2, 'fingerling_count': 40}],
                        stocking_date=str(date.today() - timedelta(days=5))).data['id']
        cycle = AquacultureProductionCycle.objects.get(pk=cid)
        p1, p2, p3 = list(cycle.units.order_by('unit_number'))
        AquacultureHealthLog.objects.create(production_cycle=cycle, production_unit=p1, log_date=date.today(),
                                            observation='Fish Mortality', mortality_count=5)
        sid = StockingRecord.objects.get(production_cycle=cycle).id
        r = self.client.post(f'/api/fisheries/stocking/{sid}/harvests/', {
            'harvest_date': str(date.today()), 'quantity_kg': '12.50', 'production_units': [p1.id],
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual([d['label'] for d in r.data['production_unit_details']], ['Pond 1'])
        self.assertEqual(r.data['production_unit_details'][0]['reasons'], ['Fish Mortality'])
        detail = self.client.get(f'/api/fisheries/stocking/{sid}/').data
        self.assertEqual({u['label']: u['harvested'] for u in detail['harvest_units']},
                         {'Pond 1': True, 'Pond 2': False, 'Pond 3': False})
        self.assertNotEqual(detail['status'], 'Harvested')
        self.assertEqual(len(detail['harvests']), 1)


class CyclePondLocationWaterSourceTests(ProductionCycleBase):
    """Pond Location / Water Source are validated against the backend lists and stored on the StockingRecord."""

    def test_values_stored_on_stocking_record(self):
        r = self.post(pond_location_barangay='Dulao', water_source='Deep Well')
        self.assertEqual(r.status_code, 201, r.data)
        rec = StockingRecord.objects.get(production_cycle_id=r.data['id'])
        self.assertEqual((rec.pond_location_barangay, rec.water_source), ('Dulao', 'Deep Well'))

    def test_invalid_or_missing_values_rejected(self):
        for over in ({'pond_location_barangay': 'Atlantis'}, {'water_source': 'Ocean'},
                     {'pond_location_barangay': ''}, {'water_source': ''}):
            self.assertEqual(self.post(**over).status_code, 400, over)
        payload = self.payload()
        payload.pop('pond_location_barangay')
        self.assertEqual(self.client.post(self.CYCLES, payload, format='json').status_code, 400)
        self.assertFalse(AquacultureProductionCycle.objects.exists())

    def test_other_pond_location_stores_trimmed_custom_text_never_other(self):
        self.assertEqual(self.post(pond_location_barangay='Other').status_code, 400)
        self.assertEqual(self.post(pond_location_barangay='Other', pond_location_other_specify='   ').status_code, 400)
        r = self.post(pond_location_barangay='Other', pond_location_other_specify='  Sitio Mabini, San Juan ')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['pond_location'], 'Sitio Mabini, San Juan')
        rec = StockingRecord.objects.get(production_cycle_id=r.data['id'])
        self.assertEqual(rec.pond_location_barangay, 'Sitio Mabini, San Juan')
        # a listed barangay needs no manual text and is stored as-is
        r2 = self.post(pond_location_barangay='San Juan East')
        self.assertEqual(r2.data['pond_location'], 'San Juan East')

    def test_other_water_source_needs_specify(self):
        self.assertEqual(self.post(water_source='Other').status_code, 400)
        r = self.post(water_source='Other', water_source_other_specify='Irrigation canal')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(StockingRecord.objects.get(production_cycle_id=r.data['id']).water_source_other_specify, 'Irrigation canal')

    def test_form_options_endpoint(self):
        r = self.client.get('/api/fisheries/stocking/form-options/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('Poblacion', r.data['barangays'])
        self.assertEqual(r.data['water_sources'], ['River', 'Spring', 'Rain-fed', 'Deep Well', 'Other'])


class ForceHarvestOverridesFiftyPercentRuleTests(ProductionCycleBase):
    """Before 50% of the culture duration a normal harvest is refused; Force Harvest lifts it per unit only."""

    def setUp(self):
        super().setUp()
        from monitoring.models import AquacultureHealthLog
        self.Health = AquacultureHealthLog
        r = self.post()   # stocked yesterday, 120-day species -> far below 50%
        self.assertEqual(r.status_code, 201, r.data)
        self.cycle = AquacultureProductionCycle.objects.get(pk=r.data['id'])
        self.p1, self.p2 = list(self.cycle.units.order_by('unit_number'))
        self.sid = StockingRecord.objects.get(production_cycle=self.cycle).id

    def harvest(self, **body):
        data = {'harvest_date': str(date.today()), 'quantity_kg': '10.00'}
        data.update(body)
        return self.client.post(f'/api/fisheries/stocking/{self.sid}/harvests/', data, format='json')

    def affect(self, unit, observation='Fish Mortality', mortality=3):
        self.Health.objects.create(production_cycle=self.cycle, production_unit=unit, log_date=date.today(),
                                   observation=observation, mortality_count=mortality)

    def test_normal_harvest_refused_before_fifty_percent(self):
        self.assertEqual(self.harvest(is_final=True).status_code, 400)

    def test_one_affected_pond_does_not_unlock_a_normal_whole_cycle_harvest(self):
        self.affect(self.p1)
        self.assertEqual(self.harvest(is_final=True).status_code, 400)

    def test_force_harvest_is_unit_specific(self):
        self.affect(self.p1)
        self.assertEqual(self.harvest(production_units=[self.p2.id]).status_code, 400)   # unaffected pond
        r = self.harvest(production_units=[self.p1.id])
        self.assertEqual(r.status_code, 201, r.data)
        self.assertIs(r.data['is_force_harvest'], True)
        row = self.client.get(f'/api/fisheries/stocking/{self.sid}/').data
        self.assertEqual({u['label']: (u['force_harvest'], u['harvested']) for u in row['harvest_units']},
                         {'Pond 1': (True, True), 'Pond 2': (False, False)})

    def test_per_unit_force_harvest_is_exempt_but_per_unit_normal_is_not(self):
        self.affect(self.p1)
        def per_unit(unit):
            return self.client.post(f'/api/fisheries/stocking/{self.sid}/harvests/', {
                'harvest_date': str(date.today()), 'unit_quantities': [{'production_unit': unit.id, 'quantity_kg': '4'}],
            }, format='json')
        normal = per_unit(self.p2)
        self.assertEqual(normal.status_code, 400)                                          # unaffected pond: gated
        force = per_unit(self.p1)
        self.assertEqual(force.status_code, 201, force.data)
        self.assertIs(force.data['is_force_harvest'], True)

    def test_disease_activates_the_same_way(self):
        self.affect(self.p2, observation='Fin Rot', mortality=0)
        self.assertEqual(self.harvest(production_units=[self.p1.id]).status_code, 400)
        self.assertEqual(self.harvest(production_units=[self.p2.id]).status_code, 201)


class HealthLogMultipleUnitsTests(ProductionCycleBase):
    """One submission may name several ponds/cages; each gets its own unit-specific log; reported units are closed."""

    def setUp(self):
        super().setUp()
        r = self.post(units=[{'length_m': 4, 'width_m': 2, 'fingerling_count': 10 * (i + 1)} for i in range(5)])
        self.assertEqual(r.status_code, 201, r.data)
        self.cid = r.data['id']
        from monitoring.models import AquacultureProductionUnit
        self.units_ = list(AquacultureProductionUnit.objects.filter(production_cycle_id=self.cid).order_by('unit_number'))
        self.url = f'{self.CYCLES}{self.cid}/health/'

    def submit(self, ids, **over):
        body = {'log_date': str(date.today()), 'observation': 'Fish Mortality', 'mortality_count': 4, 'production_units': ids}
        body.update(over)
        return self.client.post(self.url, body, format='json')

    def test_several_units_in_one_submission_each_get_force_harvest(self):
        u = self.units_
        r = self.submit([u[2].id, u[4].id], unit_mortality={str(u[2].id): 6, str(u[4].id): 3})
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(sorted((x['unit_label'], x['mortality_count'], x['force_harvest']) for x in r.data),
                         [('Pond 3', 6, True), ('Pond 5', 3, True)])
        flags = {x['unit_label']: x['force_harvest'] for x in self.client.get(self.url).data}
        self.assertEqual(flags, {'Pond 3': True, 'Pond 5': True})      # Pond 1, 2, 4 have no log and are not marked

    def test_already_reported_unit_is_rejected_and_nothing_is_created(self):
        u = self.units_
        self.assertEqual(self.submit([u[1].id]).status_code, 201)
        r = self.submit([u[0].id, u[1].id])                            # Pond 2 already has a log
        self.assertEqual(r.status_code, 400)
        self.assertIn('already has a Health Log', r.data['production_units'][0])
        self.assertEqual(len(self.client.get(self.url).data), 1)       # Pond 1 was NOT created (all-or-nothing)
        single = self.client.post(self.url, {'log_date': str(date.today()), 'observation': 'Fish Mortality',
                                              'mortality_count': 2, 'production_unit': u[1].id}, format='json')
        self.assertEqual(single.status_code, 400)

    def test_other_cycles_unit_and_invalid_ids_are_rejected(self):
        other = self.post(units=[{'length_m': 3, 'width_m': 3, 'fingerling_count': 5}]).data['id']
        from monitoring.models import AquacultureProductionUnit
        foreign = AquacultureProductionUnit.objects.filter(production_cycle_id=other).first()
        self.assertEqual(self.submit([foreign.id]).status_code, 400)
        self.assertEqual(self.submit([999999]).status_code, 400)
        self.assertEqual(self.submit([]).status_code, 400)
        self.assertEqual(self.submit(['x']).status_code, 400)
        self.assertEqual(self.client.get(self.url).data, [])
        # the same unit number in ANOTHER cycle is not blocked by this cycle's logs
        self.assertEqual(self.submit([self.units_[0].id]).status_code, 201)
        self.assertEqual(self.client.post(f'{self.CYCLES}{other}/health/', {
            'log_date': str(date.today()), 'observation': 'Fish Mortality', 'mortality_count': 1,
            'production_units': [foreign.id]}, format='json').status_code, 201)

    def test_deleting_a_log_frees_its_unit_again(self):
        u = self.units_
        log = self.submit([u[1].id]).data[0]
        self.assertEqual(self.submit([u[1].id]).status_code, 400)
        self.assertEqual(self.client.delete(f"{self.CYCLES}health/{log['id']}/").status_code, 204)
        self.assertEqual(self.submit([u[1].id]).status_code, 201)

    def test_disease_marks_every_selected_unit(self):
        u = self.units_
        r = self.submit([u[0].id, u[3].id], observation='Fin Rot', mortality_count=0)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(all(x['force_harvest'] for x in r.data))


class HealthLogPerUnitObservationTests(ProductionCycleBase):
    """`unit_logs`: every selected pond/cage gets its OWN log with its own observation, mortality, treatment
    and Vet Consulted; Force Harvest and its reason stay per unit; the submission is all-or-nothing."""

    def setUp(self):
        super().setUp()
        r = self.post(units=[{'length_m': 4, 'width_m': 2, 'fingerling_count': 10 * (i + 1)} for i in range(3)])
        self.assertEqual(r.status_code, 201, r.data)
        self.cid = r.data['id']
        from monitoring.models import AquacultureProductionUnit
        self.p1, self.p2, self.p3 = list(AquacultureProductionUnit.objects.filter(production_cycle_id=self.cid).order_by('unit_number'))
        self.url = f'{self.CYCLES}{self.cid}/health/'

    def submit(self, entries, **shared):
        body = {'log_date': str(date.today()), 'unit_logs': entries}
        body.update(shared)
        return self.client.post(self.url, body, format='json')

    def entry(self, unit, observation, **over):
        e = {'production_unit': unit.id, 'observation': observation, 'mortality_count': 0, 'treatment_applied': ''}
        e.update(over)
        return e

    def test_each_unit_saves_its_own_observation_and_force_state(self):
        from monitoring.models import AquacultureHealthLog
        r = self.submit([
            self.entry(self.p1, 'Bacterial Infection'),
            self.entry(self.p2, 'Fungal Infection'),
            self.entry(self.p3, 'Feeding Issue', treatment_applied='Adjust Feeding Schedule'),
        ])
        self.assertEqual(r.status_code, 201, r.data)
        stored = {log.production_unit_id: (log.observation, log.force_harvest, log.treatment_applied)
                  for log in AquacultureHealthLog.objects.filter(production_cycle_id=self.cid)}
        self.assertEqual(stored, {
            self.p1.id: ('Bacterial Infection', True, ''),
            self.p2.id: ('Fungal Infection', True, ''),
            self.p3.id: ('Feeding Issue', False, 'Adjust Feeding Schedule'),
        })
        history = {x['unit_label']: (x['observation'], x['force_harvest']) for x in self.client.get(self.url).data}
        self.assertEqual(history, {'Pond 1': ('Bacterial Infection', True),
                                   'Pond 2': ('Fungal Infection', True),
                                   'Pond 3': ('Feeding Issue', False)})

    def test_vet_consulted_is_not_collected_per_unit(self):
        # No longer part of the Health Log input: a value sent in unit_logs is ignored (column default False).
        r = self.submit([self.entry(self.p1, 'Fin Rot', vet_consulted=True)])
        self.assertEqual(r.status_code, 201, r.data)
        self.assertIs(r.data[0]['vet_consulted'], False)

    def test_force_harvest_reason_comes_from_each_units_own_log(self):
        self.assertEqual(self.submit([
            self.entry(self.p1, 'Bacterial Infection'),
            self.entry(self.p2, 'Fungal Infection'),
        ]).status_code, 201)
        rec = StockingRecord.objects.get(production_cycle_id=self.cid)
        row = self.client.get(f'/api/fisheries/stocking/{rec.id}/').data
        self.assertEqual({u['label']: (u['force_harvest'], u['reasons']) for u in row['harvest_units']}, {
            'Pond 1': (True, ['Bacterial Infection']),
            'Pond 2': (True, ['Fungal Infection']),
            'Pond 3': (False, []),
        })
        h = self.client.post(f'/api/fisheries/stocking/{rec.id}/harvests/', {
            'harvest_date': str(date.today()),
            'unit_quantities': [{'production_unit': self.p1.id, 'quantity_kg': '12.50'},
                                {'production_unit': self.p2.id, 'quantity_kg': '9.00'}],
        }, format='json')
        self.assertEqual(h.status_code, 201, h.data)                               # existing Force Harvest still works
        self.assertIs(h.data['is_force_harvest'], True)
        self.assertEqual({d['label']: d['reasons'] for d in h.data['production_unit_details']},
                         {'Pond 1': ['Bacterial Infection'], 'Pond 2': ['Fungal Infection']})

    def test_missing_observation_for_one_unit_rejects_everything(self):
        r = self.submit([self.entry(self.p1, 'Bacterial Infection'), self.entry(self.p2, '')])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['unit_logs'][0], {})                              # Pond 1 itself was valid...
        self.assertIn('observation', r.data['unit_logs'][1])                     # ...the error is on Pond 2
        self.assertEqual(self.client.get(self.url).data, [])                     # ...and nothing was created
        no_obs = self.submit([{'production_unit': self.p1.id}])
        self.assertEqual(no_obs.status_code, 400)
        self.assertIn('observation', no_obs.data['unit_logs'][0])

    def test_per_unit_mortality_and_treatment_rules_apply_to_each_unit(self):
        r = self.submit([self.entry(self.p1, 'Fish Mortality', mortality_count=0), self.entry(self.p2, 'Fin Rot')])
        self.assertEqual(r.status_code, 400)
        self.assertIn('mortality_count', r.data['unit_logs'][0])
        ok = self.submit([self.entry(self.p1, 'Fish Mortality', mortality_count=7), self.entry(self.p2, 'Fin Rot')])
        self.assertEqual(ok.status_code, 201, ok.data)
        self.assertEqual(sorted((x['unit_label'], x['mortality_count']) for x in ok.data), [('Pond 1', 7), ('Pond 2', 0)])

    def test_one_units_values_never_overwrite_another(self):
        from monitoring.models import AquacultureHealthLog
        self.assertEqual(self.submit([self.entry(self.p1, 'Bacterial Infection')]).status_code, 201)
        self.assertEqual(self.submit([self.entry(self.p2, 'Poor Water Quality', treatment_applied='Water Exchange')]).status_code, 201)
        again = self.submit([self.entry(self.p1, 'Injury', treatment_applied='Isolate Injured Fish')])   # Pond 1 already logged
        self.assertEqual(again.status_code, 400)
        p1 = AquacultureHealthLog.objects.get(production_cycle_id=self.cid, production_unit=self.p1)
        self.assertEqual((p1.observation, p1.force_harvest), ('Bacterial Infection', True))
        p2 = AquacultureHealthLog.objects.get(production_cycle_id=self.cid, production_unit=self.p2)
        self.assertEqual((p2.observation, p2.force_harvest, p2.treatment_applied), ('Poor Water Quality', False, 'Water Exchange'))

    def test_duplicate_or_empty_unit_logs_are_rejected(self):
        self.assertEqual(self.submit([self.entry(self.p1, 'Fin Rot'), self.entry(self.p1, 'Parasites')]).status_code, 400)
        self.assertEqual(self.submit([]).status_code, 400)
        self.assertEqual(self.submit('x').status_code, 400)
        self.assertEqual(self.client.get(self.url).data, [])

    def test_client_cannot_set_force_harvest_per_unit(self):
        r = self.submit([self.entry(self.p1, 'Fin Rot', force_harvest=False),
                         self.entry(self.p2, 'Injury', treatment_applied='Isolate Injured Fish', force_harvest=True)])
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual({x['unit_label']: x['force_harvest'] for x in r.data}, {'Pond 1': True, 'Pond 2': False})


class HarvestVarianceDetailsTests(ProductionCycleBase):
    """GET /fisheries/stocking/<id>/variance-details/: estimate vs the cumulative actual (no double counting),
    the harvest records with type/date/reason, and the Health/Feeding Log entries of THIS cycle only."""

    def setUp(self):
        super().setUp()
        from monitoring.models import AquacultureProductionUnit
        self.cid, ids, self.rec = self.force_cycle(3)
        self.p1, self.p2, self.p3 = [AquacultureProductionUnit.objects.get(pk=i) for i in ids]
        self.past_half(self.rec)
        self.set_estimate(Decimal('100'))

    def set_estimate(self, kg):
        StockingRecord.objects.filter(pk=self.rec.pk).update(estimated_harvest_kg=kg)

    def details(self, rec=None):
        r = self.client.get(f'/api/fisheries/stocking/{(rec or self.rec).id}/variance-details/')
        self.assertEqual(r.status_code, 200)
        return r.data

    def unit_states(self, d):
        return [(u['name'], u['status'], u['actual_harvest_kg']) for u in d['production_units']]

    def test_five_unit_cycle_partially_harvested_lists_every_unit(self):           # A, B, C, D, E, G, I
        cid, ids, rec = self.force_cycle(5)
        StockingRecord.objects.filter(pk=rec.pk).update(estimated_harvest_kg=Decimal('74.38'))
        self.health(cid, production_unit=ids[0], observation='Bacterial Infection', mortality_count=0)
        self.health(cid, production_unit=ids[1], observation='Bacterial Infection', mortality_count=0)
        self.assertEqual(self.per_unit_harvest(rec, {ids[0]: '20.00', ids[1]: '20.00'}).status_code, 201)
        d = self.details(rec)
        self.assertEqual(self.unit_states(d), [
            ('Pond 1', 'force_harvested', '20.00'), ('Pond 2', 'force_harvested', '20.00'),
            ('Pond 3', 'still_stocked', None), ('Pond 4', 'still_stocked', None), ('Pond 5', 'still_stocked', None),
        ])                                                                          # never 0 for unharvested units
        self.assertEqual([u['id'] for u in d['production_units']], ids)            # only THIS cycle's units, all of them
        self.assertEqual(Decimal(d['actual_total_kg']), Decimal('40.00'))
        self.assertEqual((d['status'], d['is_fully_harvested']), ('Stocked', False))
        # The variance is still given while partial: harvest recorded so far vs the estimate.
        self.assertEqual(Decimal(d['difference_kg']), Decimal('-34.38'))
        self.assertAlmostEqual(d['variance_pct'], -46.2221, places=3)               # "46.2% less"
        self.assertEqual(self.details()['production_units'][0]['id'], self.p1.id)  # the other cycle is unaffected

    def test_partial_harvest_above_estimate_still_has_variance(self):
        r = self.per_unit_harvest(self.rec, {self.p1.id: '60', self.p2.id: '60'})   # Pond 3 still stocked
        self.assertEqual(r.status_code, 201, r.data)
        d = self.details()
        self.assertEqual((d['is_fully_harvested'], Decimal(d['difference_kg'])), (False, Decimal('20')))
        self.assertAlmostEqual(d['variance_pct'], 20.0)                             # "+20% above"
        self.assertEqual(self.unit_states(d)[2], ('Pond 3', 'still_stocked', None))

    def test_partial_harvest_equal_to_estimate_is_zero(self):
        self.assertEqual(self.per_unit_harvest(self.rec, {self.p1.id: '50', self.p2.id: '50'}).status_code, 201)
        d = self.details()
        self.assertEqual((d['is_fully_harvested'], Decimal(d['difference_kg']), d['variance_pct']), (False, Decimal('0'), 0.0))

    def harvest_all(self, kg1, kg2, kg3, **extra):
        r = self.per_unit_harvest(self.rec, {self.p1.id: kg1, self.p2.id: kg2, self.p3.id: kg3}, **extra)
        self.assertEqual(r.status_code, 201, r.data)
        return r

    def test_actual_below_estimate_is_negative(self):                              # A
        self.harvest_all('30', '20', '20')
        d = self.details()
        self.assertEqual((Decimal(d['actual_total_kg']), Decimal(d['difference_kg'])), (Decimal('70'), Decimal('-30')))
        self.assertAlmostEqual(d['variance_pct'], -30.0)

    def test_actual_above_estimate_is_positive(self):                              # B, N
        self.harvest_all('60', '30', '30')
        d = self.details()
        self.assertEqual((Decimal(d['actual_total_kg']), Decimal(d['difference_kg'])), (Decimal('120'), Decimal('20')))
        self.assertAlmostEqual(d['variance_pct'], 20.0)

    def test_actual_equal_to_estimate_is_zero(self):                               # C
        self.harvest_all('40', '30', '30')
        d = self.details()
        self.assertEqual(Decimal(d['difference_kg']), Decimal('0'))
        self.assertEqual(d['variance_pct'], 0.0)

    def test_no_harvest_means_no_variance(self):                                   # D
        d = self.details()
        self.assertEqual((d['harvest_count'], d['difference_kg'], d['variance_pct'], d['harvests']), (0, None, None, []))

    def test_zero_or_missing_estimate_gives_no_percentage(self):                   # E
        self.harvest_all('10', '10', '10')
        self.set_estimate(Decimal('0'))
        self.assertIsNone(self.details()['variance_pct'])
        self.set_estimate(None)
        d = self.details()
        self.assertEqual((d['variance_pct'], d['difference_kg']), (None, None))

    def test_force_and_normal_records_accumulate_once_with_traceability(self):     # F, G, H
        self.health(self.cid, production_unit=self.p1.id, observation='Bacterial Infection', mortality_count=0)
        self.health(self.cid, production_unit=self.p2.id)
        self.assertEqual(self.per_unit_harvest(self.rec, {self.p1.id: '12.50', self.p2.id: '9.00'}).status_code, 201)
        n = self.unit_harvest(self.rec, [self.p3.id], '15.00', early_late_reason='Buyer demand')
        self.assertEqual(n.status_code, 201, n.data)
        d = self.details()
        self.assertEqual(Decimal(d['actual_total_kg']), Decimal('36.50'))              # not 73.00: unit rows not re-added
        self.assertEqual(float(d['actual_total_kg']), self.client.get(f'/api/fisheries/stocking/{self.rec.id}/').data['total_harvested_kg'])
        self.assertEqual(self.unit_states(d), [                                     # H: fully harvested cycle
            ('Pond 1', 'force_harvested', '12.50'), ('Pond 2', 'force_harvested', '9.00'), ('Pond 3', 'harvested', '15.00'),
        ])
        self.assertIs(d['is_fully_harvested'], True)
        force, normal = d['harvests']
        self.assertEqual((force['harvest_type'], normal['harvest_type']), ('Force', 'Normal'))
        self.assertEqual({u['label']: (u['quantity_kg'], u['health_reasons']) for u in force['units']},
                         {'Pond 1': ('12.50', ['Bacterial Infection']), 'Pond 2': ('9.00', ['Fish Mortality'])})
        self.assertEqual((normal['reason'], normal['units'][0]['label'], normal['units'][0]['health_reasons']),
                         ('Buyer demand', 'Pond 3', []))
        logs = {l['unit_label']: l for l in d['health_logs']}
        self.assertTrue(logs['Pond 1']['force_harvest'])
        self.assertEqual(logs['Pond 1']['observation'], 'Bacterial Infection')
        self.assertEqual(logs['Pond 1']['force_harvest_record']['quantity_kg'], '12.50')   # Health Log -> its harvest
        self.assertEqual(logs['Pond 1']['force_harvest_record']['harvest_id'], force['id'])

    def test_other_reason_shows_the_custom_text(self):                             # I
        StockingRecord.objects.filter(pk=self.rec.pk).update(expected_harvest_date=date.today() + timedelta(days=30))
        self.harvest_all('10', '10', '10', early_late_reason='Sudden water quality deterioration')
        self.assertEqual(self.details()['harvests'][0]['reason'], 'Sudden water quality deterioration')

    def test_feeding_and_health_logs_are_this_cycles_only_and_keep_their_unit(self):   # J, K, L, M
        from monitoring.models import AquacultureFeedingLog, AquacultureFeedingLogUnit, AquacultureHealthLog
        mine = AquacultureFeedingLog.objects.create(production_cycle_id=self.cid, feeding_date=date.today(),
                                                    feed_type='Pellets', quantity_kg=Decimal('9.00'))
        AquacultureFeedingLogUnit.objects.create(feeding_log=mine, production_unit=self.p1, quantity_kg=Decimal('5.00'))
        AquacultureFeedingLogUnit.objects.create(feeding_log=mine, production_unit=self.p2, quantity_kg=Decimal('4.00'))
        AquacultureFeedingLog.objects.create(production_cycle_id=self.cid, feeding_date=date.today(),
                                             feed_type='Starter Feed', quantity_kg=Decimal('2.00'))      # no unit split
        self.health(self.cid, production_unit=self.p1.id, observation='Fin Rot', mortality_count=0)
        other_cid, (q1,), _other = self.force_cycle(1)
        AquacultureFeedingLog.objects.create(production_cycle_id=other_cid, feeding_date=date.today(),
                                             feed_type='OTHER CYCLE FEED', quantity_kg=Decimal('50'))
        AquacultureHealthLog.objects.create(production_cycle_id=other_cid, production_unit_id=q1, log_date=date.today(),
                                            observation='OTHER CYCLE OBS', mortality_count=0)
        d = self.details()
        self.assertEqual(sorted(f['feed_type'] for f in d['feeding_logs']), ['Pellets', 'Starter Feed'])
        pellets = next(f for f in d['feeding_logs'] if f['feed_type'] == 'Pellets')
        self.assertEqual({u['label']: u['quantity_kg'] for u in pellets['units']}, {'Pond 1': '5.00', 'Pond 2': '4.00'})
        self.assertEqual(next(f for f in d['feeding_logs'] if f['feed_type'] == 'Starter Feed')['units'], [])
        self.assertEqual([(l['unit_label'], l['observation'], l['force_harvest_record']) for l in d['health_logs']],
                         [('Pond 1', 'Fin Rot', None)])                            # affected, not yet harvested
        self.assertNotIn('OTHER CYCLE', str(d))


class HarvestTimingTests(ProductionCycleBase):
    """Harvest timing = harvest_date vs the estimated (expected) harvest date, to the day. Early or late
    needs a reason (early_late_reason) on any normal harvest; on time needs none; a Force Harvest keeps
    its Health Log reason. Dates are relative to today because a harvest date cannot be in the future."""
    HARVESTS = '/api/fisheries/stocking/{}/harvests/'

    def setUp(self):
        super().setUp()
        self.cid, (self.p1, self.p2), self.rec = self.force_cycle(2)

    def estimate(self, days_from_today):
        # Stocked long ago, so the 50% rule never blocks these harvests.
        StockingRecord.objects.filter(pk=self.rec.pk).update(
            date_stocked=date.today() - timedelta(days=300),
            expected_harvest_date=date.today() + timedelta(days=days_from_today))

    def record(self, **extra):
        body = {'harvest_date': str(date.today()), 'quantity_kg': '10.00', 'production_units': [self.p1]}
        body.update(extra)
        return self.client.post(self.HARVESTS.format(self.rec.id), body, format='json')

    def test_early_harvest_with_reason(self):                                       # A, I
        self.estimate(27)
        r = self.record(early_late_reason='Buyer demand')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['harvest_timing'], r.data['harvest_timing_label'], r.data['harvest_timing_days']),
                         ('early', 'Early Harvest', -27))
        self.assertEqual(r.data['estimated_harvest_date'], str(date.today() + timedelta(days=27)))
        self.assertEqual(r.data['early_late_reason'], 'Buyer demand')

    def test_late_harvest_reason_is_saved_and_returned(self):                       # B, H
        self.estimate(-9)
        r = self.record(early_late_reason='Fish have not reached target size')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['harvest_timing'], r.data['harvest_timing_label'], r.data['harvest_timing_days']),
                         ('late', 'Late Harvest', 9))
        listed = self.client.get(self.HARVESTS.format(self.rec.id)).data[0]
        self.assertEqual((listed['harvest_timing'], listed['early_late_reason']), ('late', 'Fish have not reached target size'))

    def test_on_time_harvest_needs_no_reason(self):                                 # C
        self.estimate(0)
        r = self.record(early_late_reason='')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['harvest_timing'], r.data['harvest_timing_label'], r.data['harvest_timing_days'],
                          r.data['early_late_reason']), ('on_time', 'On-Time Harvest', 0, ''))

    def test_early_or_late_without_reason_is_rejected(self):                       # D, E
        for days in (27, 1, -1, -9):                                               # any number of days, even one
            self.estimate(days)
            for reason in ('', '   '):
                r = self.record(early_late_reason=reason)
                self.assertEqual(r.status_code, 400, (days, reason))
                self.assertIn('early_late_reason', r.data)
        self.assertEqual(self.client.get(self.HARVESTS.format(self.rec.id)).data, [])

    def test_other_needs_the_actual_reason_text(self):                             # F, G
        self.estimate(-9)
        for bare in ('Other', ' other '):
            self.assertEqual(self.record(early_late_reason=bare).status_code, 400)
        r = self.record(early_late_reason='  Sudden water quality deterioration  ')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['early_late_reason'], 'Sudden water quality deterioration')   # trimmed, exact text

    def test_force_harvest_keeps_its_health_log_reason(self):                      # J
        self.estimate(27)
        self.health(self.cid, production_unit=self.p2, observation='Bacterial Infection', mortality_count=0)
        r = self.per_unit_harvest(self.rec, {self.p2: '5.00'})                     # no reason typed
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['is_force_harvest'], r.data['harvest_timing'], r.data['early_late_reason']),
                         (True, 'early', 'Bacterial Infection'))

    def test_older_record_without_reason_still_editable(self):
        from fisheries.models import FisheriesHarvestRecord
        self.estimate(27)
        old = FisheriesHarvestRecord.objects.create(stocking_record=self.rec, harvest_date=date.today(), quantity_kg='3')
        r = self.client.patch(f'/api/fisheries/stocking/harvests/{old.id}/detail/', {'notes': 'checked'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual((r.data['harvest_timing'], r.data['early_late_reason']), ('early', ''))   # nothing invented


class ForecastingHarvestTimingTests(ProductionCycleBase):
    """Forecasting surfaces the timing recorded by Record Harvest: the row's actual_harvest_timing (its
    latest harvest, via fisheries.models.harvest_timing) and each harvest record's own timing and reason
    in the read-only variance-details response. Nothing is recomputed differently or invented."""
    FORECAST_SCOPE = {'status': 'Stocked,Near Harvest,Harvested'}

    def setUp(self):
        super().setUp()
        self.cid, (self.p1, self.p2), self.rec = self.force_cycle(2)

    def estimate(self, days_from_today):
        StockingRecord.objects.filter(pk=self.rec.pk).update(
            date_stocked=date.today() - timedelta(days=300),
            expected_harvest_date=date.today() + timedelta(days=days_from_today))

    def row(self):
        rows = self.client.get('/api/fisheries/stocking/', self.FORECAST_SCOPE).data
        rows = rows['results'] if isinstance(rows, dict) else rows
        return next(x for x in rows if x['id'] == self.rec.id)

    def details(self):
        return self.client.get(f'/api/fisheries/stocking/{self.rec.id}/variance-details/').data

    def normal(self, unit, reason='', **extra):
        body = {'harvest_date': str(date.today()), 'quantity_kg': '10.00', 'production_units': [unit], 'early_late_reason': reason}
        body.update(extra)
        r = self.client.post(f'/api/fisheries/stocking/{self.rec.id}/harvests/', body, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        return r

    def test_early_harvest_timing_and_reason(self):                                 # 1, 4
        self.estimate(27)
        self.normal(self.p1, 'Buyer demand')
        row = self.row()
        self.assertEqual((row['actual_harvest_timing'], row['actual_harvest_timing_label'], row['actual_harvest_timing_days']),
                         ('early', 'Early Harvest', -27))
        h = self.details()['harvests'][0]
        self.assertEqual((h['harvest_timing'], h['harvest_timing_days'], h['reason']), ('early', -27, 'Buyer demand'))
        self.assertEqual(self.details()['estimated_harvest_date'], str(date.today() + timedelta(days=27)))

    def test_late_harvest_timing_and_reason(self):                                  # 2, 5
        self.estimate(-9)
        self.normal(self.p1, 'Fish have not reached target size')
        row = self.row()
        self.assertEqual((row['actual_harvest_timing'], row['actual_harvest_timing_days']), ('late', 9))
        h = self.details()['harvests'][0]
        self.assertEqual((h['harvest_timing'], h['harvest_timing_label'], h['reason']),
                         ('late', 'Late Harvest', 'Fish have not reached target size'))

    def test_on_time_harvest_timing(self):                                          # 3
        self.estimate(0)
        self.normal(self.p1)
        self.assertEqual((self.row()['actual_harvest_timing'], self.row()['actual_harvest_timing_label']), ('on_time', 'On-Time Harvest'))
        self.assertEqual(self.details()['harvests'][0]['reason'], '')

    def test_partial_force_harvest_keeps_health_log_reason_and_timing(self):        # 6, 8
        self.estimate(27)
        self.health(self.cid, production_unit=self.p1, observation='Bacterial Infection', mortality_count=0)
        self.assertEqual(self.per_unit_harvest(self.rec, {self.p1: '20.00'}).status_code, 201)
        row = self.row()
        self.assertEqual((row['status'], row['actual_harvest_timing']), ('Stocked', 'early'))   # partial, still shown
        d = self.details()
        self.assertEqual((d['harvests'][0]['harvest_type'], d['harvests'][0]['harvest_timing'], d['harvests'][0]['reason']),
                         ('Force', 'early', 'Bacterial Infection'))
        self.assertEqual([u['status'] for u in d['production_units']], ['force_harvested', 'still_stocked'])

    def test_older_record_without_reason_gets_none_invented(self):                  # 7
        from fisheries.models import FisheriesHarvestRecord
        self.estimate(27)
        FisheriesHarvestRecord.objects.create(stocking_record=self.rec, harvest_date=date.today(), quantity_kg='3')
        self.assertEqual(self.row()['actual_harvest_timing'], 'early')
        h = self.details()['harvests'][0]
        self.assertEqual((h['harvest_timing'], h['reason']), ('early', ''))

    def test_multiple_records_keep_their_own_timing_and_reason(self):               # 9
        self.estimate(0)
        self.health(self.cid, production_unit=self.p1, observation='Bacterial Infection', mortality_count=0)
        earlier = date.today() - timedelta(days=2)
        self.assertEqual(self.per_unit_harvest(self.rec, {self.p1: '12.50'}, harvest_date=str(earlier)).status_code, 201)
        self.normal(self.p2)                                                        # today = on time, no reason
        self.assertEqual((self.row()['actual_harvest_date'], self.row()['actual_harvest_timing']), (str(date.today()), 'on_time'))
        force, normal = self.details()['harvests']
        self.assertEqual((force['harvest_date'], force['harvest_timing'], force['harvest_timing_days'], force['reason']),
                         (str(earlier), 'early', -2, 'Bacterial Infection'))
        self.assertEqual((normal['harvest_timing'], normal['reason']), ('on_time', ''))

    def test_no_harvest_means_no_timing(self):
        self.estimate(27)
        row = self.row()
        self.assertEqual((row['actual_harvest_date'], row['actual_harvest_timing'], row['actual_harvest_timing_days']), (None, None, None))
