"""The Audit Log: everything the staff do is recorded, one entry per action, with a plain description and the old and new values;
sign-ins and failed sign-ins and report downloads too. Page visits, reading notices and trial runs are not. Passwords, keys and
whatever was typed into a failed sign-in are never stored. What other accounts change is recorded as it always was."""
import json
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import cache
from django.db import transaction
from django.test import TestCase
from django.urls import get_resolver
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIRequestFactory, APITestCase

from accounts.models import UserLinkedRecord
from auditlog import capture
from auditlog.catalog import ROUTES
from auditlog.models import AuditLogEntry
from core.models import ProfileChangeRequest
from core.test_profile_consent import STAFF_URL, ConsentFixture, make_farmer
from farmers.models import Farmer
from interventions.models import BeneficiaryRecord
from production.models import CropMonitoringRecord, CropType, SeedSource

User = get_user_model()
SOURCES = '/api/production/seed-sources/'
LOGIN = '/api/accounts/login/'


def make_staff(username, role='ADMIN', full_name='Ada Admin', password='Staff-pass#2026'):
    user = User.objects.create_user(username=username, password=password, role=role, email=f'{username}@x.test', full_name=full_name)
    User.objects.filter(pk=user.pk).update(is_email_verified=True)
    user.refresh_from_db()
    return user


def make_citizen(username, record_type, record_id, password='Citizen-pass#2026'):
    user = User.objects.create_user(username=username, password=password, role='CITIZEN', email=f'{username}@x.test')
    UserLinkedRecord.objects.create(user=user, record_type=record_type, record_id=record_id, is_active=True)
    return user


def entries_of(user):
    return list(AuditLogEntry.objects.filter(user=user).order_by('id'))


def everything_stored():
    return json.dumps(list(AuditLogEntry.objects.values('object_repr', 'model_name', 'details', 'user_name', 'user_email')), default=str)


def writing_routes():
    def walk(patterns, prefix=''):
        for p in patterns:
            route = prefix + str(p.pattern)
            if hasattr(p, 'url_patterns'):
                yield from walk(p.url_patterns, route)
            else:
                yield route, p.callback
    found = set()
    for route, callback in walk(get_resolver().url_patterns):
        cls = getattr(callback, 'view_class', None) or getattr(callback, 'cls', None)
        if cls and route.startswith('api/') and any(m in cls.http_method_names and hasattr(cls, m) for m in ('post', 'put', 'patch', 'delete')):
            found.add(route[len('api/'):])
    return found


class CatalogTests(TestCase):
    def test_every_address_that_changes_something_says_what_it_does(self):
        """A new address must be given a description here (or be marked as not worth recording), so nothing slips past unrecorded."""
        routes = writing_routes()
        self.assertGreater(len(routes), 200)
        self.assertEqual(sorted(routes - set(ROUTES)), [], 'addresses without a description in auditlog.catalog')
        self.assertEqual(sorted(set(ROUTES) - routes), [], 'descriptions of addresses that no longer exist')


class NameTests(TestCase):
    def test_a_change_request_and_a_crop_record_are_named_for_a_reader(self):
        request = ProfileChangeRequest(linked_record_type='FARMER', linked_record_id=1, field_name='middle_name', old_value='', requested_value='Cruz')
        self.assertEqual(capture.label_of(request), 'middle name change to "Cruz"')
        farmer = make_farmer('Nena')
        crop = CropMonitoringRecord.objects.create(
            farmer=farmer, crop_type=CropType.objects.create(name='Named Rice', days_to_harvest=100), season='Wet', year=2026,
            farm_location_barangay='Alaska', land_status='Owner', area_planted_ha='1.00', status='Planted', date_planted=date.today(), variety_used='')
        self.assertEqual(capture.label_of(crop), 'Nena Consent: Named Rice (Wet 2026)')


class StaffActionTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = make_staff('al-admin')
        cls.focal = make_staff('al-focal', 'EVALUATOR', 'Fina Focal')

    def setUp(self):
        cache.clear()
        self.client.force_authenticate(self.admin)

    def only_entry(self, user=None):
        found = entries_of(user or self.admin)
        self.assertEqual(len(found), 1, [e.object_repr for e in found])
        return found[0]

    def changes(self, entry):
        return {(c['record'], c['change']): {f['field']: (f['old'], f['new']) for f in c['fields']} for c in entry.details['changes']}

    def test_adding_something_makes_one_entry_with_who_what_and_the_new_values(self):
        AuditLogEntry.objects.all().delete()
        res = self.client.post(SOURCES, {'name': 'Own Seeds Bank'}, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        entry = self.only_entry()
        self.assertEqual((entry.action, entry.object_repr), ('CREATE', 'Added a seed source: Own Seeds Bank'))
        self.assertEqual((entry.user_name, entry.user_email), ('Ada Admin', 'al-admin@x.test'))
        fields = self.changes(entry)[('Seed source', 'created')]
        self.assertEqual(fields['Name'], (None, 'Own Seeds Bank'))

    def test_an_edit_shows_only_what_changed_before_and_after(self):
        source = SeedSource.objects.create(name='Before Name')
        AuditLogEntry.objects.all().delete()
        self.assertEqual(self.client.patch(f'{SOURCES}{source.id}/', {'name': 'After Name'}, format='json').status_code, 200)
        entry = self.only_entry()
        self.assertEqual((entry.action, entry.object_repr), ('UPDATE', 'Updated a seed source: After Name'))
        self.assertEqual(self.changes(entry), {('Seed source', 'updated'): {'Name': ('Before Name', 'After Name')}})

    def test_a_deletion_keeps_what_was_there(self):
        source = SeedSource.objects.create(name='Going Away')
        AuditLogEntry.objects.all().delete()
        self.assertEqual(self.client.delete(f'{SOURCES}{source.id}/').status_code, 204)
        entry = self.only_entry()
        self.assertEqual((entry.action, entry.object_repr), ('DELETE', 'Deleted a seed source: Going Away'))
        self.assertEqual(self.changes(entry)[('Seed source', 'deleted')]['Name'], ('Going Away', None))

    def test_a_focal_person_is_recorded_the_same_way(self):
        farmer = make_farmer('Pia')
        AuditLogEntry.objects.all().delete()
        self.client.force_authenticate(self.focal)
        res = self.client.patch(f'/api/farmers/{farmer.id}/', {'contact_number': '09170001111'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        entry = self.only_entry(self.focal)
        self.assertEqual(AuditLogEntry.objects.count(), 1, 'no second entry from the old per-record logging')
        self.assertRegex(entry.object_repr, r'^Updated a farmer: .*Pia Consent$')
        self.assertEqual(self.changes(entry)[('Farmer', 'updated')]['Contact number'][1], '09170001111')

    def test_nothing_is_recorded_for_a_refused_request_a_page_visit_or_reading_notices(self):
        SeedSource.objects.create(name='Twice')
        AuditLogEntry.objects.all().delete()
        self.assertEqual(self.client.post(SOURCES, {'name': 'Twice'}, format='json').status_code, 400)
        self.assertEqual(self.client.get(SOURCES).status_code, 200)
        self.assertEqual(self.client.post('/api/notifications/read-all/').status_code, 200)
        self.client.post('/api/locks/release/', {'record_type': 'crop', 'record_id': 1}, format='json')
        self.assertEqual([e.object_repr for e in AuditLogEntry.objects.all()], [])

    def test_a_trial_run_is_not_recorded_and_the_real_one_is(self):
        farmer = make_farmer('Dry')
        AuditLogEntry.objects.all().delete()
        body = {'farmer_ids': [farmer.id], 'assistance_type': 'Seeds', 'source_agencies': ['DA'], 'quantity': '1 sack',
                'date_given': str(date.today()), 'distribution_place': 'Hall', 'distribution_time': '00:00'}
        url = '/api/interventions/beneficiaries/adhoc/bulk/'
        self.assertEqual(self.client.post(url, {**body, 'dry_run': True}, format='json').status_code, 200)
        self.assertEqual(AuditLogEntry.objects.count(), 0)
        self.assertEqual(self.client.post(url, body, format='json').status_code, 200)
        self.assertEqual(BeneficiaryRecord.objects.count(), 1)
        entry = self.only_entry()
        self.assertTrue(entry.object_repr.startswith('Gave assistance'), entry.object_repr)

    def test_taking_people_off_a_distribution_is_one_entry_that_lists_them(self):
        people = [make_farmer('Rem'), make_farmer('Off')]
        records = [BeneficiaryRecord.objects.create(farmer=p, assistance_type='Seeds', source_agencies=['DA'],
                                                    date_given=date.today() + timedelta(days=5)) for p in people]
        AuditLogEntry.objects.all().delete()
        res = self.client.post('/api/interventions/assistance-removals/', {'domain': 'crop', 'record_ids': [r.id for r in records]}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        entry = self.only_entry()
        self.assertEqual(entry.action, 'DELETE')
        self.assertRegex(entry.object_repr, r'^Removed people from an assistance distribution: .* and 1 more$')
        self.assertEqual({c['name'] for c in entry.details['changes']}, {'Seeds - Rem Consent', 'Seeds - Off Consent'})

    def test_changes_that_were_undone_are_not_listed(self):
        request = APIRequestFactory().post('/api/anything/')
        request.user = self.admin
        collector = capture.begin(request)
        try:
            try:
                with transaction.atomic():
                    SeedSource.objects.create(name='Rolled Back')
                    raise ValueError
            except ValueError:
                pass
            SeedSource.objects.create(name='Stayed')
            kept = SeedSource.objects.create(name='Edited')
            try:
                with transaction.atomic():
                    kept.name = 'Edit Rolled Back'
                    kept.save()
                    raise ValueError
            except ValueError:
                pass
            changes, more = collector.finish()
        finally:
            capture.end()
        self.assertEqual(sorted(c['name'] for c in changes), ['Edited', 'Stayed'])
        self.assertEqual(more, 0)

    def test_a_very_large_action_lists_the_first_records_and_counts_the_rest(self):
        request = APIRequestFactory().post('/api/anything/')
        request.user = self.admin
        collector = capture.begin(request)
        try:
            for i in range(capture.MAX_RECORDS + 7):
                SeedSource.objects.create(name=f'Bulk {i}')
            changes, more = collector.finish()
        finally:
            capture.end()
        self.assertEqual((len(changes), more), (capture.MAX_RECORDS, 7))

    def test_a_new_temporary_password_is_never_stored(self):
        other = make_staff('al-other', 'EVALUATOR', 'Otto Other')
        AuditLogEntry.objects.all().delete()
        res = self.client.post(f'/api/accounts/users/{other.id}/regenerate-password/', {}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        entry = self.only_entry()
        other.refresh_from_db()
        stored = everything_stored()
        self.assertNotIn(other.password, stored, 'not even the scrambled password')
        if res.data.get('temporary_password'):
            self.assertNotIn(res.data['temporary_password'], stored)
        fields = {f['field']: (f['old'], f['new']) for c in entry.details['changes'] for f in c['fields']}
        self.assertEqual(fields.get('Password'), ('hidden', 'hidden'))
        self.assertTrue(entry.object_repr.startswith('Issued a new temporary password'), entry.object_repr)

    def test_downloading_a_report_is_recorded_but_looking_at_it_or_a_blank_form_is_not(self):
        AuditLogEntry.objects.all().delete()
        url = '/api/reports/organization-assistance/'
        self.assertEqual(self.client.get(url, {'kind': 'farmers'}).status_code, 200)
        self.assertEqual(self.client.get('/api/interventions/beneficiaries/adhoc/import/template/').status_code, 200)
        self.assertEqual(AuditLogEntry.objects.count(), 0)
        self.assertEqual(self.client.get(url, {'kind': 'farmers', 'format': 'pdf'}).status_code, 200)
        entry = self.only_entry()
        self.assertEqual(entry.action, 'DOWNLOAD')
        self.assertRegex(entry.object_repr, r'^Downloaded a file: farmers_organization_assistance.*\.pdf$')


class ApprovalAndOtherAccountsTests(ConsentFixture, APITestCase):
    def test_approving_and_rejecting_a_change_request_are_approvals(self):
        first = self.file(self.farmer_user, 'barangay', 'Basca').data['id']
        second = self.file(self.farmer_user, 'middle_name', 'Cruz').data['id']
        AuditLogEntry.objects.all().delete()
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(f'{STAFF_URL}{first}/approve/', {}, format='json').status_code, 200)
        self.assertEqual(self.client.post(f'{STAFF_URL}{second}/reject/', {}, format='json').status_code, 200)
        found = entries_of(self.admin)
        self.assertEqual([e.action for e in found], ['APPROVE', 'REJECT'])
        self.assertTrue(found[0].object_repr.startswith('Approved a profile change request'), found[0].object_repr)
        barangay = [f for c in found[0].details['changes'] for f in c['fields'] if f['field'] == 'Barangay']
        self.assertEqual([(f['old'], f['new']) for f in barangay], [('Alaska', 'Basca')])

    def test_what_a_citizen_changes_is_still_recorded_as_before(self):
        AuditLogEntry.objects.all().delete()
        self.client.force_authenticate(self.farmer_user)
        res = self.client.patch('/api/profile/contact-number/', {'contact_number': '09170002222'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        found = entries_of(self.farmer_user)
        self.assertEqual([(e.action, e.model_name) for e in found], [('UPDATE', 'Farmer')])


class SignInTests(APITestCase):
    PASSWORD = 'Staff-pass#2026'

    @classmethod
    def setUpTestData(cls):
        cls.admin = make_staff('al-signin')
        cls.farmer = Farmer.objects.create(rsbsa_number='01-033-02-019-930001', first_name='Cita', last_name='Zen', gender='Female',
                                           birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        cls.citizen = make_citizen('al-citizen', 'FARMER', cls.farmer.id)

    def setUp(self):
        cache.clear()
        AuditLogEntry.objects.all().delete()

    def sign_in(self, who, password):
        return self.client.post(LOGIN, {'email': who, 'password': password}, format='json')

    def test_a_staff_sign_in_is_recorded_once(self):
        res = self.sign_in(self.admin.email, self.PASSWORD)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual([(e.action, e.object_repr, e.user_id) for e in AuditLogEntry.objects.all()], [('SIGN_IN', 'Signed in', self.admin.id)])

    def test_signing_out_is_recorded(self):
        tokens = self.sign_in(self.admin.email, self.PASSWORD).data
        AuditLogEntry.objects.all().delete()
        res = self.client.post('/api/accounts/logout/', {'refresh': tokens['refresh']}, format='json',
                               HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual([(e.action, e.object_repr) for e in AuditLogEntry.objects.all()], [('SIGN_OUT', 'Signed out')])

    def test_a_wrong_password_on_a_staff_account_is_recorded_without_the_password(self):
        self.assertEqual(self.sign_in(self.admin.email, 'Wrong-pass#9999').status_code, 401)
        entry = AuditLogEntry.objects.get()
        self.assertEqual((entry.action, entry.user_id, entry.object_repr), ('SIGN_IN_FAILED', self.admin.id, 'Failed sign-in: wrong password'))
        self.assertNotIn('Wrong-pass#9999', everything_stored())

    def test_an_unknown_account_is_recorded_without_what_was_typed(self):
        typed = 'My-secret-Password#77'    # people do type a password into the first box
        self.assertEqual(self.sign_in(typed, 'x').status_code, 401)
        entry = AuditLogEntry.objects.get()
        self.assertEqual((entry.action, entry.user_id), ('SIGN_IN_FAILED', None))
        self.assertEqual(entry.object_repr, 'Failed sign-in: no account matches what was typed')
        self.assertEqual(entry.user_name, 'Unknown')
        self.assertNotIn(typed, everything_stored())

    def test_a_staff_password_reset_from_the_email_link_is_recorded_in_their_name(self):
        link = {'uid': urlsafe_base64_encode(force_bytes(self.admin.pk)), 'token': default_token_generator.make_token(self.admin)}
        AuditLogEntry.objects.all().delete()
        res = self.client.post('/api/accounts/reset-password/', {**link, 'new_password': 'Brand-new-Pass#3162', 'confirm_new_password': 'Brand-new-Pass#3162'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual([(e.user_id, e.object_repr) for e in AuditLogEntry.objects.all()],
                         [(self.admin.id, 'Reset their password from the e-mail link')])
        self.assertNotIn('Brand-new-Pass#3162', everything_stored())

    def test_citizens_signing_in_are_not_recorded(self):
        self.assertEqual(self.sign_in(self.citizen.email, 'Citizen-pass#2026').status_code, 200)
        self.assertEqual(self.sign_in(self.citizen.email, 'nope').status_code, 401)
        self.assertEqual(AuditLogEntry.objects.count(), 0)


class ListTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = make_staff('al-list')
        cls.focal = make_staff('al-list-focal', 'EVALUATOR')

    def test_the_list_carries_the_details_and_older_entries_without_any(self):
        AuditLogEntry.objects.all().delete()
        AuditLogEntry.objects.create(user=self.admin, action='UPDATE', model_name='Farmer', object_repr='An older entry')
        AuditLogEntry.objects.create(user=None, action='RESTORE', model_name='Backup', object_repr='Restore finished', user_name='Gone Person',
                                     user_email='gone@x.test', details={'changes': [], 'more': 0})
        self.client.force_authenticate(self.admin)
        rows = {r['object_repr']: r for r in self.client.get('/api/auditlog/').data['results']}
        self.assertEqual((rows['An older entry']['details'], rows['An older entry']['user']['full_name']), (None, 'Ada Admin'))
        self.assertEqual(rows['Restore finished']['user']['full_name'], 'Gone Person', 'the name is kept even when the account is gone')

    def test_only_an_admin_reads_it(self):
        self.client.force_authenticate(self.focal)
        self.assertEqual(self.client.get('/api/auditlog/').status_code, 403)
