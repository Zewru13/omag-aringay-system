from django.urls import path

from .views import (
    AssistanceAgencyDetailView,
    AssistanceAgencyListCreateView,
    BeneficiaryAdHocDetailView,
    BeneficiaryAdHocListCreateView,
    AssistanceCustomTypeDetailView,
    AssistanceCustomTypeListCreateView,
    OrgConfirmedAssistancesView,
    OrgConfirmedForMembersView,
    AssistanceChoicesView,
    AssistanceOptionDetailView,
    AssistanceTypeUnitsView,
    AssistanceOptionListCreateView,
    BeneficiaryRecordDetailView,
    BulkIndividualAssistanceView,
    FisherfolkBulkIndividualAssistanceView,
    FisherfolkStaffDistributionsView,
    StaffDistributionsView,
    CropAssistanceImportTemplateView,
    CropAssistanceImportView,
    FisherfolkBeneficiaryAdHocDetailView,
    FisherfolkBeneficiaryAdHocListCreateView,
    FisherfolkBeneficiaryRecordDetailView,
    AssistanceRemovalView,
    MyOrgDistributionsView,
    MyOrgFisherfolkDistributionsView,
    FisheriesAssistanceImportTemplateView,
    FisheriesAssistanceImportView,
    MyBeneficiaryHistoryView,
    MyFisherfolkBeneficiaryHistoryView,
    MyOrgBeneficiaryHistoryView,
    MyOrgFisherfolkBeneficiaryHistoryView,
)


urlpatterns = [
    path(
        'my-beneficiary-history/',
        MyBeneficiaryHistoryView.as_view(),
        name='my-beneficiary-history',
    ),
    path(
        'my-fisherfolk-beneficiary-history/',
        MyFisherfolkBeneficiaryHistoryView.as_view(),
        name='my-fisherfolk-beneficiary-history',
    ),
    path(
        'my-org-beneficiary-history/',
        MyOrgBeneficiaryHistoryView.as_view(),
        name='my-org-beneficiary-history',
    ),
    path(
        'my-org-fisherfolk-beneficiary-history/',
        MyOrgFisherfolkBeneficiaryHistoryView.as_view(),
        name='my-org-fisherfolk-beneficiary-history',
    ),
    path('beneficiaries/distributions/', StaffDistributionsView.as_view(), name='staff-distributions'),
    path('fisherfolk-beneficiaries/distributions/', FisherfolkStaffDistributionsView.as_view(), name='staff-fisherfolk-distributions'),
    path('beneficiaries/adhoc/bulk/', BulkIndividualAssistanceView.as_view(), name='assistance-bulk-individual'),
    path('fisherfolk-beneficiaries/adhoc/bulk/', FisherfolkBulkIndividualAssistanceView.as_view(), name='assistance-bulk-individual-fisherfolk'),
    path('options/', AssistanceOptionListCreateView.as_view(), name='assistance-options'),
    path('options/<int:pk>/', AssistanceOptionDetailView.as_view(), name='assistance-option-detail'),
    path('assistance-choices/', AssistanceChoicesView.as_view(), name='assistance-choices'),
    path('assistance-type-units/', AssistanceTypeUnitsView.as_view(), name='assistance-type-units'),
    path('assistance-types/', AssistanceCustomTypeListCreateView.as_view(), name='assistance-custom-types'),
    path('assistance-types/<int:pk>/', AssistanceCustomTypeDetailView.as_view(), name='assistance-custom-type-detail'),
    path('agencies/', AssistanceAgencyListCreateView.as_view(), name='assistance-agencies'),
    path('agencies/<int:pk>/', AssistanceAgencyDetailView.as_view(), name='assistance-agency-detail'),
    path('assistance-removals/', AssistanceRemovalView.as_view(), name='assistance-removals'),
    path('my-org-distributions/', MyOrgDistributionsView.as_view(), name='my-org-distributions'),
    path('my-org-fisherfolk-distributions/', MyOrgFisherfolkDistributionsView.as_view(),
         name='my-org-fisherfolk-distributions'),
    path(
        'beneficiaries/<int:id>/detail/',
        BeneficiaryRecordDetailView.as_view(),
        name='beneficiaries-record-detail',
    ),
    path(
        'fisherfolk-beneficiaries/<int:id>/detail/',
        FisherfolkBeneficiaryRecordDetailView.as_view(),
        name='fisherfolk-beneficiaries-record-detail',
    ),
    # ─── Ad-hoc beneficiary records ──────────────────────────────────────────
    # Absorbs production.CropAssistanceRecord / fisheries.FisheriesAssistanceRecord.
    # "adhoc" segment is a naming holdover from when program-based records
    # also lived in this app — every BeneficiaryRecord is this shape now.
    path(
        'beneficiaries/adhoc/import/',
        CropAssistanceImportView.as_view(),
        name='beneficiaries-adhoc-import',
    ),
    path(
        'beneficiaries/adhoc/import/template/',
        CropAssistanceImportTemplateView.as_view(),
        name='beneficiaries-adhoc-import-template',
    ),
    path(
        'beneficiaries/adhoc/',
        BeneficiaryAdHocListCreateView.as_view(),
        name='beneficiaries-adhoc-list-create',
    ),
    path(
        'beneficiaries/adhoc/<int:id>/',
        BeneficiaryAdHocDetailView.as_view(),
        name='beneficiaries-adhoc-detail',
    ),
    path(
        'fisherfolk-beneficiaries/adhoc/import/',
        FisheriesAssistanceImportView.as_view(),
        name='fisherfolk-beneficiaries-adhoc-import',
    ),
    path(
        'fisherfolk-beneficiaries/adhoc/import/template/',
        FisheriesAssistanceImportTemplateView.as_view(),
        name='fisherfolk-beneficiaries-adhoc-import-template',
    ),
    path(
        'fisherfolk-beneficiaries/adhoc/',
        FisherfolkBeneficiaryAdHocListCreateView.as_view(),
        name='fisherfolk-beneficiaries-adhoc-list-create',
    ),
    path(
        'fisherfolk-beneficiaries/adhoc/<int:id>/',
        FisherfolkBeneficiaryAdHocDetailView.as_view(),
        name='fisherfolk-beneficiaries-adhoc-detail',
    ),
    # ─── Scheduled distribution + confirmation lifecycle actions ────────────
    # ─── Accountless-beneficiary confirmation ────────────────────────────────
    path(
        'confirmed-for-members/<str:org_type>/<int:pk>/',
        OrgConfirmedForMembersView.as_view(),
        name='org-confirmed-for-members',
    ),
    path(
        'confirmed-for-members/<str:org_type>/<int:pk>/assistances/',
        OrgConfirmedAssistancesView.as_view(),
        name='org-confirmed-assistances',
    ),
]
