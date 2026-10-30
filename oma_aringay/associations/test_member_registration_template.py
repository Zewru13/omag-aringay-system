"""The members file template of the organization registration form: it needs no organization yet, and only staff can download it."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase


class MemberRegistrationTemplateTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='mt-adm', password='pw', role='ADMIN', email='mta@x.test')
        cls.focal = User.objects.create_user(username='mt-foc', password='pw', role='EVALUATOR', email='mtf@x.test')
        cls.citizen = User.objects.create_user(username='mt-cit', password='pw', role='CITIZEN', email='mtc@x.test')

    def test_staff_get_the_template_for_both_kinds_of_organization(self):
        for user in (self.admin, self.focal):
            self.client.force_authenticate(user)
            for domain in ('farmers', 'fisherfolk'):
                r = self.client.get(f'/api/organizations/{domain}/members/import/template/')
                self.assertEqual(r.status_code, 200, (user.username, domain))
                self.assertIn('spreadsheetml', r['Content-Type'])
                self.assertIn(f'{domain}_organization_members_import_template.xlsx', r['Content-Disposition'])

    def test_a_citizen_or_nobody_cannot(self):
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.get('/api/organizations/farmers/members/import/template/').status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get('/api/organizations/fisherfolk/members/import/template/').status_code, (401, 403))
