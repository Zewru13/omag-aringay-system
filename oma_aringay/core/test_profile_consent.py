"""Profile change requests: an organization's reviewed change needs one Admin AND one Focal Person approval; the
organization may also request its email address and contact person. Farmer/fisherfolk requests and old rows keep the
one-approval behaviour, which this module also pins (it had no tests before)."""
import itertools
from datetime import date
from unittest import mock

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from associations.models import FarmersOrganization, FisherfolkOrganization
from core.models import Notification, ProfileChangeRequest
from farmers.models import Farmer

_REG = itertools.count(1)
_RSBSA = itertools.count(1)
User = get_user_model()

ORGS = {
    'farmers': ('FARMERS_ORG', FarmersOrganization),
    'fisherfolk': ('FISHERFOLK_ORG', FisherfolkOrganization),
}
URL = '/api/profile/change-requests/'
STAFF_URL = '/api/staff/change-requests/'


def make_org(model, name):
    return model.objects.create(
        name=name, barangay='Alaska', registration_number='REG-%04d' % next(_REG), date_organized=date(2020, 1, 1),
        date_registered=date(2020, 2, 1), registration_agency='SEC', contact_person='Pat Contact',
        contact_number='09171234567', email_address='org@old.test')


def make_farmer(first):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name=first, last_name='Consent', gender='Male',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


def make_citizen(username, record_type, record_id):
    user = User.objects.create_user(username=username, password='pw', role='CITIZEN', email=f'{username}@x.test')
    UserLinkedRecord.objects.create(user=user, record_type=record_type, record_id=record_id, is_active=True)
    return user


def make_staff(username, role):
    return User.objects.create_user(username=username, password='pw', role=role, email=f'{username}@x.test',
                                    full_name=username.title())


class ConsentFixture:
    @classmethod
    def setUpTestData(cls):
        cls.orgs, cls.org_users = {}, {}
        for domain, (rtype, model) in ORGS.items():
            cls.orgs[domain] = make_org(model, f'Consent {domain}')
            cls.org_users[domain] = make_citizen(f'org-{domain}', rtype, cls.orgs[domain].id)
        cls.farmer = make_farmer('Fara')
        cls.farmer_user = make_citizen('farmer-consent', 'FARMER', cls.farmer.id)
        cls.admin = make_staff('adminone', 'ADMIN')
        cls.focal = make_staff('focalone', 'EVALUATOR')
        cls.focal2 = make_staff('focaltwo', 'EVALUATOR')

    def file(self, user, field, value):
        self.client.force_authenticate(user)
        return self.client.post(URL, {'field_name': field, 'requested_value': value}, format='json')


class OrganizationRequestCreationTests(ConsentFixture, APITestCase):
    def test_organization_requests_require_both_approvals_for_both_domains(self):
        for domain in ORGS:
            for field, value in (('email_address', 'new@org.test'), ('contact_person', 'Newly Named')):
                res = self.file(self.org_users[domain], field, value)
                self.assertEqual(res.status_code, 201, res.data)
                self.assertTrue(res.data['requires_both'])
                self.assertEqual(set(res.data['awaiting']), {'ADMIN', 'EVALUATOR'})
                self.assertEqual(res.data['status'], 'PENDING')
                self.assertTrue(ProfileChangeRequest.objects.get(pk=res.data['id']).requires_both)

    def test_a_farmer_request_needs_only_one_approval(self):
        res = self.file(self.farmer_user, 'barangay', 'Basca')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertFalse(res.data['requires_both'])
        self.assertEqual(res.data['awaiting'], [])

    def test_email_rules(self):
        user = self.org_users['farmers']
        self.assertEqual(self.file(user, 'email_address', '  new@org.test ').status_code, 201)
        ProfileChangeRequest.objects.all().delete()
        for bad in ('not-an-email', '', '   ', 'a' * 250 + '@x.test'):
            res = self.file(user, 'email_address', bad)
            self.assertEqual(res.status_code, 400, bad)
            self.assertIn('requested_value', res.data)
        res = self.file(user, 'email_address', 'ORG@OLD.TEST')
        self.assertEqual(res.status_code, 400)
        self.assertIn('current value', str(res.data['requested_value']))

    def test_the_stored_email_value_is_trimmed(self):
        res = self.file(self.org_users['farmers'], 'email_address', '  new@org.test ')
        self.assertEqual(res.data['requested_value'], 'new@org.test')

    def test_an_email_used_by_another_organization_or_a_staff_user_is_allowed(self):
        self.orgs['fisherfolk'].email_address = 'shared@x.test'
        self.orgs['fisherfolk'].save()
        self.assertEqual(self.file(self.org_users['farmers'], 'email_address', 'shared@x.test').status_code, 201)
        ProfileChangeRequest.objects.all().delete()
        self.assertEqual(self.file(self.org_users['farmers'], 'email_address', 'adminone@x.test').status_code, 201)

    def test_contact_person_rules(self):
        user = self.org_users['fisherfolk']
        for bad in ('', '   ', 'x' * 151):
            self.assertEqual(self.file(user, 'contact_person', bad).status_code, 400, bad)
        res = self.file(user, 'contact_person', 'Pat Contact')
        self.assertEqual(res.status_code, 400)
        self.assertIn('current value', str(res.data['requested_value']))
        self.assertEqual(self.file(user, 'contact_person', 'x' * 150).status_code, 201)

    def test_staff_only_organization_fields_are_not_requestable(self):
        for field in ('registration_number', 'registration_agency', 'date_organized'):
            res = self.file(self.org_users['farmers'], field, '2021-01-01')
            self.assertEqual(res.status_code, 400, field)
            self.assertIn('field_name', res.data)

    def test_a_second_pending_request_for_the_same_field_is_refused(self):
        self.assertEqual(self.file(self.org_users['farmers'], 'contact_person', 'First Name').status_code, 201)
        res = self.file(self.org_users['farmers'], 'contact_person', 'Second Name')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['detail'], 'already_pending')

    def test_the_history_returns_the_new_fields(self):
        self.file(self.org_users['farmers'], 'email_address', 'new@org.test')
        res = self.client.get(URL)
        self.assertEqual(res.status_code, 200)
        row = res.data[0]
        for key in ('requires_both', 'admin_approved_by_name', 'admin_approved_at', 'focal_approved_by_name',
                    'focal_approved_at', 'awaiting'):
            self.assertIn(key, row)

    def test_an_old_row_serializes_as_single_approval(self):
        old = ProfileChangeRequest.objects.create(
            linked_record_type='FARMERS_ORG', linked_record_id=self.orgs['farmers'].id, field_name='name',
            old_value='a', requested_value='b', requested_by=self.org_users['farmers'], requires_both=False)
        self.client.force_authenticate(self.org_users['farmers'])
        row = [r for r in self.client.get(URL).data if r['id'] == old.id][0]
        self.assertFalse(row['requires_both'])
        self.assertEqual(row['awaiting'], [])


class DecisionFlowTests(ConsentFixture, APITestCase):
    def file_email(self, domain='farmers', value='new@org.test'):
        res = self.file(self.org_users[domain], 'email_address', value)
        self.assertEqual(res.status_code, 201, res.data)
        return res.data['id']

    def decide(self, user, pk, action='approve', **data):
        self.client.force_authenticate(user)
        return self.client.post(f'{STAFF_URL}{pk}/{action}/', data, format='json')

    def org_email(self, domain='farmers'):
        return ORGS[domain][1].objects.get(pk=self.orgs[domain].pk).email_address

    def notes(self, recipient, verb):
        return Notification.objects.filter(recipient=recipient, verb=verb)

    # ── the two-approval rule ────────────────────────────────────────────
    def test_admin_then_focal_person_applies_the_change(self):
        for domain in ORGS:
            pk = self.file_email(domain)
            res = self.decide(self.admin, pk)
            self.assertEqual(res.status_code, 200, res.data)
            self.assertEqual(res.data['status'], 'PENDING')
            self.assertEqual(res.data['awaiting'], ['EVALUATOR'])
            self.assertEqual(res.data['admin_approved_by_name'], 'Adminone')
            self.assertEqual(self.org_email(domain), 'org@old.test')

            res = self.decide(self.focal, pk)
            self.assertEqual(res.status_code, 200, res.data)
            self.assertEqual(res.data['status'], 'APPROVED')
            self.assertEqual(res.data['awaiting'], [])
            self.assertEqual(res.data['reviewed_by'], self.focal.pk)
            self.assertEqual(res.data['focal_approved_by_name'], 'Focalone')
            self.assertEqual(self.org_email(domain), 'new@org.test')

    def test_focal_person_then_admin_applies_the_change(self):
        pk = self.file_email()
        res = self.decide(self.focal, pk)
        self.assertEqual(res.data['awaiting'], ['ADMIN'])
        self.assertEqual(self.org_email(), 'org@old.test')
        res = self.decide(self.admin, pk)
        self.assertEqual(res.data['status'], 'APPROVED')
        self.assertEqual(res.data['reviewed_by'], self.admin.pk)
        self.assertEqual(self.org_email(), 'new@org.test')

    def test_the_same_user_cannot_approve_twice(self):
        pk = self.file_email()
        self.assertEqual(self.decide(self.admin, pk).status_code, 200)
        res = self.decide(self.admin, pk)
        self.assertEqual(res.status_code, 400)
        self.assertIn('already approved', res.data['detail'])
        self.assertEqual(self.decide(self.focal, pk).status_code, 200)
        self.assertEqual(ProfileChangeRequest.objects.get(pk=pk).admin_approved_by, self.admin)

    def test_a_second_focal_person_cannot_stand_in_for_the_admin(self):
        pk = self.file_email()
        self.assertEqual(self.decide(self.focal, pk).status_code, 200)
        res = self.decide(self.focal2, pk)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['detail'], 'The Focal Person already approved this request.')
        req = ProfileChangeRequest.objects.get(pk=pk)
        self.assertEqual(req.status, 'PENDING')
        self.assertIsNone(req.admin_approved_at)
        self.assertEqual(self.org_email(), 'org@old.test')

    def test_a_second_admin_gets_the_admin_message(self):
        pk = self.file_email()
        self.decide(self.admin, pk)
        other_admin = make_staff('admintwo', 'ADMIN')
        res = self.decide(other_admin, pk)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['detail'], 'The Admin already approved this request.')

    def test_reject_by_either_role_after_one_approval_leaves_the_record_alone(self):
        pk = self.file_email()
        self.decide(self.admin, pk)
        res = self.decide(self.focal, pk, 'reject', rejection_reason='x' * 300)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['status'], 'REJECTED')
        self.assertEqual(len(res.data['rejection_reason']), 255)
        self.assertEqual(self.org_email(), 'org@old.test')
        self.assertTrue(self.notes(self.org_users['farmers'], 'rejected your profile change').exists())

    def test_rejecting_twice_and_approving_after_rejection_are_refused(self):
        pk = self.file_email()
        self.decide(self.admin, pk)
        self.assertEqual(self.decide(self.focal, pk, 'reject').status_code, 200)
        again = self.decide(self.admin, pk, 'reject')
        self.assertEqual(again.status_code, 400)
        self.assertIn('already rejected', again.data['detail'])
        late = self.decide(self.focal, pk)
        self.assertEqual(late.status_code, 400)
        self.assertEqual(self.org_email(), 'org@old.test')

    def test_notifications_at_each_step(self):
        pk = self.file_email()
        self.decide(self.admin, pk)
        owner = self.org_users['farmers']
        first = self.notes(owner, 'approved your profile change').get()
        self.assertEqual(first.detail, 'email address approved by the Admin; waiting for the Focal Person')
        for focal in (self.focal, self.focal2):
            self.assertEqual(self.notes(focal, 'needs your approval').count(), 1)
        self.assertFalse(self.notes(self.admin, 'needs your approval').exists())
        self.decide(self.focal, pk)
        self.assertEqual(self.notes(owner, 'approved your profile change').count(), 2)
        self.assertIn('is now "new@org.test"', self.notes(owner, 'approved your profile change').latest('id').detail)

    # ── the unchanged one-approval behaviour ────────────────────────────
    def test_a_farmer_request_completes_on_one_admin_approval(self):
        self.assertEqual(self.file(self.farmer_user, 'barangay', 'Basca').status_code, 201)
        pk = ProfileChangeRequest.objects.get().pk
        res = self.decide(self.admin, pk)
        self.assertEqual(res.data['status'], 'APPROVED')
        self.assertEqual(Farmer.objects.get(pk=self.farmer.pk).barangay, 'Basca')

    def test_a_farmer_request_completes_on_one_focal_person_approval(self):
        self.file(self.farmer_user, 'barangay', 'Basca')
        pk = ProfileChangeRequest.objects.get().pk
        self.assertEqual(self.decide(self.focal, pk).data['status'], 'APPROVED')

    def test_an_old_organization_row_completes_on_one_approval(self):
        old = ProfileChangeRequest.objects.create(
            linked_record_type='FARMERS_ORG', linked_record_id=self.orgs['farmers'].id, field_name='name',
            old_value='Consent farmers', requested_value='Renamed Org', requested_by=self.org_users['farmers'],
            requires_both=False)
        res = self.decide(self.focal, old.pk)
        self.assertEqual(res.data['status'], 'APPROVED')
        self.assertEqual(FarmersOrganization.objects.get(pk=self.orgs['farmers'].pk).name, 'Renamed Org')

    def test_a_non_staff_caller_is_refused(self):
        pk = self.file_email()
        self.assertEqual(self.decide(self.farmer_user, pk).status_code, 403)

    # ── review focus ─────────────────────────────────────────────────────
    def test_an_approval_survives_the_approver_being_deactivated_and_replaced(self):
        pk = self.file_email()
        self.decide(self.admin, pk)
        self.admin.is_active = False
        self.admin.save()
        make_staff('adminnew', 'ADMIN')
        res = self.decide(self.focal, pk)
        self.assertEqual(res.data['status'], 'APPROVED')
        self.assertEqual(res.data['admin_approved_by_name'], 'Adminone')
        self.assertEqual(self.org_email(), 'new@org.test')

    def test_a_role_change_between_approvals_keeps_the_stored_approval_and_one_user_never_counts_twice(self):
        pk = self.file_email()
        self.decide(self.admin, pk)
        self.admin.role = 'EVALUATOR'
        self.admin.save()
        again = self.decide(self.admin, pk)
        self.assertEqual(again.status_code, 400)
        self.assertEqual(again.data['detail'], 'You already approved this request.')
        req = ProfileChangeRequest.objects.get(pk=pk)
        self.assertEqual(req.status, 'PENDING')
        self.assertEqual(req.admin_approved_by, self.admin)
        res = self.decide(self.focal, pk)
        self.assertEqual(res.data['status'], 'APPROVED')

    def test_two_requests_for_one_organization_approved_in_opposite_orders(self):
        email = self.file_email(value='first@org.test')
        person = self.file(self.org_users['farmers'], 'contact_person', 'Second Person').data['id']
        self.decide(self.admin, email)
        self.decide(self.focal, person)
        self.decide(self.focal, email)
        self.decide(self.admin, person)
        org = FarmersOrganization.objects.get(pk=self.orgs['farmers'].pk)
        self.assertEqual((org.email_address, org.contact_person), ('first@org.test', 'Second Person'))
        self.assertEqual(ProfileChangeRequest.objects.filter(status='APPROVED').count(), 2)

    # ── concurrency and odd states ───────────────────────────────────────
    def test_a_request_decided_between_the_read_and_the_lock_is_refused_and_writes_nothing(self):
        pk = self.file_email()
        self.decide(self.admin, pk)
        from core import profile_self_service
        real = profile_self_service._lock_request

        def flip_then_lock(request_pk):
            ProfileChangeRequest.objects.filter(pk=request_pk).update(status='APPROVED')
            return real(request_pk)

        with mock.patch('core.profile_self_service._lock_request', side_effect=flip_then_lock):
            res = self.decide(self.focal, pk)
        self.assertEqual(res.status_code, 400)
        self.assertIn('already approved', res.data['detail'])
        self.assertEqual(self.org_email(), 'org@old.test')
        self.assertIsNone(ProfileChangeRequest.objects.get(pk=pk).focal_approved_at)

    def test_the_record_already_holding_the_value_is_approved_without_error(self):
        pk = self.file_email()
        self.decide(self.admin, pk)
        FarmersOrganization.objects.filter(pk=self.orgs['farmers'].pk).update(email_address='new@org.test')
        res = self.decide(self.focal, pk)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['status'], 'APPROVED')

    def test_a_deleted_record_is_refused(self):
        pk = self.file_email()
        FarmersOrganization.objects.filter(pk=self.orgs['farmers'].pk).delete()
        res = self.decide(self.admin, pk)
        self.assertEqual(res.status_code, 400)
        self.assertIn('no longer exists', res.data['detail'])

    def test_the_staff_list_shows_the_approval_state(self):
        pk = self.file_email()
        self.decide(self.admin, pk)
        self.client.force_authenticate(self.focal)
        row = [r for r in self.client.get(STAFF_URL).data if r['id'] == pk][0]
        self.assertEqual(row['awaiting'], ['EVALUATOR'])
        self.assertTrue(row['requires_both'])
