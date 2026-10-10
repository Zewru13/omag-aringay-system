"""Organization equipment loans, organization side: lend, approve, reject, return (with a per-condition breakdown), the list and
its filters, notifications, and the race on the last unit."""
from datetime import timedelta
from unittest import mock

from django.utils import timezone
from rest_framework.test import APITestCase

from associations import equipment_ops
from associations.test_equipment_units import DOMAINS, EquipmentFixture, make_citizen, make_person
from core.models import Notification

TYPE_OF = {'farmers': 'FARMER', 'fisherfolk': 'FISHERFOLK'}


class LoanBase(EquipmentFixture, APITestCase):
    def post(self, path, body=None, user=None):
        self.client.force_authenticate(user or self.current_user)
        return self.client.post(f'/api/organizations/{path}', body or {}, format='json')

    def lend(self, domain, line, quantity=1, member=None, user=None, **extra):
        self.current_user = self.ctx[domain]['user']
        body = {'member': (member or self.ctx[domain]['person']).id, 'quantity': quantity}
        body.update(extra)
        return self.post(f'{domain}/equipment/{line.id}/lend/', body, user=user)

    def act(self, domain, loan, action, body=None, user=None):
        self.current_user = self.ctx[domain]['user']
        return self.post(f'{domain}/equipment-loans/{loan.id}/{action}/', body, user=user)

    def reload(self, loan):
        loan.refresh_from_db()
        return loan

    def lines(self, domain, name='Hand Tractor'):
        cfg, ctx = DOMAINS[domain], self.ctx[domain]
        return {l.condition: l.quantity for l in cfg['line'].objects.filter(organization=ctx['org'], equipment_name=name)}


class LendTests(LoanBase):
    def test_lending_takes_units_out(self):
        for domain in DOMAINS:
            line = self.line(domain, 3)
            res = self.lend(domain, line, 2, due_date=str(timezone.localdate() + timedelta(days=7)))
            self.assertEqual(res.status_code, 201, (domain, res.data))
            self.assertEqual((res.data['status'], res.data['origin'], res.data['quantity']), ('BORROWED', 'ORGANIZATION', 2))
            self.assertIsNotNone(res.data['borrowed_at'])
            line.refresh_from_db()
            self.assertEqual((equipment_ops.on_loan(line), equipment_ops.available(line)), (2, 1), domain)

    def test_refused_lends(self):
        for domain in DOMAINS:
            ctx = self.ctx[domain]
            good, broken = self.line(domain, 2), self.line(domain, 2, condition='Broken', name='B')
            outsider = make_person(domain, 'Outsider')
            inactive = make_person(domain, 'Gone')
            DOMAINS[domain]['member'].objects.create(
                organization=ctx['org'], date_joined=timezone.localdate(), is_main=False, is_active=False,
                **{DOMAINS[domain]['person_field']: inactive})
            other_domain = 'fisherfolk' if domain == 'farmers' else 'farmers'
            foreign = make_person(other_domain, 'Foreign')
            cases = [
                (good, dict(quantity=3), 'Only 2 units are available.'),
                (good, dict(quantity=0), None),
                (good, dict(quantity='x'), None),
                (good, dict(member=outsider), 'not an active member'),
                (good, dict(member=inactive), 'not an active member'),
                (good, dict(member=foreign), None),
                (good, dict(due_date='soon'), None),
                (broken, dict(quantity=1), 'Good condition'),
            ]
            for line, change, message in cases:
                body = {'member': ctx['person'].id, 'quantity': 1}
                for key, value in change.items():
                    body[key] = value.id if hasattr(value, 'id') else value
                self.current_user = ctx['user']
                res = self.post(f'{domain}/equipment/{line.id}/lend/', body)
                self.assertEqual(res.status_code, 400, (domain, change, res.data))
                if message:
                    self.assertIn(message, str(res.data), (domain, change))
            self.assertEqual(DOMAINS[domain]['line'].objects.get(pk=good.id).loans.count(), 0, domain)

    def test_another_organizations_line_is_404_and_staff_may_lend(self):
        for domain in DOMAINS:
            theirs = self.line(domain, 2, org=self.ctx[domain]['other'])
            self.assertEqual(self.lend(domain, theirs, 1).status_code, 404, domain)
            mine = self.line(domain, 2, name='Generator')
            self.assertEqual(self.lend(domain, mine, 1, user=self.staff).status_code, 201, domain)

    def test_the_last_unit_cannot_be_lent_twice(self):
        for domain in DOMAINS:
            line = self.line(domain, 1)
            real = equipment_ops.lock_line

            def take_the_last_unit_first(dom, pk):
                locked = real(dom, pk)
                if not getattr(take_the_last_unit_first, 'done', False):
                    take_the_last_unit_first.done = True
                    dom.loan_model.objects.create(equipment=locked, member=self.ctx[domain]['person'], quantity=1,
                                                  status='BORROWED', origin='ORGANIZATION')
                return locked

            with mock.patch('associations.equipment_ops.lock_line', side_effect=take_the_last_unit_first):
                res = self.lend(domain, line, 1)
            self.assertEqual(res.status_code, 400, domain)
            self.assertIn('Only 0 units are available.', str(res.data), domain)


class ReturnTests(LoanBase):
    def test_returning_everything_good_frees_the_units(self):
        for domain in DOMAINS:
            line = self.line(domain, 3)
            loan = self.loan(domain, line, 2)
            res = self.act(domain, loan, 'return')
            self.assertEqual(res.status_code, 200, (domain, res.data))
            loan = self.reload(loan)
            self.assertEqual((loan.status, loan.return_breakdown), ('RETURNED', {'Good': 2}), domain)
            self.assertIsNotNone(loan.returned_at)
            line.refresh_from_db()
            self.assertEqual((line.quantity, equipment_ops.available(line)), (3, 3), domain)

    def test_a_mixed_return_moves_units_to_the_right_lines(self):
        for domain in DOMAINS:
            line = self.line(domain, 3)
            loan = self.loan(domain, line, 3)
            breakdown = [{'condition': 'Good', 'quantity': 1}, {'condition': 'Broken', 'quantity': 1}, {'condition': 'Lost', 'quantity': 1}]
            res = self.act(domain, loan, 'return', {'breakdown': breakdown})
            self.assertEqual(res.status_code, 200, (domain, res.data))
            self.assertEqual(self.lines(domain), {'Good': 1, 'Broken': 1, 'Lost': 1}, domain)
            self.assertEqual(self.reload(loan).return_breakdown, {'Good': 1, 'Broken': 1, 'Lost': 1}, domain)

    def test_bad_breakdowns_and_wrong_states_are_refused(self):
        for domain in DOMAINS:
            line = self.line(domain, 3)
            loan = self.loan(domain, line, 2)
            for breakdown in (
                [{'condition': 'Good', 'quantity': 1}],
                [{'condition': 'Good', 'quantity': 3}],
                [{'condition': 'Shiny', 'quantity': 2}],
                [{'condition': 'Good', 'quantity': -1}, {'condition': 'Broken', 'quantity': 3}],
                [{'condition': 'Good', 'quantity': 1.5}, {'condition': 'Broken', 'quantity': 0.5}],
                'Good',
            ):
                res = self.act(domain, loan, 'return', {'breakdown': breakdown})
                self.assertEqual(res.status_code, 400, (domain, breakdown, res.data))
            self.assertIn('must add up to 2 units', str(self.act(domain, loan, 'return', {'breakdown': [{'condition': 'Good', 'quantity': 1}]}).data))
            self.assertEqual(self.reload(loan).status, 'BORROWED', domain)
            done = self.loan(domain, line, 1, status='RETURNED')
            self.assertEqual(self.act(domain, done, 'return').status_code, 400, domain)
            requested = self.loan(domain, line, 1, status='REQUESTED')
            self.assertEqual(self.act(domain, requested, 'return').status_code, 400, domain)

    def test_a_return_works_after_other_units_were_moved_away(self):
        """Review focus: the loaned units still go back to a line that was reduced meanwhile."""
        for domain in DOMAINS:
            line = self.line(domain, 3)
            loan = self.loan(domain, line, 1)
            self.current_user = self.ctx[domain]['user']
            moved = self.post(f'{domain}/equipment/{line.id}/condition/', {'quantity': 2, 'condition': 'Broken'})
            self.assertEqual(moved.status_code, 200, (domain, moved.data))
            self.assertEqual(self.act(domain, loan, 'return').status_code, 200, domain)
            self.assertEqual(self.lines(domain), {'Good': 1, 'Broken': 2}, domain)

    def test_lost_units_stay_attributed_in_the_loan_and_the_history(self):
        for domain in DOMAINS:
            line = self.line(domain, 2)
            loan = self.loan(domain, line, 2)
            self.act(domain, loan, 'return', {'breakdown': [{'condition': 'Good', 'quantity': 1}, {'condition': 'Lost', 'quantity': 1}]})
            self.client.force_authenticate(self.ctx[domain]['user'])
            history = self.client.get(f'/api/organizations/{domain}/equipment/{line.id}/history/')
            self.assertEqual(history.status_code, 200)
            entry = history.data['loans'][0]
            self.assertEqual((entry['member_name'], entry['return_breakdown']), (self.ctx[domain]['person'].full_name, {'Good': 1, 'Lost': 1}), domain)

    def test_a_return_that_was_pending_is_confirmed_by_the_organization(self):
        for domain in DOMAINS:
            line = self.line(domain, 2)
            loan = self.loan(domain, line, 2, status='RETURN_PENDING')
            self.assertEqual(self.act(domain, loan, 'return').status_code, 200, domain)
            self.assertEqual(self.reload(loan).status, 'RETURNED', domain)


class DecisionTests(LoanBase):
    def test_approving_a_request_takes_the_units_out(self):
        for domain in DOMAINS:
            line = self.line(domain, 2)
            request = self.loan(domain, line, 1, status='REQUESTED')
            res = self.act(domain, request, 'approve')
            self.assertEqual(res.status_code, 200, (domain, res.data))
            request = self.reload(request)
            self.assertEqual(request.status, 'BORROWED', domain)
            self.assertIsNotNone(request.borrowed_at)
            self.assertEqual(request.decided_by, self.ctx[domain]['user'])
            line.refresh_from_db()
            self.assertEqual(equipment_ops.available(line), 1, domain)

    def test_the_second_approval_for_the_last_unit_is_refused(self):
        """Review focus: two requests for the last unit, approved in a row."""
        for domain in DOMAINS:
            line = self.line(domain, 1)
            first = self.loan(domain, line, 1, status='REQUESTED')
            second = self.loan(domain, line, 1, status='REQUESTED', member=make_person(domain, 'Second'))
            self.assertEqual(self.act(domain, first, 'approve').status_code, 200, domain)
            res = self.act(domain, second, 'approve')
            self.assertEqual(res.status_code, 400, domain)
            self.assertIn('Only 0 units are available.', str(res.data), domain)
            self.assertEqual(self.reload(second).status, 'REQUESTED', domain)

    def test_rejecting_stores_the_reason_and_frees_nothing(self):
        for domain in DOMAINS:
            line = self.line(domain, 2)
            request = self.loan(domain, line, 1, status='REQUESTED')
            res = self.act(domain, request, 'reject', {'reason': 'x' * 300})
            self.assertEqual(res.status_code, 200, (domain, res.data))
            request = self.reload(request)
            self.assertEqual(request.status, 'REJECTED', domain)
            self.assertEqual(len(request.reject_reason), 255, domain)
            self.assertEqual(self.act(domain, request, 'approve').status_code, 400, domain)
            self.assertEqual(self.act(domain, request, 'reject').status_code, 400, domain)

    def test_only_requests_can_be_approved_or_rejected(self):
        for domain in DOMAINS:
            line = self.line(domain, 3)
            for status in ('BORROWED', 'RETURNED', 'CANCELLED'):
                loan = self.loan(domain, line, 1, status=status)
                self.assertEqual(self.act(domain, loan, 'approve').status_code, 400, (domain, status))
                self.assertEqual(self.act(domain, loan, 'reject').status_code, 400, (domain, status))

    def test_another_organizations_loan_is_404(self):
        for domain in DOMAINS:
            theirs_line = self.line(domain, 2, org=self.ctx[domain]['other'])
            theirs = self.loan(domain, theirs_line, 1, status='REQUESTED')
            for action in ('approve', 'reject', 'return'):
                self.assertEqual(self.act(domain, theirs, action).status_code, 404, (domain, action))


class ListTests(LoanBase):
    def listing(self, domain, user=None, **params):
        self.client.force_authenticate(user or self.ctx[domain]['user'])
        return self.client.get(f'/api/organizations/{domain}/{self.ctx[domain]["org"].id}/equipment-loans/', params)

    def test_the_list_and_every_filter(self):
        today = timezone.localdate()
        for domain in DOMAINS:
            tractor, pump = self.line(domain, 5), self.line(domain, 5, name='Water Pump/Irrigation Pump')
            ana = make_person(domain, 'Ana')
            DOMAINS[domain]['member'].objects.create(organization=self.ctx[domain]['org'], date_joined=today, is_main=False,
                                                     **{DOMAINS[domain]['person_field']: ana})
            overdue = self.loan(domain, tractor, 1, due_date=today - timedelta(days=2))
            fresh = self.loan(domain, pump, 1, due_date=today + timedelta(days=2), member=ana)
            asked = self.loan(domain, pump, 1, status='REQUESTED')
            done = self.loan(domain, tractor, 1, status='RETURNED', due_date=today - timedelta(days=9))
            ids = lambda res: sorted(r['id'] for r in res.data)
            self.assertEqual(ids(self.listing(domain)), sorted([overdue.id, fresh.id, asked.id, done.id]), domain)
            self.assertEqual(ids(self.listing(domain, status='REQUESTED')), [asked.id], domain)
            self.assertEqual(ids(self.listing(domain, status='borrowed')), sorted([overdue.id, fresh.id]), domain)
            self.assertEqual(ids(self.listing(domain, overdue='1')), [overdue.id], domain)
            self.assertEqual(ids(self.listing(domain, member='ana')), [fresh.id], domain)
            self.assertEqual(ids(self.listing(domain, equipment='pump')), sorted([fresh.id, asked.id]), domain)
            self.assertEqual(self.listing(domain, overdue='1').data[0]['overdue'], True, domain)

    def test_scoping(self):
        for domain in DOMAINS:
            line = self.line(domain, 2)
            self.loan(domain, line, 1)
            theirs_line = self.line(domain, 2, org=self.ctx[domain]['other'])
            self.loan(domain, theirs_line, 1)
            self.assertEqual(len(self.listing(domain).data), 1, domain)
            self.assertEqual(self.listing(domain, user=self.ctx[domain]['other_user']).status_code, 403, domain)
            self.assertEqual(len(self.listing(domain, user=self.staff).data), 1, domain)


class NotificationTests(LoanBase):
    def member_account(self, domain):
        return make_citizen(f'eqm-{domain}-{id(self)}', TYPE_OF[domain], self.ctx[domain]['person'].id)

    def test_decisions_and_the_confirmed_return_reach_the_members_account(self):
        for domain in DOMAINS:
            member = self.member_account(domain)
            line = self.line(domain, 4)
            approved, rejected = self.loan(domain, line, 1, status='REQUESTED'), self.loan(domain, line, 1, status='REQUESTED')
            self.act(domain, approved, 'approve')
            self.act(domain, rejected, 'reject', {'reason': 'Not available that week'})
            self.act(domain, approved, 'return')
            verbs = list(Notification.objects.filter(recipient=member).order_by('id').values_list('verb', flat=True))
            self.assertEqual(verbs, ['approved your equipment request', 'rejected your equipment request',
                                     'confirmed the return of your equipment'], domain)
            rejection = Notification.objects.filter(recipient=member, verb='rejected your equipment request').get()
            self.assertEqual(rejection.detail, 'Not available that week', domain)
            details = list(Notification.objects.filter(recipient=member).order_by('id').values_list('detail', flat=True))
            self.assertEqual((details[0], details[2]), ('', '1 Good'), domain)  # the label already names the equipment and units

    def test_a_member_without_an_account_is_skipped_silently(self):
        for domain in DOMAINS:
            line = self.line(domain, 2)
            request = self.loan(domain, line, 1, status='REQUESTED')
            self.assertEqual(self.act(domain, request, 'approve').status_code, 200, domain)
            self.assertEqual(Notification.objects.count(), 0, domain)
