"""What the notification window needs from the server: staff review a change request from its notification, so one record's requests
can be loaded on their own, and the list says how many unread notices are requests waiting for review (the bell counts those from
the pending list itself, so it must not count them twice)."""
from rest_framework.test import APITestCase

from core.models import Notification
from core.test_profile_consent import STAFF_URL, ConsentFixture, make_citizen, make_farmer

LIST_URL = '/api/notifications/'


class UnreadChangeRequestCountTests(ConsentFixture, APITestCase):
    def counts(self, user):
        self.client.force_authenticate(user)
        data = self.client.get(LIST_URL).data
        return data['unread_count'], data['unread_change_requests']

    def test_a_filed_request_is_counted_apart_from_other_notices(self):
        self.assertEqual(self.file(self.farmer_user, 'barangay', 'Basca').status_code, 201)
        Notification.objects.create(recipient=self.admin, verb='logged an activity on', record_type='crop', record_id=1, record_label='Rice')
        self.assertEqual(self.counts(self.admin), (2, 1))

    def test_reading_the_request_notice_takes_it_out_of_both_counts(self):
        self.file(self.farmer_user, 'barangay', 'Basca')
        Notification.objects.filter(recipient=self.admin).update(is_read=True)
        self.assertEqual(self.counts(self.admin), (0, 0))

    def test_the_second_approval_notice_is_counted_too(self):
        request_id = self.file(self.org_users['farmers'], 'contact_person', 'Newly Named').data['id']
        Notification.objects.all().delete()
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(f'{STAFF_URL}{request_id}/approve/', {}, format='json').status_code, 200)
        self.assertEqual(self.counts(self.focal), (1, 1))

    def test_the_answer_sent_to_the_requester_is_an_ordinary_notice(self):
        request_id = self.file(self.farmer_user, 'barangay', 'Basca').data['id']
        self.client.force_authenticate(self.admin)
        self.client.post(f'{STAFF_URL}{request_id}/reject/', {'rejection_reason': 'Please bring proof'}, format='json')
        self.assertEqual(self.counts(self.farmer_user), (1, 0))


class OneRecordsRequestsTests(ConsentFixture, APITestCase):
    def test_staff_can_load_the_requests_of_one_record_including_decided_ones(self):
        other = make_farmer('Other')
        other_user = make_citizen('other-consent', 'FARMER', other.id)
        mine = self.file(self.farmer_user, 'barangay', 'Basca').data['id']
        self.file(other_user, 'barangay', 'Basca')
        self.client.force_authenticate(self.admin)
        self.client.post(f'{STAFF_URL}{mine}/reject/', {}, format='json')
        res = self.client.get(STAFF_URL, {'status': 'ALL', 'record_type': 'FARMER', 'record_id': self.farmer.id})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual([(r['id'], r['status']) for r in res.data], [(mine, 'REJECTED')])

    def test_a_record_id_that_is_not_a_number_is_refused(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(STAFF_URL, {'record_id': 'abc'}).status_code, 400)

    def test_a_citizen_still_cannot_read_the_staff_list(self):
        self.client.force_authenticate(self.farmer_user)
        self.assertEqual(self.client.get(STAFF_URL, {'record_type': 'FARMER', 'record_id': self.farmer.id}).status_code, 403)
