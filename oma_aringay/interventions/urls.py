from django.urls import path

from .views import (
    BeneficiaryAdHocDetailView,
    BeneficiaryAdHocListCreateView,
    BeneficiaryRecordDetailView,
    FisherfolkBeneficiaryAdHocDetailView,
    FisherfolkBeneficiaryAdHocListCreateView,
    FisherfolkBeneficiaryRecordDetailView,
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
