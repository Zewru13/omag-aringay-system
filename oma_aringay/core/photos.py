"""Rules shared by every place that takes several photos (disaster reports, assistance confirmations).

At most 10 photos, each a real JPG/PNG/WEBP of at most 5 MB (core.validators.validate_uploaded_image), checked before
anything is saved so a bad photo saves nothing; and cleanup of the files a request wrote when its transaction rolls back.
"""
import logging
import os
import shutil
import tempfile
from contextlib import contextmanager

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.storage import default_storage
from rest_framework.exceptions import ValidationError

from core.validators import validate_uploaded_image

logger = logging.getLogger(__name__)

MAX_PHOTOS = 10


def validated_photos(request, field='photos', legacy_field=None, limit=MAX_PHOTOS, already=0):
    """The multipart photo files of a request, validated.

    `field` holds the (several) files; `legacy_field`, when given, is the older single-file field and counts as one
    more photo. `already` is the number of photos the parent already has. More than `limit - already` raises
    ValidationError({field: ['Maximum of 10 photos allowed.']}); each invalid file adds 'Photo <n>: <reason>' and the
    whole set is refused. Returns the list of files (possibly empty)."""
    files = list(request.FILES.getlist(field)) if hasattr(request, 'FILES') else []
    if legacy_field:
        legacy = request.FILES.get(legacy_field) if hasattr(request, 'FILES') else None
        if legacy is not None:
            files.append(legacy)
    if len(files) > max(limit - already, 0):
        raise ValidationError({field: [f'Maximum of {limit} photos allowed.']})
    errors = []
    for index, f in enumerate(files, start=1):
        try:
            validate_uploaded_image(f)
        except DjangoValidationError as exc:
            errors.append(f'Photo {index}: ' + ' '.join(exc.messages))
    if errors:
        raise ValidationError({field: errors})
    return files


def photos_by_owner(request, owner_ids, prefix='photos_', limit=MAX_PHOTOS, already=0):
    """The photos of a report that covers SEVERAL people at once, one list per person: the files sent as `<prefix><owner id>`
    (photos_12 holds the photos of person 12). Each person's list is validated exactly like `validated_photos` (at most
    `limit - already` files, JPG/PNG/WEBP up to 5 MB) and is theirs alone. A file field that names someone who is not in
    the report (photos_99, photos_abc) is refused instead of being ignored. Returns {owner id: [files]} with an entry
    for every owner (empty when they sent none)."""
    allowed = {str(i) for i in owner_ids}
    for key in (request.FILES.keys() if hasattr(request, 'FILES') else []):
        if key.startswith(prefix) and key[len(prefix):] not in allowed:
            raise ValidationError({key: ['These photos belong to someone who is not in this report.']})
    return {i: validated_photos(request, f'{prefix}{i}', limit=limit, already=already) for i in owner_ids}


def discard_uploaded_files(names):
    """Delete files this request wrote for a record whose transaction then rolled back - only those exact names
    (storage gives every upload a unique name), never anything belonging to a saved record."""
    for name in names:
        try:
            default_storage.delete(name)
        except Exception:
            logger.exception('Could not remove orphaned upload %s', name)


@contextmanager
def local_photo_paths(fieldfiles):
    """Local file paths for stored photos, for code that needs real files (the PDF builders).

    A file on local disk is used where it is; one in remote storage (S3 / Supabase Storage has no .path) is copied to a
    temporary file that is deleted when the block ends. A photo that cannot be read, or whose file is gone, is skipped
    instead of failing the whole document."""
    paths, temporary = [], []
    try:
        for field_file in fieldfiles:
            if not field_file:
                continue
            try:
                try:
                    path = field_file.path
                except NotImplementedError:
                    suffix = os.path.splitext(field_file.name)[1] or '.img'
                    with field_file.storage.open(field_file.name, 'rb') as source:
                        target = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
                        try:
                            shutil.copyfileobj(source, target)
                        finally:
                            target.close()
                    temporary.append(target.name)
                    paths.append(target.name)
                    continue
                if os.path.exists(path):
                    paths.append(path)
            except Exception:
                logger.warning('Could not read photo %s; leaving it out of the document', getattr(field_file, 'name', '?'))
        yield paths
    finally:
        for name in temporary:
            try:
                os.remove(name)
            except OSError:
                pass
