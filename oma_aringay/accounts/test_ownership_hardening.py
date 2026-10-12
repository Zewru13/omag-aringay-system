"""A citizen is matched to a record by its number, and a farmer id and a fisherfolk id can be the same number.
So every view that compares them must say which kind of record it means - and one that forgets must refuse citizens."""
from types import SimpleNamespace

from django.test import SimpleTestCase

from accounts.permissions import IsStaffOrOwnRecordCitizen
from fisheries.views import PondListCreateView


def citizen(linked_type, linked_id):
    return SimpleNamespace(is_authenticated=True, role='CITIZEN', linked_record_type=linked_type, linked_record_id=linked_id)


def request_by(user, method='GET'):
    return SimpleNamespace(user=user, method=method)


class View:
    def __init__(self, **attrs):
        self.__dict__.update(attrs)

    def get_target_owner_id(self, request):
        return 5

    def get_object_owner_id(self, obj):
        return 5


class FailClosedTests(SimpleTestCase):
    permission = IsStaffOrOwnRecordCitizen()

    def test_a_view_that_does_not_name_its_record_type_refuses_citizens(self):
        view = View()                                   # no owner_record_type
        self.assertFalse(self.permission.has_permission(request_by(citizen('FARMER', 5)), view))
        self.assertFalse(self.permission.has_object_permission(request_by(citizen('FARMER', 5)), view, object()))

    def test_staff_do_not_need_it(self):
        staff = SimpleNamespace(is_authenticated=True, role='EVALUATOR')
        self.assertTrue(self.permission.has_permission(request_by(staff), View()))

    def test_the_matching_domain_and_number_is_still_allowed(self):
        view = View(owner_record_type='FISHERFOLK')
        self.assertTrue(self.permission.has_permission(request_by(citizen('FISHERFOLK', 5)), view))
        self.assertTrue(self.permission.has_object_permission(request_by(citizen('FISHERFOLK', 5)), view, object()))

    def test_the_other_domain_with_the_same_number_is_refused(self):
        view = View(owner_record_type='FISHERFOLK')
        self.assertFalse(self.permission.has_permission(request_by(citizen('FARMER', 5)), view))
        self.assertFalse(self.permission.has_object_permission(request_by(citizen('FARMER', 5)), view, object()))


class PondViewTests(SimpleTestCase):
    def test_the_pond_list_names_its_record_type(self):
        # Ponds belong to a fisherfolk; a farmer whose id equals that fisherfolk's id must not be able to list them.
        self.assertEqual(PondListCreateView.owner_record_type, 'FISHERFOLK')
