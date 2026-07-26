from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator
from farmers.models import Farmer

from .models import (
    FarmersOrganization,
    FarmersOrganizationEquipment,
    FarmersOrganizationMember,
    FisherfolkOrganization,
    FisherfolkOrganizationEquipment,
    FisherfolkOrganizationMember,
    FisherfolkOrganizationOfficer,
    OrganizationOfficer,
)
from .serializers import (
    FarmerOrganizationMemberSearchSerializer,
    FarmersOrganizationDetailSerializer,
    FarmersOrganizationEquipmentSerializer,
    FarmersOrganizationListSerializer,
    FarmersOrganizationMemberSerializer,
    FisherfolkOrganizationDetailSerializer,
    FisherfolkOrganizationEquipmentSerializer,
    FisherfolkOrganizationListSerializer,
    FisherfolkOrganizationMemberSerializer,
    FisherfolkOrganizationOfficerSerializer,
    OrganizationOfficerSerializer,
)


# ─── Farmers Organization ──────────────────────────────────────────────────────

class FarmersOrganizationListCreateView(generics.ListCreateAPIView):
    def get_permissions(self):
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_serializer_class(self):
        return FarmersOrganizationDetailSerializer if self.request.method == 'POST' else FarmersOrganizationListSerializer

    def get_queryset(self):
        qs = FarmersOrganization.objects.all().order_by('-date_created')
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(barangay__icontains=search))
        return qs


class FarmersOrganizationDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FarmersOrganizationDetailSerializer
    queryset = FarmersOrganization.objects.all()


class FarmersOrganizationMemberAddView(generics.ListCreateAPIView):
    """
    GET: search THIS organization's own members — used by the officer
    assignment search-select. Sourced from Farmer.farmers_organization (the
    real membership link for Farmers Organizations; see
    FarmersOrganizationMember's docstring), not the join table.
    POST: unchanged join-table "add member" capability — kept for parity
    with the fisherfolk side, though nothing in the current UI calls it for
    farmers (see model docstring).
    """
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return FarmerOrganizationMemberSearchSerializer
        return FarmersOrganizationMemberSerializer

    def get_queryset(self):
        organization_id = self.kwargs['pk']
        if self.request.method == 'GET':
            qs = Farmer.objects.filter(farmers_organization_id=organization_id)
            search = self.request.query_params.get('search', '').strip()
            if search:
                qs = qs.filter(
                    Q(first_name__icontains=search)
                    | Q(last_name__icontains=search)
                    | Q(middle_name__icontains=search)
                )
            return qs.order_by('last_name', 'first_name')
        return FarmersOrganizationMember.objects.filter(organization_id=organization_id)

    def perform_create(self, serializer):
        organization_id = self.kwargs['pk']
        farmer = serializer.validated_data['farmer']
        if FarmersOrganizationMember.objects.filter(organization_id=organization_id, farmer=farmer).exists():
            raise serializers.ValidationError(
                {'detail': 'This farmer is already a member of this organization.'}
            )
        serializer.save(organization_id=organization_id)


class FarmersOrganizationMemberRemoveView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FarmersOrganizationMember.objects.all()
    lookup_url_kwarg = 'member_id'


class FarmersOrganizationMemberDirectRemoveView(APIView):
    """
    The actual "remove member" action for Farmers Organizations: clears
    Farmer.farmers_organization (the real membership link) rather than
    deleting a join-table row. Does NOT touch the Farmer profile otherwise.
    Auto-clears any officer position this farmer holds in this organization
    first (Batch 4's chosen behavior — see OrganizationOfficer.farmer's
    SET_NULL, which can't auto-cascade here since we're nulling a field,
    not deleting a row, so this has to be done explicitly).
    """
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def delete(self, request, pk, farmer_id):
        farmer = get_object_or_404(Farmer, pk=farmer_id, farmers_organization_id=pk)
        OrganizationOfficer.objects.filter(organization_id=pk, farmer_id=farmer_id).delete()
        farmer.farmers_organization = None
        farmer.save(update_fields=['farmers_organization'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class FarmersOrganizationEquipmentAddView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FarmersOrganizationEquipmentSerializer

    def perform_create(self, serializer):
        serializer.save(organization_id=self.kwargs['pk'])


class FarmersOrganizationEquipmentRemoveView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FarmersOrganizationEquipment.objects.all()
    lookup_url_kwarg = 'equip_id'


class OrganizationOfficerListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = OrganizationOfficerSerializer
    pagination_class = None

    def get_queryset(self):
        return OrganizationOfficer.objects.filter(organization_id=self.kwargs['pk'])

    def perform_create(self, serializer):
        serializer.save(organization_id=self.kwargs['pk'])


class OrganizationOfficerDestroyView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = OrganizationOfficer.objects.all()
    lookup_url_kwarg = 'officer_id'


# ─── Fisherfolk Organization ───────────────────────────────────────────────────

class FisherfolkOrganizationListCreateView(generics.ListCreateAPIView):
    def get_permissions(self):
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_serializer_class(self):
        return FisherfolkOrganizationDetailSerializer if self.request.method == 'POST' else FisherfolkOrganizationListSerializer

    def get_queryset(self):
        qs = FisherfolkOrganization.objects.all().order_by('-date_created')
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(barangay__icontains=search))
        return qs


class FisherfolkOrganizationDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FisherfolkOrganizationDetailSerializer
    queryset = FisherfolkOrganization.objects.all()


class FisherfolkOrganizationMemberAddView(generics.ListCreateAPIView):
    """
    GET: search THIS organization's own members — used by the officer
    assignment search-select.
    POST: unchanged "add member" (join-table row).
    """
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FisherfolkOrganizationMemberSerializer
    pagination_class = None

    def get_queryset(self):
        qs = FisherfolkOrganizationMember.objects.filter(
            organization_id=self.kwargs['pk'],
        ).select_related('fisherfolk')
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(fisherfolk__first_name__icontains=search)
                | Q(fisherfolk__last_name__icontains=search)
                | Q(fisherfolk__middle_name__icontains=search)
            )
        return qs

    def perform_create(self, serializer):
        organization_id = self.kwargs['pk']
        fisherfolk = serializer.validated_data['fisherfolk']
        if FisherfolkOrganizationMember.objects.filter(organization_id=organization_id, fisherfolk=fisherfolk).exists():
            raise serializers.ValidationError(
                {'detail': 'This fisherfolk is already a member of this organization.'}
            )
        serializer.save(organization_id=organization_id)


class FisherfolkOrganizationMemberRemoveView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FisherfolkOrganizationMember.objects.all()
    lookup_url_kwarg = 'member_id'


class FisherfolkOrganizationEquipmentAddView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FisherfolkOrganizationEquipmentSerializer

    def perform_create(self, serializer):
        serializer.save(organization_id=self.kwargs['pk'])


class FisherfolkOrganizationEquipmentRemoveView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FisherfolkOrganizationEquipment.objects.all()
    lookup_url_kwarg = 'equip_id'


class FisherfolkOrganizationOfficerListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FisherfolkOrganizationOfficerSerializer
    pagination_class = None

    def get_queryset(self):
        return FisherfolkOrganizationOfficer.objects.filter(organization_id=self.kwargs['pk'])

    def perform_create(self, serializer):
        serializer.save(organization_id=self.kwargs['pk'])


class FisherfolkOrganizationOfficerDestroyView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FisherfolkOrganizationOfficer.objects.all()
    lookup_url_kwarg = 'officer_id'
