"""Saved report signatories: the list the Reports pages pick their signers from."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import Signatory

URL = '/api/reports/signatories/'


def _detail(pk):
    return f'{URL}{pk}/'


class SignatoryApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='adm', password='pw', role='ADMIN', email='a@x.test')
        cls.evaluator = User.objects.create_user(username='ev', password='pw', role='EVALUATOR', email='e@x.test')
        cls.citizen = User.objects.create_user(username='cit', password='pw', role='CITIZEN', email='c@x.test')

    def _make(self, name, role='noted', is_active=True, position=''):
        return Signatory.objects.create(name=name, role=role, is_active=is_active, position=position)

    def test_evaluator_and_admin_list_only_active_rows_ordered_by_role_then_name(self):
        self._make('Zed', 'approved')
        self._make('Bea', 'noted')
        self._make('Abe', 'noted')
        self._make('Cy', 'noted')
        self._make('Dee', 'prepared')
        self._make('Eve', 'checked')
        self._make('Gone', 'noted', is_active=False)
        for user in (self.admin, self.evaluator):
            self.client.force_authenticate(user)
            res = self.client.get(URL)
            self.assertEqual(res.status_code, 200)
            self.assertEqual(
                [(r['role'], r['name']) for r in res.data],
                [('prepared', 'Dee'), ('checked', 'Eve'), ('noted', 'Abe'), ('noted', 'Bea'), ('noted', 'Cy'), ('approved', 'Zed')],
            )
            self.assertEqual(set(res.data[0]), {'id', 'name', 'position', 'role', 'is_active'})

    def test_all_flag_returns_inactive_rows_for_admin_but_is_ignored_for_evaluator(self):
        self._make('Here')
        self._make('Gone', is_active=False)
        self.client.force_authenticate(self.admin)
        self.assertEqual({r['name'] for r in self.client.get(URL + '?all=1').data}, {'Here', 'Gone'})
        self.client.force_authenticate(self.evaluator)
        self.assertEqual({r['name'] for r in self.client.get(URL + '?all=1').data}, {'Here'})

    def test_citizen_and_anonymous_cannot_list(self):
        self.assertEqual(self.client.get(URL).status_code, 401)
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.get(URL).status_code, 403)

    def test_only_admin_can_create_edit_and_delete(self):
        body = {'name': 'Ana Cruz', 'position': 'Municipal Agriculturist', 'role': 'noted'}
        self.client.force_authenticate(self.evaluator)
        self.assertEqual(self.client.post(URL, body, format='json').status_code, 403)
        row = self._make('Existing')
        self.assertEqual(self.client.put(_detail(row.pk), body, format='json').status_code, 403)
        self.assertEqual(self.client.delete(_detail(row.pk)).status_code, 403)

        self.client.force_authenticate(self.admin)
        created = self.client.post(URL, body, format='json')
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data['name'], 'Ana Cruz')
        self.assertTrue(created.data['is_active'])
        edited = self.client.patch(_detail(created.data['id']), {'position': 'MA', 'is_active': False}, format='json')
        self.assertEqual(edited.status_code, 200)
        self.assertEqual((edited.data['position'], edited.data['is_active']), ('MA', False))
        self.assertEqual(self.client.delete(_detail(created.data['id'])).status_code, 204)
        self.assertFalse(Signatory.objects.filter(pk=created.data['id']).exists())

    def test_blank_or_whitespace_name_is_refused(self):
        self.client.force_authenticate(self.admin)
        for name in ('', '   '):
            res = self.client.post(URL, {'name': name, 'role': 'noted'}, format='json')
            self.assertEqual(res.status_code, 400, name)
            self.assertIn('name', res.data)
        self.assertEqual(Signatory.objects.count(), 0)

    def test_unknown_role_is_refused(self):
        self.client.force_authenticate(self.admin)
        for role in ('boss', ''):
            res = self.client.post(URL, {'name': 'Ana', 'role': role}, format='json')
            self.assertEqual(res.status_code, 400, role)
            self.assertIn('role', res.data)

    def test_name_and_position_are_trimmed_on_save(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post(URL, {'name': '  Ana Cruz  ', 'position': '  MA ', 'role': 'noted'}, format='json')
        self.assertEqual((res.data['name'], res.data['position']), ('Ana Cruz', 'MA'))

    def test_same_name_may_hold_two_roles(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(URL, {'name': 'Ana', 'role': 'checked'}, format='json').status_code, 201)
        self.assertEqual(self.client.post(URL, {'name': 'Ana', 'role': 'noted'}, format='json').status_code, 201)
        self.assertEqual(Signatory.objects.filter(name='Ana').count(), 2)
