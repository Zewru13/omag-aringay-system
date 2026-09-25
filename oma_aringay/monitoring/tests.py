from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from associations.models import FisherfolkOrganization, FisherfolkOrganizationMember
from fisheries.models import Fisherfolk, SpeciesCategory, SpeciesOption, StockingRecord
from monitoring.models import AquacultureProductionCycle


class ProductionCycleOrganizationTests(APITestCase):
    CYCLES = '/api/monitoring/aquaculture-cycles/'
    ORGS = '/api/organizations/fisherfolk/'

    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(username='admin1', password='pw', role='ADMIN')
        make = lambda n: Fisherfolk.objects.create(
            first_name=n, last_name='Test', gender='Male', birthdate=date(1990, 1, 1),
            barangay='Poblacion', fisherfolk_type='Aquaculture',
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

    # --- Estimated Harvest Biomass (shared existing formula)
    def expected(self, n, species=None):
        s = species or self.species
        return (Decimal(n) * s.default_survival_rate_pct / 100 * s.default_avg_body_weight_kg).quantize(Decimal('0.01'))

    def units(self, *counts):
        return [{'length_m': 4, 'width_m': 1, 'fingerling_count': c} for c in counts]

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

    # --- Feeding Log: per pond/cage quantities (View Cycle > Feeding Log > Log Feeding)
    def feeding(self, cycle_id, **body):
        base = {'feeding_date': str(date.today()), 'feed_type': 'Pellets'}
        base.update(body)
        return self.client.post(f'{self.CYCLES}{cycle_id}/feeding/', base, format='json')

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

    def test_feeding_single_quantity_still_works(self):
        with_units = self.post(units=self.units(10, 10)).data
        no_units = self.post(culture_system='Fishpen', units=[], stocking_count=100).data
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

    # --- Health Log: Force Harvest defaults to YES for fish mortality / disease
    def unit_ids(self, cycle_id):
        from monitoring.models import AquacultureProductionUnit
        return list(AquacultureProductionUnit.objects.filter(production_cycle_id=cycle_id).values_list('id', flat=True))

    def health(self, cycle_id, **body):
        base = {'log_date': str(date.today()), 'observation': 'Fish Mortality', 'mortality_count': 5}
        ids = self.unit_ids(cycle_id)
        if ids and 'production_unit' not in body:
            base['production_unit'] = ids[0]      # the affected pond/cage is required when the cycle has units
        base.update({k: v for k, v in body.items() if not (k == 'production_unit' and v is Ellipsis)})
        if base.get('production_unit') is Ellipsis:
            base.pop('production_unit')
        return self.client.post(f'{self.CYCLES}{cycle_id}/health/', base, format='json')

    # --- Health Log: affected pond/cage (unit-specific record and Force Harvest)
    def unit_status(self, cycle_id):
        """{unit_id: True/False} - Force Harvest per pond/cage, derived from that unit's own logs."""
        logs = self.client.get(f'{self.CYCLES}{cycle_id}/health/').data
        return {uid: any(l['force_harvest'] for l in logs if l['production_unit'] == uid) for uid in self.unit_ids(cycle_id)}

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
        cid = self.post(culture_system='Fishpen', units=[], stocking_count=100).data['id']
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
        cid = self.post().data['id']
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
        cid = self.post().data['id']
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
        cid = self.post().data['id']
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

    # --- Fisheries Monitoring: Harvest button data + Record Harvest workflow (force harvest, duplicates)
    STOCKING = '/api/fisheries/stocking/'

    def stocking_row(self, cycle_id):
        rec = StockingRecord.objects.get(production_cycle_id=cycle_id)
        return rec, self.client.get(f'{self.STOCKING}{rec.id}/').data

    def harvest(self, rec, **body):
        base = {'harvest_date': str(date.today()), 'quantity_kg': '125.50', 'is_final': True, 'early_late_reason': 'Emergency harvest — disaster damage'}
        base.update(body)
        return self.client.post(f'{self.STOCKING}{rec.id}/harvests/', base, format='json')

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
        self.health(force)
        rec_n, _ = self.stocking_row(normal)
        rec_f, _ = self.stocking_row(force)
        blocked = self.harvest(rec_n)
        self.assertEqual(blocked.status_code, 400)                       # existing 50%-duration rule still applies
        self.assertIn('half', str(blocked.data['detail']))
        before = (rec_f.estimated_harvest_kg, rec_f.number_of_fingerlings)
        ok = self.harvest(rec_f, quantity_kg='40.25')
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
        self.health(cid)
        rec, _ = self.stocking_row(cid)
        self.assertEqual(self.harvest(rec).status_code, 201)
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

    # --- Unit-aware Force Harvest: ONE harvest record, only the affected ponds/cages, ONE total kg
    def force_cycle(self, n=3):
        cid = self.post(units=self.units(*([10] * n))).data['id']
        return cid, self.unit_ids(cid), StockingRecord.objects.get(production_cycle_id=cid)

    def unit_harvest(self, rec, unit_ids, kg, **extra):
        body = {'harvest_date': str(date.today()), 'quantity_kg': kg, 'production_units': unit_ids}
        body.update(extra)
        return self.client.post(f'{self.STOCKING}{rec.id}/harvests/', body, format='json')

    def units_state(self, rec):
        return {u['label']: (u['force_harvest'], u['harvested']) for u in self.client.get(f'{self.STOCKING}{rec.id}/').data['harvest_units']}

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

    def test_two_affected_ponds_are_harvested_together_with_one_total(self):
        from fisheries.models import FisheriesHarvestRecord
        cid, (p1, p2, p3), rec = self.force_cycle(3)
        self.health(cid, production_unit=p2, mortality_count=10)
        self.health(cid, production_unit=p3, observation='Bacterial Infection', mortality_count=0)
        self.assertEqual(self.units_state(rec), {'Pond 1': (False, False), 'Pond 2': (True, False), 'Pond 3': (True, False)})
        r = self.unit_harvest(rec, [p2, p3], '48.75')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(sorted(r.data['production_unit_labels']), ['Pond 2', 'Pond 3'])
        self.assertEqual(Decimal(r.data['quantity_kg']), Decimal('48.75'))        # ONE total for Pond 2 + Pond 3
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
        for bad in ([p1], [p4], [p2, p4], [p1, p2, p3]):
            r = self.unit_harvest(rec, bad, '10')
            self.assertEqual(r.status_code, 400, bad)
            self.assertIn('not under Force Harvest', str(r.data['production_units']))
        self.assertEqual(self.client.get(f'{self.STOCKING}{rec.id}/harvests/').data, [])
        self.assertEqual(self.unit_harvest(rec, [p2, p3], '30').status_code, 201)
        self.assertEqual(self.units_state(rec), {'Pond 1': (False, False), 'Pond 2': (True, True), 'Pond 3': (True, True), 'Pond 4': (False, False)})

    def test_units_of_another_cycle_are_rejected(self):
        cid_a, (a1, a2), rec_a = self.force_cycle(2)
        cid_b, (b1,), rec_b = self.force_cycle(1)
        self.health(cid_a, production_unit=a2)
        self.health(cid_b, production_unit=b1)
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
        r = self.unit_harvest(rec, [p1, p2], '33.3')                     # every pond affected -> nothing left to grow
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
        StockingRecord.objects.filter(pk=rec.pk).update(date_stocked=date.today() - timedelta(days=100), expected_harvest_date=date.today() + timedelta(days=3))
        ok = self.harvest(rec, early_late_reason='', quantity_kg='77.7')
        self.assertEqual(ok.status_code, 201, ok.data)
        self.assertEqual((ok.data['production_units'], ok.data['is_final']), ([], True))  # whole-cycle final harvest, no units
        rec.refresh_from_db()
        self.assertEqual(rec.status, StockingRecord.Status.HARVESTED)

    def test_units_cannot_be_edited_on_an_existing_harvest(self):
        cid, (p1, p2), rec = self.force_cycle(2)
        self.health(cid, production_unit=p2)
        hid = self.unit_harvest(rec, [p2], '9').data['id']
        r = self.client.patch(f'/api/fisheries/stocking/harvests/{hid}/detail/', {'production_units': [p1]}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('cannot be changed', str(r.data))
        self.assertEqual(self.client.patch(f'/api/fisheries/stocking/harvests/{hid}/detail/', {'notes': 'ok'}, format='json').status_code, 200)

    def test_fishpen_cycle_without_units_still_works(self):
        r = self.client.post(self.CYCLES, {
            'fisherfolk': self.ff_a.id, 'organization': self.org_a.id, 'cycle_name': 'Grow-out Phase',
            'species_farmed': 'Tilapia', 'species_option': self.species.id, 'culture_system': 'Fishpen',
            'pond_location_barangay': 'Poblacion', 'water_source': 'River',
            'stocking_date': str(date.today() - timedelta(days=1)), 'stocking_count': 500,
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['organization_name'], 'OrgA')
        self.assertEqual(StockingRecord.objects.get(production_cycle_id=r.data['id']).number_of_fingerlings, 500)


class ProductionCycleSeasonTests(ProductionCycleOrganizationTests):
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


class ForecastingReadsMonitoringRecordsTests(ProductionCycleOrganizationTests):
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


class HarvestedUnitDetailsTests(ProductionCycleOrganizationTests):
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


class CyclePondLocationWaterSourceTests(ProductionCycleOrganizationTests):
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


class ForceHarvestOverridesFiftyPercentRuleTests(ProductionCycleOrganizationTests):
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
        row = self.client.get(f'/api/fisheries/stocking/{self.sid}/').data
        self.assertEqual({u['label']: (u['force_harvest'], u['harvested']) for u in row['harvest_units']},
                         {'Pond 1': (True, True), 'Pond 2': (False, False)})

    def test_disease_activates_the_same_way(self):
        self.affect(self.p2, observation='Fin Rot', mortality=0)
        self.assertEqual(self.harvest(production_units=[self.p1.id]).status_code, 400)
        self.assertEqual(self.harvest(production_units=[self.p2.id]).status_code, 201)
