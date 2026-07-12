from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator
from farmers.models import Farmer

from .models import (
    AssociationOfficer,
    FarmersAssociation,
    FarmersAssociationEquipment,
    FarmersAssociationMember,
    FisherfolkAssociation,
    FisherfolkAssociationEquipment,
    FisherfolkAssociationMember,
    FisherfolkAssociationOfficer,
)
from .serializers import (
    AssociationOfficerSerializer,
    FarmerAssociationMemberSearchSerializer,
    FarmersAssociationDetailSerializer,
    FarmersAssociationEquipmentSerializer,
    FarmersAssociationListSerializer,
    FarmersAssociationMemberSerializer,
    FisherfolkAssociationDetailSerializer,
    FisherfolkAssociationEquipmentSerializer,
    FisherfolkAssociationListSerializer,
    FisherfolkAssociationMemberSerializer,
    FisherfolkAssociationOfficerSerializer,
)


# ─── Farmers Association ──────────────────────────────────────────────────────

class FarmersAssociationListCreateView(generics.ListCreateAPIView):
    def get_permissions(self):
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_serializer_class(self):
        return FarmersAssociationDetailSerializer if self.request.method == 'POST' else FarmersAssociationListSerializer

    def get_queryset(self):
        qs = FarmersAssociation.objects.all().order_by('-date_created')
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(barangay__icontains=search))
        return qs


class FarmersAssociationDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FarmersAssociationDetailSerializer
    queryset = FarmersAssociation.objects.all()


class FarmersAssociationMemberAddView(generics.ListCreateAPIView):
    """
    GET: search THIS association's own members — used by the officer
    assignment search-select. Sourced from Farmer.farmers_association (the
    real membership link for Farmers Associations; see
    FarmersAssociationMember's docstring), not the join table.
    POST: unchanged join-table "add member" capability — kept for parity
    with the fisherfolk side, though nothing in the current UI calls it for
    farmers (see model docstring).
    """
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return FarmerAssociationMemberSearchSerializer
        return FarmersAssociationMemberSerializer

    def get_queryset(self):
        association_id = self.kwargs['pk']
        if self.request.method == 'GET':
            qs = Farmer.objects.filter(farmers_association_id=association_id)
            search = self.request.query_params.get('search', '').strip()
            if search:
                qs = qs.filter(
                    Q(first_name__icontains=search)
                    | Q(last_name__icontains=search)
                    | Q(middle_name__icontains=search)
                )
            return qs.order_by('last_name', 'first_name')
        return FarmersAssociationMember.objects.filter(association_id=association_id)

    def perform_create(self, serializer):
        association_id = self.kwargs['pk']
        farmer = serializer.validated_data['farmer']
        if FarmersAssociationMember.objects.filter(association_id=association_id, farmer=farmer).exists():
            raise serializers.ValidationError(
                {'detail': 'This farmer is already a member of this association.'}
            )
        serializer.save(association_id=association_id)


class FarmersAssociationMemberRemoveView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FarmersAssociationMember.objects.all()
    lookup_url_kwarg = 'member_id'


class FarmersAssociationMemberDirectRemoveView(APIView):
    """
    The actual "remove member" action for Farmers Associations: clears
    Farmer.farmers_association (the real membership link) rather than
    deleting a join-table row. Does NOT touch the Farmer profile otherwise.
    Auto-clears any officer position this farmer holds in this association
    first (Batch 4's chosen behavior — see AssociationOfficer.farmer's
    SET_NULL, which can't auto-cascade here since we're nulling a field,
    not deleting a row, so this has to be done explicitly).
    """
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def delete(self, request, pk, farmer_id):
        farmer = get_object_or_404(Farmer, pk=farmer_id, farmers_association_id=pk)
        AssociationOfficer.objects.filter(association_id=pk, farmer_id=farmer_id).delete()
        farmer.farmers_association = None
        farmer.save(update_fields=['farmers_association'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class FarmersAssociationEquipmentAddView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FarmersAssociationEquipmentSerializer

    def perform_create(self, serializer):
        serializer.save(association_id=self.kwargs['pk'])


class FarmersAssociationEquipmentRemoveView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FarmersAssociationEquipment.objects.all()
    lookup_url_kwarg = 'equip_id'


class AssociationOfficerListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = AssociationOfficerSerializer
    pagination_class = None

    def get_queryset(self):
        return AssociationOfficer.objects.filter(association_id=self.kwargs['pk'])

    def perform_create(self, serializer):
        serializer.save(association_id=self.kwargs['pk'])


class AssociationOfficerDestroyView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = AssociationOfficer.objects.all()
    lookup_url_kwarg = 'officer_id'


# ─── Fisherfolk Association ───────────────────────────────────────────────────

class FisherfolkAssociationListCreateView(generics.ListCreateAPIView):
    def get_permissions(self):
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_serializer_class(self):
        return FisherfolkAssociationDetailSerializer if self.request.method == 'POST' else FisherfolkAssociationListSerializer

    def get_queryset(self):
        qs = FisherfolkAssociation.objects.all().order_by('-date_created')
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(barangay__icontains=search))
        return qs


class FisherfolkAssociationDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FisherfolkAssociationDetailSerializer
    queryset = FisherfolkAssociation.objects.all()


class FisherfolkAssociationMemberAddView(generics.ListCreateAPIView):
    """
    GET: search THIS association's own members — used by the officer
    assignment search-select.
    POST: unchanged "add member" (join-table row).
    """
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FisherfolkAssociationMemberSerializer
    pagination_class = None

    def get_queryset(self):
        qs = FisherfolkAssociationMember.objects.filter(
            association_id=self.kwargs['pk'],
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
        association_id = self.kwargs['pk']
        fisherfolk = serializer.validated_data['fisherfolk']
        if FisherfolkAssociationMember.objects.filter(association_id=association_id, fisherfolk=fisherfolk).exists():
            raise serializers.ValidationError(
                {'detail': 'This fisherfolk is already a member of this association.'}
            )
        serializer.save(association_id=association_id)


class FisherfolkAssociationMemberRemoveView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FisherfolkAssociationMember.objects.all()
    lookup_url_kwarg = 'member_id'


class FisherfolkAssociationEquipmentAddView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FisherfolkAssociationEquipmentSerializer

    def perform_create(self, serializer):
        serializer.save(association_id=self.kwargs['pk'])


class FisherfolkAssociationEquipmentRemoveView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FisherfolkAssociationEquipment.objects.all()
    lookup_url_kwarg = 'equip_id'


class FisherfolkAssociationOfficerListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FisherfolkAssociationOfficerSerializer
    pagination_class = None

    def get_queryset(self):
        return FisherfolkAssociationOfficer.objects.filter(association_id=self.kwargs['pk'])

    def perform_create(self, serializer):
        serializer.save(association_id=self.kwargs['pk'])


class FisherfolkAssociationOfficerDestroyView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FisherfolkAssociationOfficer.objects.all()
    lookup_url_kwarg = 'officer_id'