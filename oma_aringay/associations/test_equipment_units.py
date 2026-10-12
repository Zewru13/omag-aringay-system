"""Organization equipment: conditions (Broken, Lost), the unit figures of a line (how many are out on loan, how many can be
lent) and the operations that move units between condition lines (Tasks 1-2 of the equipment cycle)."""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from associations.equipment_ops import (
    OUT_STATUSES, available, equipment_domain, movable, on_loan,
)
from associations.models import (
    FarmersOrganization, FarmersOrganizationEquipment, FarmersOrganizationMember,
    FisherfolkOrganization, FisherfolkOrganizationEquipment, FisherfolkOrganizationMember,
)
from farmers.models import Farmer
from fisheries.models import Fisherfolk

_N = itertools.count(1)
User = get_user_model()

DOMAINS = {
    'farmers': dict(link='FARMERS_ORG', org=FarmersOrganization, line=FarmersOrganizationEquipment,
                    member=FarmersOrganizationMember, person_field='farmer'),
    'fisherfolk': dict(link='FISHERFOLK_ORG', org=FisherfolkOrganization, line=FisherfolkOrganizationEquipment,
                       member=FisherfolkOrganizationMember, person_field='fisherfolk'),
}


def make_org(model, name):
    n = next(_N)
    return model.objects.create(
        name=f'{name} {n}', barangay='Alaska', registration_number=f'EQ-{n:05d}', date_organized=date(2020, 1, 1),
        date_registered=date(2020, 2, 1), registration_agency='SEC', contact_person='Pat Contact', contact_number='09171234567')


def make_person(domain, first):
    n = next(_N)
    if domain == 'farmers':
        return Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (880000 + n), first_name=first, last_name='Equip', gender='Male',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
    return Fisherfolk.objects.create(
        rsbsa_number='01-033-02-019-%06d' % (881000 + n), first_name=first, last_name='Equip', gender='Male',
        birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')


def make_citizen(username, record_type, record_id):
    user = User.objects.create_user(username=username, password='pw', role='CITIZEN', email=f'{username}@x.test')
    UserLinkedRecord.objects.create(user=user, record_type=record_type, record_id=record_id, is_active=True)
    return user


class EquipmentFixture:
    """For each domain: an organization with its account, an active member, a line, and a second organization."""

    @classmethod
    def setUpTestData(cls):
        cls.ctx = {}
        for domain, cfg in DOMAINS.items():
            org = make_org(cfg['org'], f'Equip {domain}')
            other = make_org(cfg['org'], f'Other {domain}')
            person = make_person(domain, 'Borrower')
            cfg['member'].objects.create(organization=org, date_joined=date(2025, 1, 1), is_main=True,
                                         **{cfg['person_field']: person})
            cls.ctx[domain] = dict(org=org, other=other, person=person,
                                   user=make_citizen(f'eq-{domain}', cfg['link'], org.id),
                                   other_user=make_citizen(f'eq-other-{domain}', cfg['link'], other.id))
        cls.staff = User.objects.create_user(username='eq-staff', password='pw', role='ADMIN', email='eq-staff@x.test')

    def line(self, domain, quantity=3, condition='Good', name='Hand Tractor', org=None, **extra):
        cfg, ctx = DOMAINS[domain], self.ctx[domain]
        return cfg['line'].objects.create(
            organization=org or ctx['org'], equipment_name=name, quantity=quantity, condition=condition, **extra)

    def loan(self, domain, line, quantity=1, status='BORROWED', due_date=None, member=None):
        loan_model = equipment_domain(domain).loan_model
        return loan_model.objects.create(
            equipment=line, member=member or self.ctx[domain]['person'], quantity=quantity, status=status,
            origin='ORGANIZATION', due_date=due_date)


class UnitFigureTests(EquipmentFixture, APITestCase):
    def test_units_out_and_available_follow_the_loans(self):
        for domain in DOMAINS:
            line = self.line(domain, 3)
            self.assertEqual((on_loan(line), movable(line), available(line)), (0, 3, 3))
            self.loan(domain, line, 2)
            line.refresh_from_db()
            self.assertEqual((on_loan(line), movable(line), available(line)), (2, 1, 1))

    def test_only_borrowed_and_return_pending_count_as_out(self):
        self.assertEqual(OUT_STATUSES, ('BORROWED', 'RETURN_PENDING'))
        for domain in DOMAINS:
            line = self.line(domain, 10)
            for status in ('REQUESTED', 'RETURNED', 'REJECTED', 'CANCELLED'):
                self.loan(domain, line, 1, status=status)
            self.assertEqual(on_loan(line), 0, domain)
            self.loan(domain, line, 2, status='BORROWED')
            self.loan(domain, line, 3, status='RETURN_PENDING')
            line.refresh_from_db()
            self.assertEqual(on_loan(line), 5, domain)

    def test_a_line_that_is_not_good_has_nothing_available(self):
        for domain in DOMAINS:
            for condition in ('Needs Repair', 'Not Operational', 'Broken', 'Lost'):
                line = self.line(domain, 4, condition=condition)
                self.assertEqual((available(line), movable(line)), (0, 4), (domain, condition))

    def test_equipment_domain_returns_the_models_and_rejects_unknown_keys(self):
        farmers, fisherfolk = equipment_domain('farmers'), equipment_domain('fisherfolk')
        self.assertIs(farmers.line_model, FarmersOrganizationEquipment)
        self.assertIs(fisherfolk.line_model, FisherfolkOrganizationEquipment)
        self.assertEqual((farmers.person_field, fisherfolk.person_field), ('farmer', 'fisherfolk'))
        with self.assertRaises(KeyError):
            equipment_domain('nope')


class EquipmentPayloadTests(EquipmentFixture, APITestCase):
    def detail(self, domain, user=None):
        self.client.force_authenticate(user or self.ctx[domain]['user'])
        res = self.client.get(f'/api/organizations/{domain}/{self.ctx[domain]["org"].id}/')
        self.assertEqual(res.status_code, 200, res.data)
        return res.data

    def test_the_payload_has_the_figures_and_who_holds_the_units(self):
        yesterday = timezone.localdate() - timedelta(days=1)
        for domain in DOMAINS:
            line = self.line(domain, 3)
            self.loan(domain, line, 2, due_date=yesterday)
            self.loan(domain, line, 1, status='RETURNED', due_date=yesterday)
            row = [e for e in self.detail(domain)['equipment'] if e['id'] == line.id][0]
            self.assertEqual((row['on_loan'], row['available']), (2, 1), domain)
            self.assertEqual(len(row['holders']), 1, domain)
            holder = row['holders'][0]
            self.assertEqual((holder['quantity'], holder['overdue']), (2, True), domain)
            self.assertEqual(holder['member_name'], self.ctx[domain]['person'].full_name)

    def test_a_loan_not_yet_due_is_not_overdue(self):
        for domain in DOMAINS:
            line = self.line(domain, 3)
            self.loan(domain, line, 1, due_date=timezone.localdate() + timedelta(days=2))
            self.loan(domain, line, 1, due_date=None)
            row = [e for e in self.detail(domain)['equipment'] if e['id'] == line.id][0]
            self.assertEqual([h['overdue'] for h in row['holders']], [False, False], domain)

    def test_an_empty_line_is_hidden_from_the_detail_and_the_count(self):
        for domain in DOMAINS:
            shown, hidden = self.line(domain, 2), self.line(domain, 0, name='Rice Thresher')
            ids = [e['id'] for e in self.detail(domain)['equipment']]
            self.assertIn(shown.id, ids, domain)
            self.assertNotIn(hidden.id, ids, domain)
            self.client.force_authenticate(self.staff)
            listing = self.client.get(f'/api/organizations/{domain}/')
            row = [o for o in (listing.data if isinstance(listing.data, list) else listing.data['results'])
                   if o['id'] == self.ctx[domain]['org'].id][0]
            self.assertEqual(row['equipment_count'], 1, domain)

    def test_new_lines_may_be_broken_or_lost_and_unknown_conditions_are_refused(self):
        for domain in DOMAINS:
            self.client.force_authenticate(self.ctx[domain]['user'])
            url = f'/api/organizations/{domain}/{self.ctx[domain]["org"].id}/equipment/'
            for condition in ('Broken', 'Lost'):
                res = self.client.post(url, {'equipment_name': 'Generator', 'quantity': 1, 'condition': condition}, format='json')
                self.assertEqual(res.status_code, 201, (domain, condition, res.data))
                self.assertEqual((res.data['on_loan'], res.data['available']), (0, 0))
            bad = self.client.post(url, {'equipment_name': 'Generator', 'quantity': 1, 'condition': 'Shiny'}, format='json')
            self.assertEqual(bad.status_code, 400, domain)


# ─── Task 2: change condition, repair, history, remove protections ───────────────────────────────────────────────────

class OperationBase(EquipmentFixture, APITestCase):
    def post(self, domain, line, action, body, user=None):
        self.client.force_authenticate(user or self.ctx[domain]['user'])
        return self.client.post(f'/api/organizations/{domain}/equipment/{line.id}/{action}/', body, format='json')

    def lines(self, domain, name='Hand Tractor'):
        cfg, ctx = DOMAINS[domain], self.ctx[domain]
        return {l.condition: l.quantity for l in cfg['line'].objects.filter(organization=ctx['org'], equipment_name=name)}


class ChangeConditionTests(OperationBase):
    def test_splitting_units_off_a_line_makes_a_new_line_then_merges_into_it(self):
        for domain in DOMAINS:
            line = self.line(domain, 3, acquisition_date=date(2024, 5, 1), remarks='from DA')
            res = self.post(domain, line, 'condition', {'quantity': 1, 'condition': 'Broken'})
            self.assertEqual(res.status_code, 200, (domain, res.data))
            self.assertEqual(self.lines(domain), {'Good': 2, 'Broken': 1}, domain)
            broken = DOMAINS[domain]['line'].objects.get(organization=self.ctx[domain]['org'], condition='Broken')
            self.assertEqual((broken.acquisition_date, broken.remarks), (date(2024, 5, 1), 'from DA'), domain)
            self.post(domain, line, 'condition', {'quantity': 1, 'condition': 'Broken'})
            self.assertEqual(self.lines(domain), {'Good': 1, 'Broken': 2}, domain)
            self.assertEqual(DOMAINS[domain]['line'].objects.filter(condition='Broken').count(), 1, domain)

    def test_moving_every_unit_empties_the_source_but_keeps_it(self):
        for domain in DOMAINS:
            line = self.line(domain, 2)
            self.post(domain, line, 'condition', {'quantity': 2, 'condition': 'Lost'})
            line.refresh_from_db()
            self.assertEqual(line.quantity, 0, domain)
            self.assertEqual(self.lines(domain), {'Good': 0, 'Lost': 2}, domain)

    def test_bad_requests_are_refused(self):
        for domain in DOMAINS:
            line = self.line(domain, 3)
            self.loan(domain, line, 2)
            cases = [
                ({'quantity': 2, 'condition': 'Broken'}, 'Only 1 units can be moved'),
                ({'quantity': 0, 'condition': 'Broken'}, None),
                ({'quantity': 1, 'condition': 'Good'}, None),
                ({'quantity': 1, 'condition': 'Shiny'}, None),
                ({'quantity': 'x', 'condition': 'Broken'}, None),
                ({'condition': 'Broken'}, None),
            ]
            for body, message in cases:
                res = self.post(domain, line, 'condition', body)
                self.assertEqual(res.status_code, 400, (domain, body, res.data))
                if message:
                    self.assertIn(message, str(res.data))
            self.assertEqual(self.lines(domain), {'Good': 3}, domain)

    def test_a_lost_unit_can_be_found_again(self):
        for domain in DOMAINS:
            lost = self.line(domain, 1, condition='Lost')
            self.line(domain, 2)
            self.assertEqual(self.post(domain, lost, 'condition', {'quantity': 1, 'condition': 'Good'}).status_code, 200)
            self.assertEqual(self.lines(domain), {'Lost': 0, 'Good': 3}, domain)

    def test_other_organizations_and_plain_citizens_are_kept_out(self):
        for domain in DOMAINS:
            theirs = self.line(domain, 2, org=self.ctx[domain]['other'])
            res = self.post(domain, theirs, 'condition', {'quantity': 1, 'condition': 'Broken'})
            self.assertEqual(res.status_code, 404, domain)
            record_type = 'FARMER' if domain == 'farmers' else 'FISHERFOLK'
            plain = make_citizen(f'plain-{domain}-{next(_N)}', record_type, make_person(domain, 'Plain').id)
            mine = self.line(domain, 2, name='Generator')
            body = {'quantity': 1, 'condition': 'Broken'}
            self.assertEqual(self.post(domain, mine, 'condition', body, user=plain).status_code, 403, domain)
            self.assertEqual(self.post(domain, mine, 'condition', body, user=self.staff).status_code, 200, domain)


class RepairTests(OperationBase):
    def body(self, **over):
        data = {'quantity': 1, 'repaired_on': str(timezone.localdate()), 'description': 'Replaced the belt', 'cost': '350.50'}
        data.update(over)
        return data

    def test_a_repair_moves_units_to_good_and_writes_the_log(self):
        for domain in DOMAINS:
            for condition in ('Needs Repair', 'Not Operational', 'Broken'):
                broken = self.line(domain, 2, condition=condition, name=f'Pump {condition}')
                self.line(domain, 1, name=f'Pump {condition}')
                res = self.post(domain, broken, 'repair', self.body())
                self.assertEqual(res.status_code, 200, (domain, condition, res.data))
                self.assertEqual(self.lines(domain, f'Pump {condition}'), {condition: 1, 'Good': 2}, (domain, condition))
                row = DOMAINS[domain]['line'].objects.get(pk=broken.id).repairs.get()
                self.assertEqual((row.quantity, row.from_condition, str(row.cost)), (1, condition, '350.50'))
                self.assertEqual(row.recorded_by, self.ctx[domain]['user'])

    def test_a_repair_creates_the_good_line_when_there_is_none(self):
        for domain in DOMAINS:
            broken = self.line(domain, 2, condition='Broken')
            self.assertEqual(self.post(domain, broken, 'repair', self.body(quantity=2, cost=None)).status_code, 200)
            self.assertEqual(self.lines(domain), {'Broken': 0, 'Good': 2}, domain)

    def test_refused_cases(self):
        for domain in DOMAINS:
            good, lost = self.line(domain, 2, name='A'), self.line(domain, 2, condition='Lost', name='B')
            broken = self.line(domain, 3, condition='Broken', name='C')
            self.loan(domain, broken, 2)
            self.assertEqual(self.post(domain, good, 'repair', self.body()).status_code, 400, domain)
            self.assertEqual(self.post(domain, lost, 'repair', self.body()).status_code, 400, domain)
            future = str(timezone.localdate() + timedelta(days=2))
            for bad in (dict(repaired_on=future), dict(cost='-1'), dict(description=''), dict(description='  '),
                        dict(quantity=0), dict(quantity=2), dict(repaired_on='soon')):
                self.assertEqual(self.post(domain, broken, 'repair', self.body(**bad)).status_code, 400, (domain, bad))
            self.assertEqual(DOMAINS[domain]['line'].objects.get(pk=broken.id).repairs.count(), 0, domain)


class HistoryAndRemoveTests(OperationBase):
    def test_history_lists_repairs_and_loans_newest_first(self):
        for domain in DOMAINS:
            broken = self.line(domain, 3, condition='Broken')
            self.post(domain, broken, 'repair', {'quantity': 1, 'repaired_on': '2026-01-05', 'description': 'First fix'})
            self.post(domain, broken, 'repair', {'quantity': 1, 'repaired_on': '2026-03-01', 'description': 'Second fix'})
            self.loan(domain, broken, 1, status='RETURNED')
            self.client.force_authenticate(self.ctx[domain]['user'])
            res = self.client.get(f'/api/organizations/{domain}/equipment/{broken.id}/history/')
            self.assertEqual(res.status_code, 200, domain)
            self.assertEqual([r['description'] for r in res.data['repairs']], ['Second fix', 'First fix'], domain)
            self.assertEqual(len(res.data['loans']), 1, domain)
            theirs = self.line(domain, 1, org=self.ctx[domain]['other'])
            self.assertEqual(self.client.get(f'/api/organizations/{domain}/equipment/{theirs.id}/history/').status_code, 404, domain)

    def test_history_follows_the_equipment_across_its_condition_lines(self):
        """A repair is recorded on the Broken line; once those units are Good again (the Broken line is empty and hidden)
        the Good line's history must still show it, and another kind of equipment must not leak in."""
        for domain in DOMAINS:
            good = self.line(domain, 3)
            self.post(domain, good, 'condition', {'quantity': 1, 'condition': 'Broken'})
            broken = DOMAINS[domain]['line'].objects.get(organization=self.ctx[domain]['org'], condition='Broken')
            self.post(domain, broken, 'repair', {'quantity': 1, 'repaired_on': '2026-02-01', 'description': 'New seal'})
            other = self.line(domain, 2, name='Rice Thresher', condition='Broken')
            self.post(domain, other, 'repair', {'quantity': 1, 'repaired_on': '2026-02-02', 'description': 'Not this one'})
            good = DOMAINS[domain]['line'].objects.get(organization=self.ctx[domain]['org'], equipment_name='Hand Tractor', condition='Good')
            self.assertEqual(good.quantity, 3, domain)
            res = self.client.get(f'/api/organizations/{domain}/equipment/{good.id}/history/')
            self.assertEqual([r['description'] for r in res.data['repairs']], ['New seal'], domain)

    def remove(self, domain, line):
        self.client.force_authenticate(self.ctx[domain]['user'])
        return self.client.delete(f'/api/organizations/{domain}/equipment/{line.id}/')

    def test_a_plain_line_is_removed(self):
        for domain in DOMAINS:
            line = self.line(domain, 2)
            self.assertEqual(self.remove(domain, line).status_code, 204, domain)

    def test_a_line_with_history_or_units_out_cannot_be_removed(self):
        for domain in DOMAINS:
            with_loan = self.line(domain, 2, name='A')
            self.loan(domain, with_loan, 1)
            with_request = self.line(domain, 2, name='B')
            self.loan(domain, with_request, 1, status='REQUESTED')
            with_repair = self.line(domain, 2, condition='Broken', name='C')
            self.post(domain, with_repair, 'repair', {'quantity': 1, 'repaired_on': '2026-01-05', 'description': 'Fixed'})
            for line in (with_loan, with_request, with_repair):
                res = self.remove(domain, line)
                self.assertEqual(res.status_code, 409, (domain, line.equipment_name))
                self.assertIn('Mark it Lost or Broken instead', str(res.data))
                self.assertTrue(DOMAINS[domain]['line'].objects.filter(pk=line.id).exists())


class AddEquipmentValidationTests(EquipmentFixture, APITestCase):
    """An organization adding a line by hand: 'Other' needs its own name, units at least 1, no future acquisition date."""

    def add(self, domain, **body):
        self.client.force_authenticate(self.ctx[domain]['user'])
        payload = {'equipment_name': DOMAINS[domain]['line'].EquipmentName.values[0], 'quantity': 1, 'condition': 'Good'}
        payload.update(body)
        return self.client.post(f'/api/organizations/{domain}/{self.ctx[domain]["org"].id}/equipment/', payload, format='json')

    def test_other_needs_a_name(self):
        for domain in DOMAINS:
            before = DOMAINS[domain]['line'].objects.count()
            for blank in ('', '   ', None):
                res = self.add(domain, equipment_name='Other', equipment_name_other=blank)
                self.assertEqual(res.status_code, 400, (domain, blank, res.data))
            self.assertEqual(DOMAINS[domain]['line'].objects.count(), before, domain)
            ok = self.add(domain, equipment_name='Other', equipment_name_other='  Seed Drill ')
            self.assertEqual(ok.status_code, 201, (domain, ok.data))
            self.assertEqual(ok.data['equipment_name_other'], 'Seed Drill', domain)

    def test_a_listed_name_drops_a_stray_other_text(self):
        for domain in DOMAINS:
            res = self.add(domain, equipment_name_other='leftover')
            self.assertEqual(res.status_code, 201, (domain, res.data))
            self.assertEqual(res.data['equipment_name_other'] or '', '', domain)

    def test_units_and_dates_are_checked(self):
        for domain in DOMAINS:
            for qty in (0, -1):
                self.assertEqual(self.add(domain, quantity=qty).status_code, 400, (domain, qty))
            self.assertEqual(self.add(domain, acquisition_date='2999-01-01').status_code, 400, domain)
            self.assertEqual(self.add(domain, quantity=1, acquisition_date='2024-01-01').status_code, 201, domain)
