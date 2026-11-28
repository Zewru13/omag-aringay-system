"""A Tenant or Lessee parcel has no Tax Declaration Number: a new one is saved without it (imports included). A number that was saved
before stays in the database: editing such a parcel never changes, clears or complains about it."""
from rest_framework.test import APITestCase

from django.contrib.auth import get_user_model

from .models import FarmParcel
from .test_parcel_import import OTHER_NO, PARCEL_HEADERS, PARCEL_NO, make_farmer, parcel_row, xlsx

TAX_DEC = '01-002-00005-2023-0142'
OTHER_TAX_DEC = '01-002-00005-2023-0999'
TENURE = ('Tenant', 'Lessee')


class TenantTaxDecTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='ttd-admin', password='pw', role='ADMIN', email='ttd@x.test')
        cls.farmer = make_farmer()

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def send(self, ownership, tax=TAX_DEC, number=PARCEL_NO):
        owner = 'Juan Dela Cruz' if ownership in TENURE else ''
        row = {'parcel_number': number, 'area_hectares': 1.5, 'barangay': 'Alaska', 'land_ownership': ownership,
               'land_owner_name': owner, 'farm_type': 'Irrigated', 'cropping_schedule': 'Single Cropping',
               'tax_declaration_number': tax}
        return self.client.post(f'/api/farmers/{self.farmer.id}/parcels/bulk/', [row], format='json')

    def stored(self, ownership, number=PARCEL_NO):
        """A parcel saved before this rule: its number is already in the database."""
        return FarmParcel.objects.create(
            farmer=self.farmer, parcel_number=number, area_hectares='1.50', barangay='Alaska', land_ownership=ownership,
            land_owner_name='Juan Dela Cruz' if ownership in TENURE else '', tax_declaration_number=TAX_DEC)

    def patch(self, parcel, body):
        return self.client.patch(f'/api/farmers/parcels/{parcel.id}/', body, format='json')

    def test_a_new_tenant_parcel_is_saved_without_a_tax_dec(self):
        for ownership, number in zip(TENURE, (PARCEL_NO, OTHER_NO)):
            with self.subTest(ownership):
                r = self.send(ownership, number=number)
                self.assertEqual(r.status_code, 201, r.content)
                self.assertEqual(FarmParcel.objects.get(pk=r.json()[0]['id']).tax_declaration_number, '')

    def test_a_new_owner_parcel_keeps_its_tax_dec(self):
        r = self.send('Owner')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(FarmParcel.objects.get(pk=r.json()[0]['id']).tax_declaration_number, TAX_DEC)

    def test_editing_a_tenant_parcel_never_changes_the_saved_number(self):
        for ownership, number in zip(TENURE, (PARCEL_NO, OTHER_NO)):
            parcel = self.stored(ownership, number)
            for sent in ('', OTHER_TAX_DEC):
                with self.subTest(ownership=ownership, sent=sent):
                    r = self.patch(parcel, {'barangay': 'Basca', 'tax_declaration_number': sent})
                    self.assertEqual(r.status_code, 200, r.content)
                    parcel.refresh_from_db()
                    self.assertEqual((parcel.barangay, parcel.tax_declaration_number), ('Basca', TAX_DEC))

    def test_the_hidden_number_does_not_make_the_parcel_number_required(self):
        parcel = self.stored('Tenant')
        r = self.patch(parcel, {'parcel_number': ''})
        self.assertEqual(r.status_code, 200, r.content)
        parcel.refresh_from_db()
        self.assertEqual((parcel.parcel_number, parcel.tax_declaration_number), ('', TAX_DEC))

    def test_an_owner_parcel_still_needs_its_number_with_a_tax_dec(self):
        r = self.patch(self.stored('Owner'), {'parcel_number': ''})
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('parcel_number', r.json())

    def test_a_parcel_switched_to_tenant_keeps_the_saved_number(self):
        parcel = self.stored('Owner')
        r = self.patch(parcel, {'land_ownership': 'Tenant', 'land_owner_name': 'Juan Dela Cruz', 'tax_declaration_number': ''})
        self.assertEqual(r.status_code, 200, r.content)
        parcel.refresh_from_db()
        self.assertEqual((parcel.land_ownership, parcel.tax_declaration_number), ('Tenant', TAX_DEC))

    def test_an_owner_parcel_can_still_clear_its_tax_dec(self):
        parcel = self.stored('Owner')
        r = self.patch(parcel, {'tax_declaration_number': ''})
        self.assertEqual(r.status_code, 200, r.content)
        parcel.refresh_from_db()
        self.assertEqual(parcel.tax_declaration_number, '')

    def test_an_import_ignores_the_tax_dec_of_a_tenant_row(self):
        row = parcel_row(ownership='Lessee', owner='Juan Dela Cruz', tax='12345')   # not even a valid number
        r = self.client.post(f'/api/farmers/{self.farmer.id}/parcels/import/', {'file': xlsx(PARCEL_HEADERS, [row])}, format='multipart')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['created'], 1, r.json())
        self.assertEqual(FarmParcel.objects.get(farmer=self.farmer).tax_declaration_number, '')
