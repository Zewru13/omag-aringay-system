from django.urls import path

from .views import (
    BeneficiaryAdHocDetailView,
    BeneficiaryAdHocListCreateView,
    BeneficiaryExportView,
    BeneficiaryCreateView,
    BeneficiaryDeleteView,
    BeneficiaryListView,
    BeneficiaryRecordDetailView,
    FarmerInterventionHistoryView,
    FisherfolkBeneficiaryAdHocDetailView,
    FisherfolkBeneficiaryAdHocListCreateView,
    FisherfolkBeneficiaryDeleteView,
    FisherfolkBeneficiaryListCreateView,
    FisherfolkBeneficiaryRecordDetailView,
    FisherfolkInterventionHistoryView,
    MyBeneficiaryHistoryView,
    MyFisherfolkBeneficiaryHistoryView,
    MyOrgBeneficiaryHistoryView,
    MyOrgFisherfolkBeneficiaryHistoryView,
    ProgramCreateView,
    ProgramDetailView,
    ProgramListView,
)


urlpatterns = [
    path('', ProgramListView.as_view(), name='intervention-programs-list'),
    path('programs/', ProgramListView.as_view(), name='intervention-programs-list-alias'),
    path('create/', ProgramCreateView.as_view(), name='intervention-programs-create'),
    path(
        'farmer-history/<int:farmer_id>/',
        FarmerInterventionHistoryView.as_view(),
        name='farmer-intervention-history',
    ),
    path(
        'fisherfolk-history/<int:fisherfolk_id>/',
        FisherfolkInterventionHistoryView.as_view(),
        name='fisherfolk-intervention-history',
    ),
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
    path(
        'programs/<int:id>/export/',
        BeneficiaryExportView.as_view(),
        name='beneficiaries-export',
    ),
    path(
        'programs/<int:id>/',
        ProgramDetailView.as_view(),
        name='intervention-programs-detail-alias',
    ),
    path(
        'programs/<int:program_id>/beneficiaries/',
        BeneficiaryListView.as_view(),
        name='beneficiaries-list-alias',
    ),
    path('<int:id>/', ProgramDetailView.as_view(), name='intervention-programs-detail'),
    path(
        '<int:program_id>/beneficiaries/',
        BeneficiaryListView.as_view(),
        name='beneficiaries-list',
    ),
    path(
        '<int:program_id>/beneficiaries/create/',
        BeneficiaryCreateView.as_view(),
        name='beneficiaries-create',
    ),
    path(
        'beneficiaries/<int:id>/delete/',
        BeneficiaryDeleteView.as_view(),
        name='beneficiaries-delete',
    ),
    path(
        'beneficiaries/<int:id>/detail/',
        BeneficiaryRecordDetailView.as_view(),
        name='beneficiaries-record-detail',
    ),
    path(
        'programs/<int:program_id>/fisherfolk-beneficiaries/',
        FisherfolkBeneficiaryListCreateView.as_view(),
        name='fisherfolk-beneficiaries-list-create',
    ),
    path(
        'fisherfolk-beneficiaries/<int:id>/',
        FisherfolkBeneficiaryDeleteView.as_view(),
        name='fisherfolk-beneficiaries-delete',
    ),
    path(
        'fisherfolk-beneficiaries/<int:id>/detail/',
        FisherfolkBeneficiaryRecordDetailView.as_view(),
        name='fisherfolk-beneficiaries-record-detail',
    ),
    # ─── Ad-hoc (program=null) beneficiary records (Batch 6) ────────────────
    # Absorbs production.CropAssistanceRecord / fisheries.FisheriesAssistanceRecord.
    # "adhoc" segment keeps these collision-free from the bare int-id routes above.
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
        'fisherfolk-beneficiaries/adhoc/',
        FisherfolkBeneficiaryAdHocListCreateView.as_view(),
        name='fisherfolk-beneficiaries-adhoc-list-create',
    ),
    path(
        'fisherfolk-beneficiaries/adhoc/<int:id>/',
        FisherfolkBeneficiaryAdHocDetailView.as_view(),
        name='fisherfolk-beneficiaries-adhoc-detail',
    ),
]
