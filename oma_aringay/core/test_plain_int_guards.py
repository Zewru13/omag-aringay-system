"""Whole-number checks must reject look-alike digits ('²', Arabic-Indic digits) and absurdly long numbers with a clean
answer instead of crashing (`str.isdigit()` accepts them, then `int()` raises)."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from associations.models import FarmersOrganization
from core.utils import is_plain_int

User = get_user_model()
_N = itertools.count(1)


class IsPlainIntTests(APITestCase):
    def test_only_short_ascii_digit_strings_count(self):
        for good in ('0', '7', '123456789'):
            self.assertTrue(is_plain_int(good), good)
        for bad in ('', ' ', '²', '٣', '１２', '12a', '-1', '1.5', '1' * 40, '1234567890', None, 12):
            self.assertFalse(is_plain_int(bad), repr(bad))


class EndpointsAnswerCleanlyTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = User.objects.create_user(username='pi-staff', password='pw', role='ADMIN', email='pi-staff@x.test')
        n = next(_N)
        cls.org = FarmersOrganization.objects.create(
            name=f'Int Guard {n}', barangay='Alaska', registration_number=f'PI-{n:05d}', date_organized=date(2020, 1, 1),
            date_registered=date(2020, 2, 1), registration_agency='SEC', contact_person='Pat', contact_number='09171234567')

    def setUp(self):
        self.client.force_authenticate(self.staff)

    def test_equipment_import_marks_odd_quantities_invalid_instead_of_failing(self):
        header = 'Equipment,Quantity,Condition,Acquisition Date (YYYY-MM-DD),Remarks\n'
        body = f'Hand Tractor,²,Good,,\nRice Thresher,{"9" * 40},Good,,\nWater Pump,5,Good,,\n'
        upload = SimpleUploadedFile('equipment.csv', (header + body).encode(), content_type='text/csv')
        res = self.client.post(f'/api/organizations/farmers/{self.org.id}/equipment/import/', {'file': upload}, format='multipart')
        self.assertEqual(res.status_code, 200, res.data)
        statuses = {row['label']: row['status'] for row in res.data['rows']}
        self.assertEqual(statuses['Hand Tractor'], 'invalid')
        self.assertEqual(statuses['Rice Thresher'], 'invalid')
        self.assertNotEqual(statuses['Water Pump'], 'invalid')

    def test_crop_duplicate_check_ignores_look_alike_numbers(self):
        res = self.client.get('/api/production/monitoring/check-duplicate/', {'farmer': '²', 'crop_type': '1'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data, {'duplicates': []})
        res = self.client.get('/api/production/monitoring/check-duplicate/', {'farmer': '1', 'crop_type': '9' * 40})
        self.assertEqual(res.status_code, 200)

    def test_crop_disaster_log_filters_ignore_look_alike_numbers(self):
        res = self.client.get('/api/production/disaster-logs/', {'year': '²', 'search': 'CDR-²'})
        self.assertEqual(res.status_code, 200)
        res = self.client.get('/api/production/disaster-logs/', {'year': '9' * 40, 'search': 'CDR-' + '9' * 40})
        self.assertEqual(res.status_code, 200)
