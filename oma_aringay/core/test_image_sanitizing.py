"""Every accepted photo is re-encoded: no location/device metadata, no hidden extra bytes, a random name, bounded size."""
import io
import struct
import zlib

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase
from PIL import Image

from core.validators import MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE, validate_uploaded_image


def jpeg_with_gps(size=(64, 32), orientation=None):
    exif = Image.Exif()
    exif[0x010F] = 'PhoneMaker'
    exif[0x0110] = 'Galaxy-Test-Device'
    if orientation:
        exif[0x0112] = orientation
    gps = exif.get_ifd(0x8825)
    gps[1], gps[2], gps[3], gps[4] = 'N', (16.0, 24.0, 12.0), 'E', (120.0, 21.0, 30.0)
    stream = io.BytesIO()
    Image.new('RGB', size, (200, 50, 50)).save(stream, 'JPEG', exif=exif)
    return stream.getvalue()


def encoded(fmt, size=(16, 16), mode='RGB'):
    stream = io.BytesIO()
    Image.new(mode, size, (10, 120, 30) if mode == 'RGB' else 128).save(stream, fmt)
    return stream.getvalue()


def upload(data, name='photo.png', content_type='image/png'):
    return SimpleUploadedFile(name, data, content_type=content_type)


def stored(f):
    f.seek(0)
    return f.read()


def huge_png(width, height):
    """A valid 1-bit PNG of width x height pixels that is only a few KB."""
    row = b'\x00' + b'\x00' * ((width + 7) // 8)
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 1, 0, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(row * height, 9)) + chunk(b'IEND', b''))


class MetadataTests(SimpleTestCase):
    def test_location_and_device_metadata_are_removed(self):
        f = upload(jpeg_with_gps(), 'gps.jpg', 'image/jpeg')
        validate_uploaded_image(f)
        image = Image.open(io.BytesIO(stored(f)))
        self.assertFalse(image.getexif().get_ifd(0x8825), 'GPS block survived')
        self.assertNotIn(0x010F, image.getexif())
        self.assertNotIn(b'Galaxy-Test-Device', stored(f))

    def test_phone_rotation_is_applied_not_lost(self):
        # A portrait phone photo is stored sideways with an "rotate me" flag. Removing the flag must not turn it sideways.
        f = upload(jpeg_with_gps(size=(40, 20), orientation=6), 'p.jpg', 'image/jpeg')
        validate_uploaded_image(f)
        self.assertEqual(Image.open(io.BytesIO(stored(f))).size, (20, 40))

    def test_bytes_hidden_after_the_image_are_dropped(self):
        f = upload(encoded('PNG') + b'<script>alert(1)</script>', 'poly.png')
        validate_uploaded_image(f)
        self.assertNotIn(b'<script>', stored(f))
        f = upload(encoded('JPEG') + b'<?php system($_GET["c"]); ?>', 'poly.jpg', 'image/jpeg')
        validate_uploaded_image(f)
        self.assertNotIn(b'<?php', stored(f))


class NameAndTypeTests(SimpleTestCase):
    def test_the_name_is_random_and_the_extension_matches_the_real_format(self):
        names = set()
        for _ in range(3):
            f = upload(encoded('JPEG'), 'Juan Dela Cruz - ID.png', 'image/png')   # a JPEG that claims to be a PNG
            validate_uploaded_image(f)
            self.assertRegex(f.name, r'^[0-9a-f]{32}\.jpg$')
            self.assertEqual(f.content_type, 'image/jpeg')
            names.add(f.name)
        self.assertEqual(len(names), 3)

    def test_each_allowed_format_survives_as_itself(self):
        for fmt, ext, ctype in (('PNG', '.png', 'image/png'), ('JPEG', '.jpg', 'image/jpeg'), ('WEBP', '.webp', 'image/webp')):
            f = upload(encoded(fmt), f'a{ext}', ctype)
            validate_uploaded_image(f)
            self.assertTrue(f.name.endswith(ext), (fmt, f.name))
            self.assertEqual(Image.open(io.BytesIO(stored(f))).format, fmt)

    def test_the_size_attribute_and_read_position_are_updated(self):
        f = upload(encoded('PNG') + b'x' * 5000)
        validate_uploaded_image(f)
        self.assertEqual(f.size, len(stored(f)))
        f.seek(0)
        self.assertTrue(f.read(8).startswith(b'\x89PNG'))

    def test_other_formats_are_refused_even_with_a_png_name(self):
        for fmt in ('GIF', 'BMP', 'TIFF'):
            with self.assertRaises(ValidationError, msg=fmt):
                validate_uploaded_image(upload(encoded(fmt), 'x.png'))

    def test_a_cut_off_image_is_refused(self):
        data = encoded('PNG', size=(200, 200))
        with self.assertRaises(ValidationError):
            validate_uploaded_image(upload(data[: len(data) // 2]))

    def test_odd_color_modes_still_work(self):
        for fmt, mode in (('PNG', 'L'), ('PNG', 'RGBA'), ('JPEG', 'L'), ('WEBP', 'RGBA')):
            f = upload(encoded(fmt, mode=mode), 'a.' + fmt.lower(), 'image/' + fmt.lower())
            validate_uploaded_image(f)
            Image.open(io.BytesIO(stored(f))).load()


class SizeLimitTests(SimpleTestCase):
    def test_a_tiny_file_that_decodes_to_a_huge_picture_is_refused(self):
        self.assertGreater(12000 * 12000, MAX_IMAGE_PIXELS)
        for side in (12000, 30000):   # 144 and 900 megapixels, a few KB each
            with self.assertRaises(ValidationError, msg=side) as ctx:
                validate_uploaded_image(upload(huge_png(side, side)))
            self.assertIn('too large', ' '.join(ctx.exception.messages).lower())

    def test_a_large_photo_is_scaled_down(self):
        f = upload(encoded('JPEG', size=(MAX_IMAGE_SIDE + 1500, 400)), 'wide.jpg', 'image/jpeg')
        validate_uploaded_image(f)
        self.assertEqual(max(Image.open(io.BytesIO(stored(f))).size), MAX_IMAGE_SIDE)

    def test_a_normal_photo_keeps_its_dimensions(self):
        f = upload(encoded('PNG', size=(800, 600)))
        validate_uploaded_image(f)
        self.assertEqual(Image.open(io.BytesIO(stored(f))).size, (800, 600))
