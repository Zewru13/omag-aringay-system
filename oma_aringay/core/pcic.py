"""PCIC (Philippine Crop Insurance Corporation) insurance on a record: a "has PCIC insurance" box and a photo of the PCIC
insurance form kept with the record for documentation. The fields live on core.models.PcicInsurance; this module is
where the photo is stored and the small upload endpoint every record type shares.

The photos are never set through the record's normal edit endpoint (they are read-only there): they are uploaded on their own,
after the record exists, and only while the box is ticked. A record keeps up to MAX_PCIC_PHOTOS: the first is the record's own
`pcic_form_photo`, the others are PcicFormPhoto rows. Unticking the box removes them all (PcicInsurance.save)."""
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from core.validators import validate_uploaded_image


def pcic_form_path(instance, filename):
    return f'pcic_forms/{instance._meta.model_name}/{filename}'


MAX_PCIC_PHOTOS = 5   # a record keeps up to this many photos of the PCIC form (its pages): the main one and four more
MAIN = 'main'


def _drop_photo(record):
    if record.pcic_form_photo:
        record.pcic_form_photo.delete(save=False)
    record.pcic_form_photo = None


def _link(field_file, request):
    """The link to a stored photo: a signed, short-lived link on the private bucket, or a /media path in local development."""
    url = field_file.url
    return request.build_absolute_uri(url) if request and url.startswith('/') else url


def photo_list(record, request=None):
    """Every photo of the record's PCIC form, the main one first: [{ id: 'main' | <number>, url }]. Empty unless the record is insured."""
    if not record or not record.has_pcic_insurance:
        return []
    photos = []
    if record.pcic_form_photo:
        photos.append({'id': MAIN, 'url': _link(record.pcic_form_photo, request)})
    photos.extend({'id': extra.id, 'url': _link(extra.image, request)} for extra in record.pcic_extra_photos.all())
    return photos


def photo_count(record):
    return (1 if record.pcic_form_photo else 0) + record.pcic_extra_photos.count()


class PcicPhotoListMixin:
    """For a record serializer that has a `pcic_form_photos = serializers.SerializerMethodField()`: the photos of its PCIC form."""

    def get_pcic_form_photos(self, obj):
        return photo_list(obj, self.context.get('request'))


def _forget_loaded_photos(record):
    """A list or detail view may have loaded the record's extra photos ahead of time (prefetch_related); after the photos changed, the answer
    must read them again."""
    getattr(record, '_prefetched_objects_cache', {}).pop('pcic_extra_photos', None)


class PcicFormPhotoMixin:
    """Mixed in front of a record's detail view (so it keeps that view's queryset, permissions and serializer):
    POST a photo as multipart `photo` to add it (up to MAX_PCIC_PHOTOS in all), DELETE to remove one (`photo`: its id, or 'main') or,
    without `photo`, all of them."""
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ['post', 'delete', 'options']

    def post(self, request, *args, **kwargs):
        record = self.get_object()
        if not record.has_pcic_insurance:
            return Response({'detail': 'Mark this record as insured with PCIC first, then upload the form.'}, status=400)
        photo = request.FILES.get('photo')
        if photo is None:
            return Response({'detail': 'Choose a photo of the PCIC insurance form.'}, status=400)
        try:
            validate_uploaded_image(photo)
        except ValidationError as exc:
            return Response({'detail': ' '.join(exc.messages)}, status=400)
        if photo_count(record) >= MAX_PCIC_PHOTOS:
            return Response({'detail': f'A record can have up to {MAX_PCIC_PHOTOS} photos of the PCIC form. Remove one first.'}, status=400)
        if not record.pcic_form_photo:
            record.pcic_form_photo = photo
            record.save(update_fields=['pcic_form_photo'])
        else:
            from core.models import PcicFormPhoto   # not at the top: core.models imports this module
            PcicFormPhoto.objects.create(
                content_type=ContentType.objects.get_for_model(record, for_concrete_model=False), object_id=record.pk, image=photo)
        _forget_loaded_photos(record)
        return Response(self.get_serializer(record).data)

    def delete(self, request, *args, **kwargs):
        record = self.get_object()
        which = request.data.get('photo') if hasattr(request.data, 'get') else None
        if which in (None, ''):
            _drop_photo(record)
            for extra in record.pcic_extra_photos.all():
                extra.image.delete(save=False)
                extra.delete()
        elif str(which) == MAIN:
            _drop_photo(record)
            promoted = record.pcic_extra_photos.first()
            if promoted is not None:
                record.pcic_form_photo = promoted.image.name   # the next photo becomes the main one; its file stays where it is
                promoted.delete()
        else:
            extra = record.pcic_extra_photos.filter(pk=which).first() if str(which).isdigit() else None
            if extra is None:
                return Response({'detail': 'That photo is not on this record.'}, status=404)
            extra.image.delete(save=False)
            extra.delete()
        record.save(update_fields=['pcic_form_photo'])
        _forget_loaded_photos(record)
        return Response(self.get_serializer(record).data)
