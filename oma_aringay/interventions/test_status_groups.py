"""The distribution lists take two status groups besides a single status: `current` (pending, awaiting confirmation, not received: still open)
and `history` (confirmed, resolved: finished). A distribution whose members are in both shows only the matching members in each."""
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from interventions.test_distribution_history import DOMAINS, make_person
from interventions.test_staff_distributions import URLS, shared

User = get_user_model()
STATUSES = ['PENDING', 'AWAITING_CONFIRMATION', 'NOT_RECEIVED', 'CONFIRMED', 'RESOLVED']
CURRENT = {'PENDING', 'AWAITING_CONFIRMATION', 'NOT_RECEIVED'}


class StatusGroupTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = User.objects.create_user(username='sg-admin', password='pw', role='ADMIN', email='sg@x.test')

    def setUp(self):
        self.client.force_authenticate(self.staff)

    def seed(self, domain):
        people = [make_person(domain, f'P{i}') for i in range(len(STATUSES))]
        res = self.client.post(URLS[domain]['bulk'], shared(domain, **{URLS[domain]['ids']: [p.id for p in people]}), format='json')
        self.assertEqual(res.status_code, 200, res.content)
        model = DOMAINS[domain]['record']
        field = DOMAINS[domain]['person_field']
        for person, status in zip(people, STATUSES):
            model.objects.filter(**{field: person}).update(status=status, date_given=date.today())
        return people

    def statuses(self, domain, group):
        res = self.client.get(URLS[domain]['list'], {'status': group})
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        return sorted(m['status'] for d in (body['results'] if isinstance(body, dict) else body) for m in d['members'])

    def test_current_lists_the_open_statuses_only(self):
        for domain in DOMAINS:
            self.seed(domain)
            self.assertEqual(self.statuses(domain, 'current'), sorted(CURRENT), domain)

    def test_history_lists_the_finished_statuses_only(self):
        for domain in DOMAINS:
            self.seed(domain)
            self.assertEqual(self.statuses(domain, 'history'), ['CONFIRMED', 'RESOLVED'], domain)

    def test_a_single_status_and_needs_follow_up_still_work(self):
        for domain in DOMAINS:
            self.seed(domain)
            self.assertEqual(self.statuses(domain, 'needs-follow-up'), ['NOT_RECEIVED'], domain)
            self.assertEqual(self.statuses(domain, 'confirmed'), ['CONFIRMED'], domain)
            self.assertEqual(self.statuses(domain, 'CURRENT'), sorted(CURRENT), domain)   # the group name is not case sensitive
