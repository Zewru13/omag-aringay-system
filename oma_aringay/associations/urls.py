from django.urls import path

from .views import (
    FarmersOrganizationDetailView,
    FarmersOrganizationEquipmentAddView,
    FarmersOrganizationEquipmentRemoveView,
    FarmersOrganizationListCreateView,
    FarmersOrganizationMemberAddView,
    FarmersOrganizationMemberDirectRemoveView,
    FarmersOrganizationMemberRemoveView,
    FisherfolkOrganizationDetailView,
    FisherfolkOrganizationEquipmentAddView,
    FisherfolkOrganizationEquipmentRemoveView,
    FisherfolkOrganizationListCreateView,
    FisherfolkOrganizationMemberAddView,
    FisherfolkOrganizationMemberRemoveView,
    FisherfolkOrganizationOfficerDestroyView,
    FisherfolkOrganizationOfficerListCreateView,
    OrganizationOfficerDestroyView,
    OrganizationOfficerListCreateView,
)

urlpatterns = [
    # ── Farmers organizations ───────────────────────────────────────
    path('farmers/', FarmersOrganizationListCreateView.as_view()),
    path('farmers/<int:pk>/', FarmersOrganizationDetailView.as_view()),
    path('farmers/<int:pk>/members/', FarmersOrganizationMemberAddView.as_view()),
    path('farmers/<int:pk>/members/<int:farmer_id>/', FarmersOrganizationMemberDirectRemoveView.as_view()),
    path('farmers/members/<int:member_id>/', FarmersOrganizationMemberRemoveView.as_view()),
    path('farmers/<int:pk>/equipment/', FarmersOrganizationEquipmentAddView.as_view()),
    path('farmers/equipment/<int:equip_id>/', FarmersOrganizationEquipmentRemoveView.as_view()),
    path('farmers/<int:pk>/officers/', OrganizationOfficerListCreateView.as_view()),
    path('farmers/officers/<int:officer_id>/', OrganizationOfficerDestroyView.as_view()),
    # ── Fisherfolk organizations ────────────────────────────────────
    path('fisherfolk/', FisherfolkOrganizationListCreateView.as_view()),
    path('fisherfolk/<int:pk>/', FisherfolkOrganizationDetailView.as_view()),
    path('fisherfolk/<int:pk>/members/', FisherfolkOrganizationMemberAddView.as_view()),
    path('fisherfolk/members/<int:member_id>/', FisherfolkOrganizationMemberRemoveView.as_view()),
    path('fisherfolk/<int:pk>/equipment/', FisherfolkOrganizationEquipmentAddView.as_view()),
    path('fisherfolk/equipment/<int:equip_id>/', FisherfolkOrganizationEquipmentRemoveView.as_view()),
    path('fisherfolk/<int:pk>/officers/', FisherfolkOrganizationOfficerListCreateView.as_view()),
    path('fisherfolk/officers/<int:officer_id>/', FisherfolkOrganizationOfficerDestroyView.as_view()),
]
