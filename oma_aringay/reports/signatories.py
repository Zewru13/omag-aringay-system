"""The saved list of report signers: readable by the roles that can open the reports, editable by the Admin only."""
from django.db.models import Case, IntegerField, Value, When
from rest_framework import generics, serializers
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import IsAdmin, IsAdminOrEvaluator

from .models import Signatory

ROLE_ORDER = Case(
    *[When(role=value, then=Value(index)) for index, (value, _label) in enumerate(Signatory.ROLE_CHOICES)],
    output_field=IntegerField(),
)


class SignatorySerializer(serializers.ModelSerializer):
    # allow_blank is off and DRF trims whitespace, so a blank or whitespace-only name is a 400.
    name = serializers.CharField(max_length=150)
    position = serializers.CharField(max_length=150, required=False, allow_blank=True)

    class Meta:
        model = Signatory
        fields = ['id', 'name', 'position', 'role', 'is_active']


class SignatoryList(generics.ListCreateAPIView):
    """GET: the active signers (Admin and Evaluator; Admin may add ?all=1 for inactive ones too). POST: Admin only."""

    serializer_class = SignatorySerializer
    pagination_class = None

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_queryset(self):
        qs = Signatory.objects.annotate(role_order=ROLE_ORDER).order_by('role_order', 'name')
        wants_all = self.request.query_params.get('all') == '1' and self.request.user.role == 'ADMIN'
        return qs if wants_all else qs.filter(is_active=True)


class SignatoryDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Signatory.objects.all()
    serializer_class = SignatorySerializer
    permission_classes = [IsAuthenticated, IsAdmin]
