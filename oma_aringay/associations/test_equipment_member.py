"""Equipment loans, member side: a farmer or fisherfolk account sees what its organizations can lend, requests, cancels and
says "I returned it"; the organization still confirms the return."""
from datetime import date, timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from associations import equipment_ops
from associations.test_equipment_units import DOMAINS, EquipmentFixture, make_citizen, make_person
from core.models import Notification

RECORD_TYPE = {'farmers': 'FARMER', 'fisherfolk': 'FISHERFOLK'}
BASE = '/api/organizations/my-equipment/'


class MemberBase(EquipmentFixture, APITestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.members = {}
        for domain, cfg in DOMAINS.items():
            ctx = cls.ctx[domain]
            cls.members[domain] = make_citizen(f'eqmem-{domain}', RECORD_TYPE[domain], ctx['person'].id)

    def get(self, user):
        self.client.force_authenticate(user)
        return self.client.get(BASE)

    def post(self, path, body=None, user=None, domain=None):
        self.client.force_authenticate(user or self.members[domain])
        return self.client.post(f'{BASE}{path}', body or {}, format='json')

    def request_units(self, domain, line, quantity=1, **extra):
        body = {'equipment': line.id, 'quantity': quantity}
        body.update(extra)
        return self.post('request/', body, domain=domain)

    def my_loan(self, domain, line, status='REQUESTED'):
        return self.loan(domain, line, 1, status=status)


class ListTests(MemberBase):
    def test_a_member_sees_only_lendable_good_lines_of_their_organizations(self):
        for domain in DOMAINS:
            ctx = self.ctx[domain]
            good = self.line(domain, 3, name='Hand Tractor')
            broken = self.line(domain, 2, condition='Broken', name='Rice Thresher')
            empty = self.line(domain, 0, name='Generator')
            fully_out = self.line(domain, 1, name='Dryer')
            self.loan(domain, fully_out, 1)
            theirs = self.line(domain, 4, name='Water Pump/Irrigation Pump', org=ctx['other'])
            res = self.get(self.members[domain])
            self.assertEqual(res.status_code, 200, (domain, res.data))
            self.assertEqual(len(res.data), 1, domain)
            group = res.data[0]
            self.assertEqual(group['organization']['id'], ctx['org'].id)
            ids = [e['id'] for e in group['equipment']]
            self.assertEqual(ids, [good.id], domain)
            self.assertEqual(group['equipment'][0]['available'], 3, domain)
            for hidden in (broken, empty, fully_out, theirs):
                self.assertNotIn(hidden.id, ids, domain)

    def test_a_member_of_two_organizations_gets_two_groups_and_never_crosses_them(self):
        """Review focus: ids never cross organizations."""
        for domain in DOMAINS:
            ctx = self.ctx[domain]
            DOMAINS[domain]['member'].objects.create(
                organization=ctx['other'], date_joined=date(2025, 1, 1), is_main=False,
                **{DOMAINS[domain]['person_field']: ctx['person']})
            mine = self.line(domain, 2, name='Hand Tractor')
            other = self.line(domain, 2, name='Rice Thresher', org=ctx['other'])
            res = self.get(self.members[domain])
            by_org = {g['organization']['id']: [e['id'] for e in g['equipment']] for g in res.data}
            self.assertEqual(by_org, {ctx['org'].id: [mine.id], ctx['other'].id: [other.id]}, domain)
            self.assertEqual(self.request_units(domain, other, 1).status_code, 201, domain)
            counts = {g['organization']['id']: len(g['loans']) for g in self.get(self.members[domain]).data}
            self.assertEqual(counts, {ctx['org'].id: 0, ctx['other'].id: 1}, domain)

    def test_a_deactivated_membership_and_a_non_member_see_nothing(self):
        for domain in DOMAINS:
            ctx = self.ctx[domain]
            self.line(domain, 2)
            DOMAINS[domain]['member'].objects.filter(organization=ctx['org']).update(is_active=False)
            self.assertEqual(self.get(self.members[domain]).data, [], domain)
            outsider = make_citizen(f'eqout-{domain}', RECORD_TYPE[domain], make_person(domain, 'Out').id)
            self.assertEqual(self.get(outsider).data, [], domain)

    def test_other_accounts_are_refused(self):
        for domain in DOMAINS:
            self.assertEqual(self.get(self.ctx[domain]['user']).status_code, 403, domain)
        self.assertEqual(self.get(self.staff).status_code, 403)

    def test_the_member_sees_only_their_own_loans(self):
        for domain in DOMAINS:
            line = self.line(domain, 5)
            mine = self.loan(domain, line, 1)
            self.loan(domain, line, 1, member=make_person(domain, 'Someone Else'))
            loans = self.get(self.members[domain]).data[0]['loans']
            self.assertEqual([l['id'] for l in loans], [mine.id], domain)


class RequestTests(MemberBase):
    def test_a_request_reserves_nothing_and_notifies_the_organization(self):
        for domain in DOMAINS:
            line = self.line(domain, 2)
            res = self.request_units(domain, line, 2, due_date=str(timezone.localdate() + timedelta(days=5)), note='For the planting')
            self.assertEqual(res.status_code, 201, (domain, res.data))
            self.assertEqual((res.data['status'], res.data['origin'], res.data['member_note']), ('REQUESTED', 'MEMBER', 'For the planting'))
            line.refresh_from_db()
            self.assertEqual(equipment_ops.available(line), 2, domain)
            note = Notification.objects.get(recipient=self.ctx[domain]['user'], verb='requested to borrow equipment')
            self.assertEqual(note.record_type, 'equipment_loan', domain)

    def test_refused_requests(self):
        for domain in DOMAINS:
            ctx = self.ctx[domain]
            good, broken = self.line(domain, 2), self.line(domain, 2, condition='Broken', name='B')
            theirs = self.line(domain, 2, name='C', org=ctx['other'])
            for line, body, text in (
                (good, dict(quantity=3), 'Only 2 units are available.'),
                (good, dict(quantity=0), None),
                (good, dict(quantity='x'), None),
                (good, dict(due_date='soon'), None),
                (broken, dict(quantity=1), 'Good condition'),
                (theirs, dict(quantity=1), 'not available to you'),
            ):
                res = self.request_units(domain, line, **{'quantity': 1, **body})
                self.assertEqual(res.status_code, 400, (domain, body, res.data))
                if text:
                    self.assertIn(text, str(res.data), (domain, body))
            self.assertEqual(self.post('request/', {'equipment': 999999, 'quantity': 1}, domain=domain).status_code, 400, domain)

    def test_only_one_open_request_per_line(self):
        for domain in DOMAINS:
            line = self.line(domain, 3)
            self.assertEqual(self.request_units(domain, line, 1).status_code, 201, domain)
            again = self.request_units(domain, line, 1)
            self.assertEqual(again.status_code, 400, domain)
            self.assertIn('already have a request', str(again.data), domain)

    def test_organization_accounts_cannot_use_the_member_endpoints(self):
        for domain in DOMAINS:
            line = self.line(domain, 2)
            self.assertEqual(self.post('request/', {'equipment': line.id, 'quantity': 1}, user=self.ctx[domain]['user']).status_code, 403, domain)


class CancelAndReturnTests(MemberBase):
    def test_cancel_only_your_own_open_request(self):
        for domain in DOMAINS:
            line = self.line(domain, 3)
            mine = self.my_loan(domain, line, 'REQUESTED')
            theirs = self.loan(domain, line, 1, status='REQUESTED', member=make_person(domain, 'Z'))
            self.assertEqual(self.post(f'loans/{theirs.id}/cancel/', domain=domain).status_code, 404, domain)
            self.assertEqual(self.post(f'loans/{mine.id}/cancel/', domain=domain).status_code, 200, domain)
            mine.refresh_from_db()
            self.assertEqual(mine.status, 'CANCELLED', domain)
            self.assertEqual(self.post(f'loans/{mine.id}/cancel/', domain=domain).status_code, 400, domain)
            borrowed = self.my_loan(domain, line, 'BORROWED')
            self.assertEqual(self.post(f'loans/{borrowed.id}/cancel/', domain=domain).status_code, 400, domain)

    def test_i_returned_it_marks_return_pending_and_the_organization_confirms(self):
        for domain in DOMAINS:
            line = self.line(domain, 3)
            loan = self.my_loan(domain, line, 'BORROWED')
            res = self.post(f'loans/{loan.id}/return/', domain=domain)
            self.assertEqual(res.status_code, 200, (domain, res.data))
            loan.refresh_from_db()
            self.assertEqual(loan.status, 'RETURN_PENDING', domain)
            self.assertIsNotNone(loan.return_requested_at)
            line.refresh_from_db()
            self.assertEqual(equipment_ops.on_loan(line), 1, domain)
            self.assertTrue(Notification.objects.filter(recipient=self.ctx[domain]['user'], verb='says the equipment was returned').exists(), domain)
            self.assertEqual(self.post(f'loans/{loan.id}/return/', domain=domain).status_code, 400, domain)
            self.client.force_authenticate(self.ctx[domain]['user'])
            confirm = self.client.post(f'/api/organizations/{domain}/equipment-loans/{loan.id}/return/', {}, format='json')
            self.assertEqual(confirm.status_code, 200, domain)
            loan.refresh_from_db()
            self.assertEqual(loan.status, 'RETURNED', domain)

    def test_return_needs_a_loan_that_is_out_and_your_own(self):
        for domain in DOMAINS:
            line = self.line(domain, 3)
            for status in ('REQUESTED', 'RETURNED', 'CANCELLED'):
                loan = self.my_loan(domain, line, status)
                self.assertEqual(self.post(f'loans/{loan.id}/return/', domain=domain).status_code, 400, (domain, status))
            foreign = self.loan(domain, line, 1, member=make_person(domain, 'Not Mine'))
            self.assertEqual(self.post(f'loans/{foreign.id}/return/', domain=domain).status_code, 404, domain)

    def test_a_deactivated_members_loan_can_still_be_returned_by_the_organization(self):
        for domain in DOMAINS:
            ctx = self.ctx[domain]
            line = self.line(domain, 2)
            loan = self.my_loan(domain, line, 'BORROWED')
            DOMAINS[domain]['member'].objects.filter(organization=ctx['org']).update(is_active=False)
            self.client.force_authenticate(ctx['user'])
            res = self.client.post(f'/api/organizations/{domain}/equipment-loans/{loan.id}/return/', {}, format='json')
            self.assertEqual(res.status_code, 200, domain)
