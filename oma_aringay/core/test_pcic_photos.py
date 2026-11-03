"""A PCIC-insured record keeps up to 5 photos of the insurance form (its pages). The first is `pcic_form_photo` (what older screens read); every
photo is listed in `pcic_form_photos` as {id, url} (`id` is "main" for the first, a number for the others)."""
from rest_framework.test import APITestCase

from core.models import PcicFormPhoto
from core.test_pcic_form import PcicFormTests, image


class PcicPhotosTests(APITestCase):
    # The fixtures (a farm crop, a pond, a stocking record and a planting record, an admin) of the single-photo tests, without re-running them.
    setUpTestData = classmethod(PcicFormTests.setUpTestData.__func__)
    kinds = PcicFormTests.kinds
    setUp = PcicFormTests.setUp
    tick = PcicFormTests.tick

    def upload(self, url, n=1):
        return [self.client.post(url, {'photo': image(f'p{i}.png', (i * 20, 50, 90))}, format='multipart') for i in range(n)]

    def test_a_second_upload_adds_a_photo_and_the_first_stays_the_main_one(self):
        for label, obj, url in self.kinds():
            self.tick(obj)
            first, second = self.upload(url, 2)
            self.assertEqual((first.status_code, second.status_code), (200, 200), label)
            body = second.json()
            self.assertEqual([p['id'] for p in body['pcic_form_photos']][0], 'main', label)
            self.assertEqual(len(body['pcic_form_photos']), 2, label)
            self.assertEqual(body['pcic_form_photo'], body['pcic_form_photos'][0]['url'], label)
            self.assertTrue(all(p['url'] for p in body['pcic_form_photos']), label)

    def test_a_record_keeps_up_to_five_photos(self):
        self.tick(self.pond)
        url = f'/api/fisheries/ponds/{self.pond.id}/pcic-form/'
        answers = self.upload(url, 6)
        self.assertEqual([a.status_code for a in answers], [200] * 5 + [400])
        self.assertIn('5', answers[5].json()['detail'])
        self.assertEqual(len(answers[4].json()['pcic_form_photos']), 5)
        self.assertEqual(PcicFormPhoto.objects.count(), 4, 'one main photo and four more')

    def test_one_photo_can_be_removed_by_its_id(self):
        self.tick(self.pond)
        url = f'/api/fisheries/ponds/{self.pond.id}/pcic-form/'
        photos = self.upload(url, 3)[-1].json()['pcic_form_photos']
        extra = photos[1]['id']
        r = self.client.delete(url, {'photo': extra}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(len(r.json()['pcic_form_photos']), 2)
        self.assertNotIn(extra, [p['id'] for p in r.json()['pcic_form_photos']])

    def test_removing_the_main_photo_promotes_the_next_one(self):
        self.tick(self.pond)
        url = f'/api/fisheries/ponds/{self.pond.id}/pcic-form/'
        photos = self.upload(url, 2)[-1].json()['pcic_form_photos']
        second_url = photos[1]['url']
        r = self.client.delete(url, {'photo': 'main'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual([p['id'] for p in body['pcic_form_photos']], ['main'])
        self.assertEqual(body['pcic_form_photo'], body['pcic_form_photos'][0]['url'])
        self.assertEqual(body['pcic_form_photos'][0]['url'].split('?')[0].split('/')[-1], second_url.split('?')[0].split('/')[-1], 'the second photo became the main one')
        self.assertFalse(PcicFormPhoto.objects.exists())

    def test_deleting_without_a_photo_id_removes_every_photo(self):
        self.tick(self.pond)
        url = f'/api/fisheries/ponds/{self.pond.id}/pcic-form/'
        self.upload(url, 3)
        r = self.client.delete(url)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['pcic_form_photos'], [])
        self.assertIsNone(r.json()['pcic_form_photo'])
        self.assertFalse(PcicFormPhoto.objects.exists())

    def test_a_photo_id_of_another_record_is_refused(self):
        self.tick(self.pond)
        self.tick(self.crop)
        pond_url = f'/api/fisheries/ponds/{self.pond.id}/pcic-form/'
        crop_url = f'/api/farmers/crops/{self.crop.id}/pcic-form/'
        self.upload(pond_url, 2)
        other = PcicFormPhoto.objects.get()
        r = self.client.delete(crop_url, {'photo': other.id}, format='json')
        self.assertEqual(r.status_code, 404, r.content)
        self.assertTrue(PcicFormPhoto.objects.filter(pk=other.pk).exists())

    def test_unticking_the_box_drops_every_photo(self):
        self.tick(self.pond)
        self.upload(f'/api/fisheries/ponds/{self.pond.id}/pcic-form/', 3)
        r = self.client.patch(f'/api/fisheries/ponds/{self.pond.id}/', {'has_pcic_insurance': False}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(PcicFormPhoto.objects.exists())
        self.assertEqual(r.json()['pcic_form_photos'], [])

    def test_a_record_that_is_not_insured_lists_no_photos(self):
        r = self.client.get(f'/api/fisheries/ponds/{self.pond.id}/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['pcic_form_photos'], [])
