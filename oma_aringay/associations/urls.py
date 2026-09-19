from django.urls import path

from .views import (
    FarmersOrganizationAddCandidateSearchView,
    FarmersOrganizationDetailView,
    FarmersOrganizationDistributeAssistanceView,
    FarmersOrganizationEquipmentAddView,
    FarmersOrganizationEquipmentRemoveView,
    FarmersOrganizationImportTemplateView,
    FarmersOrganizationImportView,
    FarmersOrganizationListCreateView,
    FarmersOrganizationMemberAddView,
    FarmersOrganizationMemberOrgScopedSetActiveView,
    FarmersOrganizationMemberSetActiveView,
    FarmersOrganizationMemberSetMainView,
    FisherfolkOrganizationAddCandidateSearchView,
    FisherfolkOrganizationDetailView,
    FisherfolkOrganizationDistributeAssistanceView,
    FisherfolkOrganizationEquipmentAddView,
    FisherfolkOrganizationEquipmentRemoveView,
    FisherfolkOrganizationImportTemplateView,
    FisherfolkOrganizationImportView,
    FisherfolkOrganizationListCreateView,
    FisherfolkOrganizationMemberAddView,
    FisherfolkOrganizationMemberOrgScopedSetActiveView,
    FisherfolkOrganizationMemberSetActiveView,
    FisherfolkOrganizationMemberSetMainView,
    FisherfolkOrganizationOfficerEndTermView,
    FisherfolkOrganizationOfficerListCreateView,
    OrganizationOfficerEndTermView,
    OrganizationOfficerListCreateView,
)

urlpatterns = [
    # ── Farmers organizations ───────────────────────────────────────
    path('farmers/import/', FarmersOrganizationImportView.as_view()),
    path('farmers/import/template/', FarmersOrganizationImportTemplateView.as_view()),
    path('farmers/', FarmersOrganizationListCreateView.as_view()),
    path('farmers/<int:pk>/', FarmersOrganizationDetailView.as_view()),
    path('farmers/<int:pk>/members/', FarmersOrganizationMemberAddView.as_view()),
    # Batch (Phase B): addressed by the JOIN ROW id now (member_id), not the
    # farmer's own id — mirrors the fisherfolk side, which always worked
    # this way. farmers/members/<member_id>/ is the staff-only route
    # (FarmersOrganizationMemberSetActiveView); this org-scoped one is the
    # citizen-reachable sibling.
    path('farmers/<int:pk>/members/<int:member_id>/', FarmersOrganizationMemberOrgScopedSetActiveView.as_view()),
    path('farmers/<int:pk>/members/<int:member_id>/set-main/', FarmersOrganizationMemberSetMainView.as_view()),
    path('farmers/<int:pk>/distribute-assistance/', FarmersOrganizationDistributeAssistanceView.as_view()),
    path('farmers/members/<int:member_id>/', FarmersOrganizationMemberSetActiveView.as_view()),
    path('farmers/<int:pk>/equipment/', FarmersOrganizationEquipmentAddView.as_view()),
    path('farmers/equipment/<int:equip_id>/', FarmersOrganizationEquipmentRemoveView.as_view()),
    path('farmers/<int:pk>/member-search/', FarmersOrganizationAddCandidateSearchView.as_view()),
    path('farmers/<int:pk>/officers/', OrganizationOfficerListCreateView.as_view()),
    path('farmers/officers/<int:officer_id>/end-term/', OrganizationOfficerEndTermView.as_view()),
    # ── Fisherfolk organizations ────────────────────────────────────
    path('fisherfolk/import/', FisherfolkOrganizationImportView.as_view()),
    path('fisherfolk/import/template/', FisherfolkOrganizationImportTemplateView.as_view()),
    path('fisherfolk/', FisherfolkOrganizationListCreateView.as_view()),
    path('fisherfolk/<int:pk>/', FisherfolkOrganizationDetailView.as_view()),
    path('fisherfolk/<int:pk>/members/', FisherfolkOrganizationMemberAddView.as_view()),
    path('fisherfolk/<int:pk>/members/<int:member_id>/', FisherfolkOrganizationMemberOrgScopedSetActiveView.as_view()),
    path('fisherfolk/<int:pk>/members/<int:member_id>/set-main/', FisherfolkOrganizationMemberSetMainView.as_view()),
    path('fisherfolk/members/<int:member_id>/', FisherfolkOrganizationMemberSetActiveView.as_view()),
    path('fisherfolk/<int:pk>/distribute-assistance/', FisherfolkOrganizationDistributeAssistanceView.as_view()),
    path('fisherfolk/<int:pk>/equipment/', FisherfolkOrganizationEquipmentAddView.as_view()),
    path('fisherfolk/equipment/<int:equip_id>/', FisherfolkOrganizationEquipmentRemoveView.as_view()),
    path('fisherfolk/<int:pk>/member-search/', FisherfolkOrganizationAddCandidateSearchView.as_view()),
    path('fisherfolk/<int:pk>/officers/', FisherfolkOrganizationOfficerListCreateView.as_view()),
    path('fisherfolk/officers/<int:officer_id>/end-term/', FisherfolkOrganizationOfficerEndTermView.as_view()),
]
