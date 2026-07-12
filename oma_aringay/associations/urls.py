from django.urls import path

from .views import (
    AssociationOfficerDestroyView,
    AssociationOfficerListCreateView,
    FarmersAssociationDetailView,
    FarmersAssociationEquipmentAddView,
    FarmersAssociationEquipmentRemoveView,
    FarmersAssociationListCreateView,
    FarmersAssociationMemberAddView,
    FarmersAssociationMemberDirectRemoveView,
    FarmersAssociationMemberRemoveView,
    FisherfolkAssociationDetailView,
    FisherfolkAssociationEquipmentAddView,
    FisherfolkAssociationEquipmentRemoveView,
    FisherfolkAssociationListCreateView,
    FisherfolkAssociationMemberAddView,
    FisherfolkAssociationMemberRemoveView,
    FisherfolkAssociationOfficerDestroyView,
    FisherfolkAssociationOfficerListCreateView,
)

urlpatterns = [
    # ── Farmers associations ────────────────────────────────────────
    path('farmers/', FarmersAssociationListCreateView.as_view()),
    path('farmers/<int:pk>/', FarmersAssociationDetailView.as_view()),
    path('farmers/<int:pk>/members/', FarmersAssociationMemberAddView.as_view()),
    path('farmers/<int:pk>/members/<int:farmer_id>/', FarmersAssociationMemberDirectRemoveView.as_view()),
    path('farmers/members/<int:member_id>/', FarmersAssociationMemberRemoveView.as_view()),
    path('farmers/<int:pk>/equipment/', FarmersAssociationEquipmentAddView.as_view()),
    path('farmers/equipment/<int:equip_id>/', FarmersAssociationEquipmentRemoveView.as_view()),
    path('farmers/<int:pk>/officers/', AssociationOfficerListCreateView.as_view()),
    path('farmers/officers/<int:officer_id>/', AssociationOfficerDestroyView.as_view()),
    # ── Fisherfolk associations ─────────────────────────────────────
    path('fisherfolk/', FisherfolkAssociationListCreateView.as_view()),
    path('fisherfolk/<int:pk>/', FisherfolkAssociationDetailView.as_view()),
    path('fisherfolk/<int:pk>/members/', FisherfolkAssociationMemberAddView.as_view()),
    path('fisherfolk/members/<int:member_id>/', FisherfolkAssociationMemberRemoveView.as_view()),
    path('fisherfolk/<int:pk>/equipment/', FisherfolkAssociationEquipmentAddView.as_view()),
    path('fisherfolk/equipment/<int:equip_id>/', FisherfolkAssociationEquipmentRemoveView.as_view()),
    path('fisherfolk/<int:pk>/officers/', FisherfolkAssociationOfficerListCreateView.as_view()),
    path('fisherfolk/officers/<int:officer_id>/', FisherfolkAssociationOfficerDestroyView.as_view()),
]
