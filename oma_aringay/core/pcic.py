"""PCIC (Philippine Crop Insurance Corporation) insurance on a record: a "has PCIC insurance" box and a photo of the PCIC
insurance form kept with the record for documentation. The fields live on core.models.PcicInsurance; this module is
where the photo is stored and the small upload endpoint every record type shares.

The photo is never set through the record's normal edit endpoint (it is read-only there): it is uploaded on its own,
after the record exists, and only while the box is ticked. Unticking the box removes the photo (PcicInsurance.save)."""
from django.core.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from core.validators import validate_uploaded_image


def pcic_form_path(instance, filename):
    return f'pcic_forms/{instance._meta.model_name}/{filename}'


def _drop_photo(record):
    if record.pcic_form_photo:
        record.pcic_form_photo.delete(save=False)
    record.pcic_form_photo = None


class PcicFormPhotoMixin:
    """Mixed in front of a record's detail view (so it keeps that view's queryset, permissions and serializer):
    POST a photo as multipart `photo` to attach or replace it, DELETE to remove it."""
    parser_classes = [MultiPartParser, FormParser]
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
        _drop_photo(record)
        record.pcic_form_photo = photo
        record.save(update_fields=['pcic_form_photo'])
        return Response(self.get_serializer(record).data)

    def delete(self, request, *args, **kwargs):
        record = self.get_object()
        _drop_photo(record)
        record.save(update_fields=['pcic_form_photo'])
        return Response(self.get_serializer(record).data)
