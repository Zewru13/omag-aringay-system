import re
from datetime import date

from django.core.exceptions import ValidationError
from rest_framework import serializers

from core.idnumbers import MAX_ID_DIGITS, is_free_id

# Batch 8: the real RSBSA/BFAR registry import surfaced 4 distinct real
# formats in actual use — not one canonical shape. Each is matched
# separately and stored/validated in its own source format (no forced
# normalization):
#   A) 01-33-02-006-000230            (DA, no prefix — this is the
#      original/only pattern this validator accepted before Batch 8)
#   B) BF-01-033-02-023-00000033      (BFAR, prefixed, 8-digit last segment)
#   C) 01-033-02-019-000151           (no prefix, 3-digit province segment)
#   D) BF-01-033-02-004-000007        (BFAR, prefixed, 6-digit last segment)
# All 4 keep the literal "01-33-02"/"01-033-02" region-province-municipality
# prefix (matching what's actually observed — Aringay, La Union) rather than
# genericizing to \d{2}-\d{2}-\d{2}, so garbage values still fail validation.
RSBSA_RE_A = re.compile(r'^01-33-02-\d{3}-\d{6}$')
RSBSA_RE_B = re.compile(r'^BF-01-033-02-\d{3}-\d{8}$')
RSBSA_RE_C = re.compile(r'^01-033-02-\d{3}-\d{6}$')
RSBSA_RE_D = re.compile(r'^BF-01-033-02-\d{3}-\d{6}$')
# E) 01-033-02-011-XIIRZA            (2026 BFAR provisional-ID format,
#    confirmed against 395 of 396 real values found in the 2026 RSBSA
#    refresh — see the investigation this pattern is built from). Same
#    "01-033-02-DDD-" shape as C, but the last segment is alphanumeric
#    instead of digits — always digits 1-9 plus A-Z, NEVER the digit 0 (a
#    real, consistent trait of every one of the 395, not an assumption: a
#    0/O-confusion-avoiding ID scheme, not corruption). Tail length is 6-or-7
#    characters: 395 of the 396 real values are 6 characters; the one
#    remaining real anomaly (Benidicto Malicay, 01-033-02-005-FEEMJKX) is
#    7 — a deliberate, later decision to widen this pattern in place (same
#    prefix rules, same character set, just one more allowed tail length)
#    rather than leave that single real, confirmed person permanently
#    unmatchable. Not widened further than 7 — an 8+ character tail has
#    never been observed and would just as easily be padding/corruption.
RSBSA_RE_E = re.compile(r'^01-033-02-\d{3}-[1-9A-Z]{6,7}$')
RSBSA_PATTERNS = (RSBSA_RE_A, RSBSA_RE_B, RSBSA_RE_C, RSBSA_RE_D, RSBSA_RE_E)
PHILSYS_RE = re.compile(r'^\d{4}-\d{4}-\d{4}-\d{4}$')
LGU_REG_RE = re.compile(r'^\d{4}-03302-\d{4}$')
FISHR_RE = re.compile(r'^01-33-02-\d{4}-\d{4}$')
PARCEL_NUMBER_RE = re.compile(r'^\d{2}-\d{2}-\d{2}-\d{3}-\d{3}-\d{2}-\d{3}$')
TAX_DECLARATION_RE = re.compile(r'^\d{2}-\d{3}-\d{5}-\d{4}-\d{4}$')


def is_valid_rsbsa(value):
    """Typed by hand: digit groups with single dashes, 20 digits at most. The five older shapes (BF- prefix, letters
    in the last group) are still accepted so records saved with them can be saved again."""
    value = (value or '').strip()
    return is_free_id(value) or any(pattern.match(value) for pattern in RSBSA_PATTERNS)


def validate_rsbsa(value):
    if not value:
        return
    if not is_valid_rsbsa(value):
        raise ValidationError(
            f'Invalid RSBSA number. Use digits only, up to {MAX_ID_DIGITS} digits; the dashes are added as you type '
            '(for example 01-33-02-014-058212).'
        )


def validate_philsys(value):
    if not value:
        return
    if not PHILSYS_RE.match(value):
        raise ValidationError(
            'Invalid PhilSys number. Expected format: NNNN-NNNN-NNNN-NNNN '
            '(e.g. 8419-5032-7741-3096).'
        )


# No longer used by any model (the fisherfolk LGU registration number was removed); kept only because the historical
# migration fisheries/0026 still refers to it by name.
def validate_lgu_reg(value):
    if not value:
        return
    if not LGU_REG_RE.match(value):
        raise ValidationError(
            'Invalid LGU registration number. Expected format: YYYY-03302-NNNN '
            '(e.g. 2026-03302-0001).'
        )


def validate_fishr(value):
    if not value:
        return
    if not (is_free_id(value) or FISHR_RE.match(value)):
        raise ValidationError(
            f'Invalid FishR number. Use digits only, up to {MAX_ID_DIGITS} digits; the dashes are added as you type '
            '(for example 01-33-02-2026-0415).'
        )


def validate_parcel_number(value):
    if not value:
        return
    if not PARCEL_NUMBER_RE.match(value):
        raise ValidationError(
            'Invalid parcel number. Expected format: RR-PP-MM-BBB-SSS-LL-NNN '
            '(Region-Province-Municipality-Barangay-Section-Block-Lot), '
            'e.g. 01-33-02-005-001-02-003.'
        )


def validate_tax_declaration_number(value):
    if not value:
        return
    if not TAX_DECLARATION_RE.match(value):
        raise ValidationError(
            'Invalid tax declaration number. Expected format: RR-MMM-BBBBB-YYYY-NNNN '
            '(Region-Municipality-Barangay-RevisionYear-PropertySequence), '
            'e.g. 01-002-00005-2023-0142.'
        )


def validate_not_future_date(value, label='Date'):
    """
    Shared DRF validate_<field> helper for event/record dates that already
    happened (date planted, date stocked, harvest date, etc). Not for
    forward-looking dates (expected_harvest_date, next_visit_date, license
    expiry) — those must stay uncapped and should not call this.
    Raises django.core.exceptions.ValidationError, which DRF's
    Serializer.to_internal_value() catches the same as serializers.ValidationError.
    """
    if value and value > date.today():
        raise ValidationError(f'{label} cannot be in the future.')


# ─── Batch: profile picture / organization logo uploads ───────────────────
# Deliberately BOTH checks, not either:
#   - extension+mimetype is what the browser claims,
#   - Pillow actually decoding the file is what it really is.
# A .jpg that is really a PDF passes the first and fails the second, which
# is the case that matters — Django's ImageField alone would accept the
# upload and only blow up later when something tried to render it.
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_IMAGE_CONTENT_TYPES = {'image/jpeg', 'image/png', 'image/webp'}
ALLOWED_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}
# A small file can decode to a huge picture (a 12000 x 12000 PNG is a few KB and ~144 MB of memory): refuse by pixel count.
MAX_IMAGE_PIXELS = 50_000_000
# Larger photos are scaled down to this on either side (a phone photo is 4000+ px; reports and PDFs never need that).
MAX_IMAGE_SIDE = 3000


_FORMATS = {'JPEG': ('.jpg', 'image/jpeg'), 'PNG': ('.png', 'image/png'), 'WEBP': ('.webp', 'image/webp')}


def _reencode(f):
    """Decode the upload completely and replace its content, in place, with a freshly written copy of the picture.

    What a visitor can hide inside a "photo" never survives this: GPS position and device model (EXIF), text chunks,
    bytes appended after the image data (a script, a PHP line), and anything that only a lenient viewer would accept.
    The phone's rotation flag is applied to the pixels first, so a portrait photo does not turn sideways."""
    import io
    import uuid
    import warnings

    from PIL import Image, ImageOps

    too_large = ValidationError('That image has too many pixels (the picture itself is too large). Please use a smaller photo.')
    f.seek(0)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', Image.DecompressionBombWarning)
            image = Image.open(f)
            fmt = image.format
            if fmt not in _FORMATS:
                raise ValidationError('Unsupported file type. Please upload a JPG, PNG, or WEBP image.')
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise too_large
            image.load()                                   # a cut-off or corrupt file fails here, not later
            icc_profile = image.info.get('icc_profile')
            image = ImageOps.exif_transpose(image)
    except Image.DecompressionBombError:
        raise too_large
    except ValidationError:
        raise
    except Exception:
        raise ValidationError('That file is not a readable image.')

    image.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.LANCZOS)
    if fmt == 'JPEG':
        if image.mode not in ('RGB', 'L'):
            image = image.convert('RGB')
        options = {'quality': 88, 'optimize': True}
    elif fmt == 'PNG':
        if image.mode not in ('1', 'L', 'LA', 'P', 'RGB', 'RGBA'):
            image = image.convert('RGBA')
        options = {'optimize': True}
    else:
        if image.mode not in ('RGB', 'RGBA'):
            image = image.convert('RGBA' if 'A' in image.mode or image.mode == 'P' else 'RGB')
        options = {'quality': 88}
    if icc_profile:
        options['icc_profile'] = icc_profile           # colour profile only; it cannot carry a location

    out = io.BytesIO()
    image.save(out, fmt, **options)
    old = f.file
    f.file = out
    f.size = out.tell()
    f.name = uuid.uuid4().hex + _FORMATS[fmt][0]       # never the device's name (often a person's name or an ID number)
    f.content_type = _FORMATS[fmt][1]
    out.seek(0)
    try:
        old.close()
    except Exception:
        pass


def validate_uploaded_image(f):
    """Raise ValidationError unless `f` is a real jpg/png/webp under 5 MB; then clean it.

    On success the upload object itself has been rewritten (see _reencode), so whatever the caller saves is the clean
    copy: re-encoded, metadata-free, scaled to at most MAX_IMAGE_SIDE, with a random name and its true extension."""
    if f is None:
        return f

    if f.size > MAX_UPLOAD_BYTES:
        mb = MAX_UPLOAD_BYTES // (1024 * 1024)
        raise ValidationError(
            f'Image is too large ({f.size / 1024 / 1024:.1f} MB). Maximum is {mb} MB.'
        )

    name = (getattr(f, 'name', '') or '').lower()
    ext = name[name.rfind('.'):] if '.' in name else ''
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValidationError(
            'Unsupported file type. Please upload a JPG, PNG, or WEBP image.'
        )

    content_type = getattr(f, 'content_type', '') or ''
    if content_type and content_type.lower() not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise ValidationError(
            'Unsupported file type. Please upload a JPG, PNG, or WEBP image.'
        )

    _reencode(f)
    return f


# ─── Contact number ──────────────────────────────────────────────────────────
# One rule for every phone number in the system: exactly 09 followed by 9 digits (11 digits, no spaces, dashes or
# +63). The forms stop the user typing anything else; this keeps a hand-made request or an import honest too.
CONTACT_NUMBER_RE = re.compile(r'^09\d{9}$')


def validate_contact_number(value, instance=None):
    """Blank is accepted (the field is optional wherever it is used); anything else must be 09XXXXXXXXX.
    `instance` is the record being updated: a number it already holds is accepted as it is, so an older record saved
    in another format can still be edited, and the number only has to be fixed when someone changes it."""
    if value and value.strip():
        cleaned = value.strip()
        if instance is not None and cleaned == (getattr(instance, 'contact_number', None) or '').strip():
            return cleaned
        if not CONTACT_NUMBER_RE.match(cleaned):
            raise serializers.ValidationError('Contact number must be exactly 11 digits and start with 09.')
        return cleaned
    return '' if value is not None else value


def normalize_contact_number(raw):
    """Turn a common paste into the plain format (0917-123-4567, +63 917 123 4567, 639171234567, 9171234567 all
    become 09171234567). Anything that cannot be fixed this way is returned unchanged so the validator refuses it."""
    value = (raw or '').strip()
    if not value:
        return ''
    digits = ''.join(ch for ch in value if ch.isdigit())
    if digits.startswith('63') and len(digits) == 12:
        digits = '0' + digits[2:]
    elif len(digits) == 10 and digits.startswith('9'):
        digits = '0' + digits
    return digits if CONTACT_NUMBER_RE.match(digits) else value
