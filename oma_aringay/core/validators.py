import re
from datetime import date

from django.core.exceptions import ValidationError

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
RSBSA_PATTERNS = (RSBSA_RE_A, RSBSA_RE_B, RSBSA_RE_C, RSBSA_RE_D)
PHILSYS_RE = re.compile(r'^\d{4}-\d{4}-\d{4}-\d{4}$')
LGU_REG_RE = re.compile(r'^\d{4}-03302-\d{4}$')
FISHR_RE = re.compile(r'^01-33-02-\d{4}-\d{4}$')
PARCEL_NUMBER_RE = re.compile(r'^\d{2}-\d{2}-\d{2}-\d{3}-\d{3}-\d{2}-\d{3}$')
TAX_DECLARATION_RE = re.compile(r'^\d{2}-\d{3}-\d{5}-\d{4}-\d{4}$')


def validate_rsbsa(value):
    if not value:
        return
    if not any(pattern.match(value) for pattern in RSBSA_PATTERNS):
        raise ValidationError(
            'Invalid RSBSA number. Expected one of: 01-33-02-014-058212, '
            'BF-01-033-02-023-00000033, 01-033-02-019-000151, or '
            'BF-01-033-02-004-000007.'
        )


def validate_philsys(value):
    if not value:
        return
    if not PHILSYS_RE.match(value):
        raise ValidationError(
            'Invalid PhilSys number. Expected format: NNNN-NNNN-NNNN-NNNN '
            '(e.g. 8419-5032-7741-3096).'
        )


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
    if not FISHR_RE.match(value):
        raise ValidationError(
            'Invalid FishR number. Expected format: 01-33-02-YYYY-NNNN '
            '(e.g. 01-33-02-2026-0415).'
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


def validate_uploaded_image(f):
    """Raise ValidationError unless `f` is a real jpg/png/webp under 5 MB."""
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

    # Actually decode it. verify() consumes the file object, so rewind after
    # so the caller can still save it.
    try:
        from PIL import Image
        f.seek(0)
        Image.open(f).verify()
    except ValidationError:
        raise
    except Exception:
        raise ValidationError('That file is not a readable image.')
    finally:
        try:
            f.seek(0)
        except Exception:
            pass
    return f
