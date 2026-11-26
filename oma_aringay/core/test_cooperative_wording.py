"""People read "Cooperative" where the system used to say "Organization". Only the words on screens, in messages, files and reports
change: addresses, field names and saved values (FARMERS_ORG, 'Organization-Owned', ...) stay as they are, so no database change."""
import ast
import io
import os
import re
from datetime import date

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase

from accounts.serializers import UserSerializer
from associations.models import FarmersOrganization, FisherfolkOrganization
from associations.serializers import FarmersOrganizationDetailSerializer, FisherfolkOrganizationDetailSerializer

WORD = re.compile(r'organi[sz]ation', re.I)


def _is_code(value):
    """A field name, address or code (no spaces), not something a person reads."""
    v = value.strip()
    if re.search(r'\s', v) or re.fullmatch(r'[A-Z][a-z]+s?[?!.,:]?', v):
        return False
    return bool(re.fullmatch(r'[A-Za-z0-9_\-/.:?=&%#<>\[\]^$()+*|\\{}]*', v))


def _server_files():
    for folder, dirs, files in os.walk(settings.BASE_DIR):
        dirs[:] = [d for d in dirs if d not in ('migrations', '__pycache__', 'media', 'staticfiles', 'commands', 'tests')]
        for name in files:
            # models.py is left alone: its labels are part of the database structure (changing one needs a migration).
            if name.endswith('.py') and not name.startswith('test') and name != 'models.py':
                yield os.path.join(folder, name)


class NoOrganizationWordingTests(SimpleTestCase):
    def test_no_message_file_or_report_text_says_organization(self):
        left = []
        for path in _server_files():
            source = io.open(path, encoding='utf-8').read()
            if not WORD.search(source):
                continue
            tree = ast.parse(source)
            docstrings = set()
            for node in ast.walk(tree):
                if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and node.body:
                    first = node.body[0]
                    if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant):
                        docstrings.add(id(first.value))
            for node in ast.walk(tree):
                if not (isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docstrings
                        and WORD.search(node.value)):
                    continue
                # In the reports, the word in capitals is a column heading. Elsewhere it is a saved code.
                heading = node.value == 'ORGANIZATION' and f'{os.sep}reports{os.sep}' in path
                if heading or not _is_code(node.value):
                    left.append(f'{os.path.relpath(path, settings.BASE_DIR)}:{node.lineno}: {node.value[:90]}')
        self.assertEqual(left, [])


class CooperativeMessageTests(TestCase):
    def _org(self, model, number):
        return model.objects.create(
            name=f'Wording {number}', barangay='Poblacion', registration_number=number, date_organized=date(2020, 1, 1),
            date_registered=date(2020, 2, 1), registration_agency='SEC', contact_person='Pat Contact', contact_number='09171234567')

    def test_a_repeated_registration_number_says_cooperative(self):
        for model, serializer, kind in (
            (FarmersOrganization, FarmersOrganizationDetailSerializer, 'farmers'),
            (FisherfolkOrganization, FisherfolkOrganizationDetailSerializer, 'fisherfolk'),
        ):
            self._org(model, f'WORD-{kind[:4]}')
            form = serializer(data={'registration_number': f'WORD-{kind[:4]}'}, partial=True)
            self.assertFalse(form.is_valid())
            message = str(form.errors['registration_number'][0])
            self.assertEqual(message, f'A {kind} cooperative with this registration number already exists.')

    def test_user_management_names_the_account_type_cooperative(self):
        User = get_user_model()
        user = User.objects.create_user(username='wording-user', password='x-Test-pass-123', role='CITIZEN')
        user.linked_records.create(record_type='FARMERS_ORG', record_id=1, is_active=False)
        user.linked_records.create(record_type='FISHERFOLK_ORG', record_id=2, is_active=False)
        labels = [r['label'] for r in UserSerializer().get_other_linked_records(user)]
        self.assertEqual(labels, ['Farmers Cooperative', 'Fisherfolk Cooperative'])


class MachineryOwnershipWordingTests(SimpleTestCase):
    def test_the_file_may_say_cooperative_owned_and_the_saved_value_is_unchanged(self):
        from farmers.parcel_machinery_import import MACHINERY_NOTE, parse_machinery_cells
        for typed in ('Cooperative-Owned', 'cooperative-owned', 'Organization-Owned'):
            self.assertEqual(parse_machinery_cells(['Hand Tractor', '1', typed, ''])['ownership'], 'Organization-Owned', typed)
        self.assertIn('Cooperative-Owned', MACHINERY_NOTE)
        self.assertNotIn('Organization', MACHINERY_NOTE)

    def test_the_label_shown_for_the_saved_value(self):
        from farmers.machinery_labels import ownership_label
        self.assertEqual(ownership_label('Organization-Owned'), 'Cooperative-Owned')
        self.assertEqual(ownership_label('Borrowed'), 'Borrowed')
        self.assertEqual(ownership_label(''), '')
