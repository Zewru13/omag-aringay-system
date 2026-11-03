"""Lists the app asks for on almost every page must not make a database query per row: a page makes several requests, each query is a round
trip to the database, and the lists grow with the records."""
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from production.models import CropCategory, CropRemark, CropSubcategory, CropType

URL = '/api/production/crop-types/'


def queries_for(client, url):
    with CaptureQueriesContext(connection) as ctx:
        response = client.get(url)
    assert response.status_code == 200, response.content[:200]
    return len(ctx.captured_queries), response.json()


class CropTypeListQueryCountTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='ct-admin', password='pw', role='ADMIN', email='cta@x.test')
        cls.category = CropCategory.objects.create(name='Cereals')
        cls.sub = CropSubcategory.objects.create(name='Rice', category=cls.category)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def add_crop_types(self, count, start=0):
        for i in range(start, start + count):
            crop = CropType.objects.create(name=f'Crop {i}', days_to_harvest=90, yield_per_ha_kg=1000, category=self.category, subcategory=self.sub)
            for j in range(2):
                CropRemark.objects.create(crop_type=crop, custom_status='Note', remark_text=f'Remark {i}-{j}', recorded_by=self.admin)

    def test_the_number_of_queries_does_not_grow_with_the_number_of_crop_types(self):
        seeded = CropType.objects.count()   # the migrations already add the usual crops
        self.add_crop_types(2)
        few, body_few = queries_for(self.client, URL)
        self.add_crop_types(8, start=2)
        many, body_many = queries_for(self.client, URL)
        self.assertEqual((len(body_few), len(body_many)), (seeded + 2, seeded + 10))
        self.assertEqual(many, few, f'{few} queries for {seeded + 2} crop types but {many} for {seeded + 10}')

    def test_each_crop_type_still_lists_its_remarks_newest_first_with_who_wrote_them(self):
        self.add_crop_types(1)
        crop = CropType.objects.get(name='Crop 0')
        CropRemark.objects.filter(crop_type=crop, remark_text='Remark 0-0').update(remark_text='older')
        newest = CropRemark.objects.create(crop_type=crop, custom_status='Latest', remark_text='newest', recorded_by=self.admin)
        _, body = queries_for(self.client, URL)
        row = next(r for r in body if r['id'] == crop.id)
        remarks = row['remarks']
        self.assertEqual(len(remarks), 3)
        self.assertEqual(remarks[0]['id'], newest.id)
        self.assertEqual(remarks[0]['recorded_by_name'], getattr(self.admin, 'full_name', str(self.admin)))
        self.assertEqual((row['category_name'], row['subcategory_name']), ('Cereals', 'Rice'))
