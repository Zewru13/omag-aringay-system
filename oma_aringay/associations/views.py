from django.db.models import Q
from rest_framework import generics, serializers
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import IsAdminOrEvaluator

from .models import (
    FarmersAssociation,
    FarmersAssociationEquipment,
    FarmersAssociationMember,
    FisherfolkAssociation,
    FisherfolkAssociationEquipment,
    FisherfolkAssociationMember,
)
from .serializers import (
    FarmersAssociationDetailSerializer,
    FarmersAssociationEquipmentSerializer,
    FarmersAssociationListSerializer,
    FarmersAssociationMemberSerializer,
    FisherfolkAssociationDetailSerializer,
    FisherfolkAssociationEquipmentSerializer,
    FisherfolkAssociationListSerializer,
    FisherfolkAssociationMemberSerializer,
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


class FarmersAssociationMemberAddView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FarmersAssociationMemberSerializer

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


class FarmersAssociationEquipmentAddView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FarmersAssociationEquipmentSerializer

    def perform_create(self, serializer):
        serializer.save(association_id=self.kwargs['pk'])


class FarmersAssociationEquipmentRemoveView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FarmersAssociationEquipment.objects.all()
    lookup_url_kwarg = 'equip_id'


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


class FisherfolkAssociationMemberAddView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FisherfolkAssociationMemberSerializer

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