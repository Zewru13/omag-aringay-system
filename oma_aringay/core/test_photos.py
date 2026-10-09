"""The shared photo rules: at most 10 photos, each a real JPG/PNG/WEBP under 5 MB, validated before anything is saved."""
import io
import shutil
import tempfile

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from PIL import Image
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from core.photos import discard_uploaded_files, validated_photos


def png(name='photo.png', size=(8, 8)):
    stream = io.BytesIO()
    Image.new('RGB', size, (10, 120, 30)).save(stream, 'PNG')
    return SimpleUploadedFile(name, stream.getvalue(), content_type='image/png')


def big_png(name='big.png'):
    """A real PNG larger than the 5 MB limit (uncompressed noise-free pixels, compression off)."""
    stream = io.BytesIO()
    Image.new('RGB', (2200, 2200), (200, 10, 90)).save(stream, 'PNG', compress_level=0)
    assert len(stream.getvalue()) > 5 * 1024 * 1024
    return SimpleUploadedFile(name, stream.getvalue(), content_type='image/png')


def request_with(files):
    """A DRF request whose multipart body carries `files`: a list of (field name, file)."""
    data = {}
    for field, f in files:
        data.setdefault(field, []).append(f)
    raw = APIRequestFactory().post('/x/', data, format='multipart')
    request = Request(raw, parsers=[MultiPartParser(), FormParser()])
    request.data  # parse the body
    return request


class ValidatedPhotosTests(SimpleTestCase):
    def test_no_photos_is_fine(self):
        self.assertEqual(validated_photos(request_with([])), [])

    def test_valid_photos_are_returned(self):
        for count in (3, 10):
            files = validated_photos(request_with([('photos', png(f'p{i}.png')) for i in range(count)]))
            self.assertEqual(len(files), count)

    def test_more_than_ten_is_refused(self):
        with self.assertRaises(ValidationError) as ctx:
            validated_photos(request_with([('photos', png(f'p{i}.png')) for i in range(11)]))
        self.assertEqual(ctx.exception.detail['photos'][0], 'Maximum of 10 photos allowed.')

    def test_a_non_image_names_its_position(self):
        files = [('photos', png('a.png')), ('photos', SimpleUploadedFile('b.png', b'not an image', content_type='image/png'))]
        with self.assertRaises(ValidationError) as ctx:
            validated_photos(request_with(files))
        messages = [str(m) for m in ctx.exception.detail['photos']]
        self.assertEqual(len(messages), 1)
        self.assertTrue(messages[0].startswith('Photo 2: '))

    def test_a_photo_over_five_megabytes_is_refused(self):
        with self.assertRaises(ValidationError) as ctx:
            validated_photos(request_with([('photos', big_png())]))
        self.assertIn('too large', str(ctx.exception.detail['photos'][0]))

    def test_the_legacy_single_field_counts_toward_the_ten(self):
        nine = [('photos', png(f'p{i}.png')) for i in range(9)]
        files = validated_photos(request_with(nine + [('photo', png('legacy.png'))]), legacy_field='photo')
        self.assertEqual(len(files), 10)
        ten = [('photos', png(f'q{i}.png')) for i in range(10)]
        with self.assertRaises(ValidationError):
            validated_photos(request_with(ten + [('photo', png('legacy.png'))]), legacy_field='photo')

    def test_legacy_field_is_ignored_unless_asked_for(self):
        files = validated_photos(request_with([('photo', png('legacy.png'))]))
        self.assertEqual(files, [])

    def test_already_saved_photos_use_up_slots(self):
        five = [('photos', png(f'p{i}.png')) for i in range(5)]
        self.assertEqual(len(validated_photos(request_with(five), already=5)), 5)
        with self.assertRaises(ValidationError):
            validated_photos(request_with(five + [('photos', png('x.png'))]), already=5)

    def test_a_custom_field_name_is_used_in_errors(self):
        with self.assertRaises(ValidationError) as ctx:
            validated_photos(request_with([('confirmation_photos', png(f'p{i}.png')) for i in range(11)]), field='confirmation_photos')
        self.assertIn('confirmation_photos', ctx.exception.detail)


class DiscardTests(SimpleTestCase):
    def test_discard_removes_stored_files_and_ignores_missing_ones(self):
        root = tempfile.mkdtemp()
        try:
            with override_settings(MEDIA_ROOT=root):
                name = default_storage.save('photos/one.png', ContentFile(b'data'))
                self.assertTrue(default_storage.exists(name))
                discard_uploaded_files([name, 'photos/never-existed.png'])
                self.assertFalse(default_storage.exists(name))
        finally:
            shutil.rmtree(root, ignore_errors=True)
