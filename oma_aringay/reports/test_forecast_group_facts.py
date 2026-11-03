"""The Crop Forecasting "By farmer" view groups the Farmer Crop History report's records by farmer; each record names its farmer's RSBSA number,
barangay and contact number so the group row can show them like the ordinary table does."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import Farmer
from production.test_monitoring_list_query_count import make_record

URL = '/api/reports/farmer-crop-history/'


class FarmerCropHistoryFactsTests(APITestCase):
    def setUp(self):
        self.client.force_authenticate(get_user_model().objects.create_user(username='ff-admin', password='pw', role='ADMIN', email='ff@x.test'))

    def records(self):
        response = self.client.get(URL, {'format': 'json'})
        self.assertEqual(response.status_code, 200, response.content[:200])
        return response.json()['records']

    def test_each_record_carries_its_farmers_rsbsa_barangay_and_contact_number(self):
        record = make_record()
        Farmer.objects.filter(pk=record.farmer_id).update(contact_number='09178889999', barangay='Baracbac')
        row = next(r for r in self.records() if r['id'] == record.id)
        self.assertEqual(row['farmer_rsbsa'], record.farmer.rsbsa_number)
        self.assertEqual(row['farmer_barangay'], 'Baracbac')          # the farmer's own barangay, not the field's
        self.assertEqual(row['farmer_contact'], '09178889999')
        self.assertEqual(row['barangay'], 'Alaska')                    # the existing field-location barangay is unchanged

    def test_a_farmer_with_no_contact_number_has_an_empty_one(self):
        record = make_record()
        row = next(r for r in self.records() if r['id'] == record.id)
        self.assertEqual(row['farmer_contact'], '')

    def test_the_existing_fields_are_unchanged(self):
        record = make_record()
        row = next(r for r in self.records() if r['id'] == record.id)
        for key in ('id', 'farmer', 'barangay', 'crop_type', 'status', 'variance_pct', 'is_total_loss'):
            self.assertIn(key, row)
