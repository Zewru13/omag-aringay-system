"""A crop disaster report sent as something other than an object or a form (for example a JSON list) is a 400, not a crash."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from production.test_crop_disaster_photos import make_farmer, make_record


class BadBodyTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='bb-admin', password='pw', role='ADMIN', email='bb-admin@x.test')
        cls.record = make_record(make_farmer('Bad'))

    def test_a_json_list_body_is_refused_with_400(self):
        self.client.force_authenticate(self.admin)
        for payload in ([], [{'disaster_type': 'Flood'}], 'text', 5):
            res = self.client.post(f'/api/production/monitoring/{self.record.id}/disasters/', payload, format='json')
            self.assertEqual(res.status_code, 400, repr(payload))
