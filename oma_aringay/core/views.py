from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from farmers.models import Farmer
from fisheries.models import Fisherfolk


def _build_display_name(obj):
    """Return prefix + full_name, dropping empty parts."""
    parts = [obj.prefix, obj.full_name]
    return ' '.join(p for p in parts if p).strip()


class RegistrationStatusView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        query = request.query_params.get('query', '').strip()

        if not query:
            return Response({
                'found': False,
                'message': 'Please enter a number to search.',
            })

        farmer = Farmer.objects.filter(rsbsa_number__iexact=query).first()

        if farmer:
            return Response({
                'found': True,
                'type': 'Farmer',
                'full_name': _build_display_name(farmer),
                'status': 'Active' if farmer.is_active else 'Inactive',
                'barangay': farmer.barangay,
            })

        fisherfolk = Fisherfolk.objects.filter(lgu_registration_number__iexact=query).first()

        if fisherfolk:
            return Response({
                'found': True,
                'type': 'Fisherfolk',
                'full_name': _build_display_name(fisherfolk),
                'status': 'Active' if fisherfolk.is_active else 'Inactive',
                'barangay': fisherfolk.barangay,
                'fisherfolk_type': fisherfolk.fisherfolk_type,
            })

        return Response({
            'found': False,
            'message': 'No record found for this number. Please visit the OMAg Aringay office for assistance.',
        })
