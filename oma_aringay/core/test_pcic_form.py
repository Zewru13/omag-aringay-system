"""PCIC insurance on a crop, pond, planting or stocking record: a "has PCIC insurance" box and, once it is ticked, a
photo of the PCIC insurance form kept with the record for documentation."""
import io
from datetime import date

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIRequestFactory, APITestCase

from accounts.models import UserLinkedRecord
from farmers.models import Farmer, FarmCrop, FarmParcel
from farmers.serializers import FarmCropSerializer
from fisheries.models import Fisherfolk, Pond, SpeciesCategory, SpeciesOption, StockingRecord
from fisheries.serializers import PondSerializer, StockingRecordSerializer
from production.models import CropMonitoringRecord, CropType
from production.serializers import CropMonitoringRecordSerializer

User = get_user_model()


def image(name='pcic.png', color=(30, 120, 60)):
    buf = io.BytesIO()
    Image.new('RGB', (40, 30), color).save(buf, format='PNG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/png')


def farmer(n):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-98%04d' % n, first_name='Pcic', last_name=f'Farmer{n}', gender='Male',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


class PcicFormTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='pc-admin', password='pw', role='ADMIN', email='pc@x.test')
        cls.farmer = farmer(1)
        cls.other_farmer = farmer(2)
        parcel = FarmParcel.objects.create(farmer=cls.farmer, area_hectares='1.00', land_ownership='Owner', barangay='Alaska')
        cls.crop = FarmCrop.objects.create(farm_parcel=parcel, crop_name='Corn (Mais)', area_hectares='0.5000')
        cls.fisher = Fisherfolk.objects.create(
            rsbsa_number='01-033-02-019-980009', first_name='Pcic', last_name='Fisher', gender='Male',
            birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')
        cls.pond = Pond.objects.create(fisherfolk=cls.fisher, name='Pond 1')
        category, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        species, _ = SpeciesOption.objects.get_or_create(species_name='Tilapia', defaults=dict(
            category=category, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=80, default_avg_body_weight_kg='0.25'))
        cls.stocking = StockingRecord.objects.create(
            fisherfolk=cls.fisher, species=species, date_stocked=date(2026, 8, 1), number_of_fingerlings=10,
            season='Wet', year=2026, area_hectares='1.00')
        crop_type, _ = CropType.objects.get_or_create(name='Corn (Mais)', defaults=dict(days_to_harvest=100))
        cls.planting = CropMonitoringRecord.objects.create(
            farmer=cls.farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=crop_type, season='Wet',
            year=2026, date_planted=date(2026, 5, 1), area_planted_ha='1.00')
        cls.farmer_user = User.objects.create_user(username='pc-farmer', password='pw', role='CITIZEN', email='pf@x.test')
        UserLinkedRecord.objects.create(
            user=cls.farmer_user, record_type=User.LinkedRecordType.FARMER, record_id=cls.farmer.id, is_active=True)
        cls.fisher_user = User.objects.create_user(username='pc-fisher', password='pw', role='CITIZEN', email='pfi@x.test')
        UserLinkedRecord.objects.create(
            user=cls.fisher_user, record_type=User.LinkedRecordType.FISHERFOLK, record_id=cls.fisher.id, is_active=True)
        other_fisher = Fisherfolk.objects.create(
            rsbsa_number='01-033-02-019-980010', first_name='Other', last_name='Fisher', gender='Male',
            birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')
        cls.other_fisher_user = User.objects.create_user(username='pc-fisher2', password='pw', role='CITIZEN', email='pfi2@x.test')
        UserLinkedRecord.objects.create(
            user=cls.other_fisher_user, record_type=User.LinkedRecordType.FISHERFOLK, record_id=other_fisher.id, is_active=True)
        cls.other_user = User.objects.create_user(username='pc-other', password='pw', role='CITIZEN', email='po@x.test')
        UserLinkedRecord.objects.create(
            user=cls.other_user, record_type=User.LinkedRecordType.FARMER, record_id=cls.other_farmer.id, is_active=True)

    def kinds(self):
        return [
            ('crop', self.crop, f'/api/farmers/crops/{self.crop.id}/pcic-form/'),
            ('pond', self.pond, f'/api/fisheries/ponds/{self.pond.id}/pcic-form/'),
            ('stocking', self.stocking, f'/api/fisheries/stocking/{self.stocking.id}/pcic-form/'),
            ('planting', self.planting, f'/api/production/monitoring/{self.planting.id}/pcic-form/'),
        ]

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def tick(self, obj):
        type(obj).objects.filter(pk=obj.pk).update(has_pcic_insurance=True)
        obj.refresh_from_db()

    def test_records_are_not_insured_by_default(self):
        for label, obj, _url in self.kinds():
            self.assertFalse(obj.has_pcic_insurance, label)
            self.assertFalse(obj.pcic_form_photo, label)

    def test_every_serializer_carries_the_box_and_the_photo(self):
        request = APIRequestFactory().get('/')
        for serializer in (FarmCropSerializer, PondSerializer, StockingRecordSerializer, CropMonitoringRecordSerializer):
            model_obj = {FarmCropSerializer: self.crop, PondSerializer: self.pond,
                         StockingRecordSerializer: self.stocking, CropMonitoringRecordSerializer: self.planting}[serializer]
            model_obj.refresh_from_db()  # the fixtures were created with plain strings for decimals
            data = serializer(model_obj, context={'request': request}).data
            self.assertIn('has_pcic_insurance', data, serializer.__name__)
            self.assertIn('pcic_form_photo', data, serializer.__name__)
            self.assertFalse(data['has_pcic_insurance'], serializer.__name__)
            self.assertIsNone(data['pcic_form_photo'], serializer.__name__)

    def test_the_box_can_be_ticked_through_the_edit_endpoint(self):
        r = self.client.patch(f'/api/fisheries/ponds/{self.pond.id}/', {'has_pcic_insurance': True}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()['has_pcic_insurance'])

    def test_the_photo_cannot_be_set_through_the_edit_endpoint(self):
        r = self.client.patch(f'/api/fisheries/ponds/{self.pond.id}/', {'pcic_form_photo': image()}, format='multipart')
        self.assertEqual(r.status_code, 200, r.content)
        self.pond.refresh_from_db()
        self.assertFalse(self.pond.pcic_form_photo)

    def test_uploading_needs_the_box_ticked_first(self):
        for label, _obj, url in self.kinds():
            r = self.client.post(url, {'photo': image()}, format='multipart')
            self.assertEqual(r.status_code, 400, label)
            self.assertIn('PCIC', r.json()['detail'], label)

    def test_uploading_saves_the_form_with_the_record(self):
        for label, obj, url in self.kinds():
            self.tick(obj)
            r = self.client.post(url, {'photo': image()}, format='multipart')
            self.assertEqual(r.status_code, 200, f'{label}: {r.content}')
            body = r.json()
            self.assertTrue(body['has_pcic_insurance'], label)
            self.assertTrue(body['pcic_form_photo'], label)
            obj.refresh_from_db()
            self.assertTrue(obj.pcic_form_photo, label)
            self.assertIn('pcic_forms/', obj.pcic_form_photo.name, label)

    def test_a_second_upload_replaces_the_first(self):
        self.tick(self.pond)
        url = f'/api/fisheries/ponds/{self.pond.id}/pcic-form/'
        self.client.post(url, {'photo': image('a.png', (1, 2, 3))}, format='multipart')
        self.pond.refresh_from_db()
        first = self.pond.pcic_form_photo.name
        self.client.post(url, {'photo': image('b.png', (9, 8, 7))}, format='multipart')
        self.pond.refresh_from_db()
        self.assertNotEqual(self.pond.pcic_form_photo.name, first)

    def test_something_that_is_not_an_image_is_refused(self):
        self.tick(self.pond)
        bad = SimpleUploadedFile('form.png', b'this is not a picture', content_type='image/png')
        r = self.client.post(f'/api/fisheries/ponds/{self.pond.id}/pcic-form/', {'photo': bad}, format='multipart')
        self.assertEqual(r.status_code, 400)
        self.pond.refresh_from_db()
        self.assertFalse(self.pond.pcic_form_photo)

    def test_a_request_without_a_photo_is_refused(self):
        self.tick(self.pond)
        r = self.client.post(f'/api/fisheries/ponds/{self.pond.id}/pcic-form/', {}, format='multipart')
        self.assertEqual(r.status_code, 400)

    def test_the_photo_can_be_removed(self):
        self.tick(self.pond)
        url = f'/api/fisheries/ponds/{self.pond.id}/pcic-form/'
        self.client.post(url, {'photo': image()}, format='multipart')
        r = self.client.delete(url)
        self.assertEqual(r.status_code, 200, r.content)
        self.pond.refresh_from_db()
        self.assertFalse(self.pond.pcic_form_photo)
        self.assertTrue(self.pond.has_pcic_insurance)

    def test_unticking_the_box_drops_the_photo(self):
        self.tick(self.pond)
        self.client.post(f'/api/fisheries/ponds/{self.pond.id}/pcic-form/', {'photo': image()}, format='multipart')
        r = self.client.patch(f'/api/fisheries/ponds/{self.pond.id}/', {'has_pcic_insurance': False}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.pond.refresh_from_db()
        self.assertFalse(self.pond.has_pcic_insurance)
        self.assertFalse(self.pond.pcic_form_photo)

    def test_a_farmer_cannot_change_a_planting_record_so_cannot_upload_to_it_either(self):
        self.tick(self.planting)
        url = f'/api/production/monitoring/{self.planting.id}/pcic-form/'
        for user in (self.farmer_user, self.other_user):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.post(url, {'photo': image()}, format='multipart').status_code, 403)
            self.assertEqual(self.client.delete(url).status_code, 403)

    def test_a_fisherfolk_can_upload_for_their_own_stocking_record_only(self):
        self.tick(self.stocking)
        url = f'/api/fisheries/stocking/{self.stocking.id}/pcic-form/'
        self.client.force_authenticate(self.other_fisher_user)
        self.assertEqual(self.client.post(url, {'photo': image()}, format='multipart').status_code, 404)
        self.client.force_authenticate(self.fisher_user)
        self.assertEqual(self.client.post(url, {'photo': image()}, format='multipart').status_code, 200)

    def test_signed_out_requests_are_refused(self):
        self.client.force_authenticate(None)
        for label, _obj, url in self.kinds():
            self.assertIn(self.client.post(url, {'photo': image()}, format='multipart').status_code, (401, 403), label)

    def test_registration_crop_rows_are_staff_only(self):
        self.tick(self.crop)
        self.client.force_authenticate(self.farmer_user)
        r = self.client.post(f'/api/farmers/crops/{self.crop.id}/pcic-form/', {'photo': image()}, format='multipart')
        self.assertEqual(r.status_code, 403)
