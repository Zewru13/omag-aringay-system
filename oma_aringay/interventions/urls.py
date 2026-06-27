from django.urls import path

from .views import (
    BeneficiaryExportView,
    BeneficiaryCreateView,
    BeneficiaryDeleteView,
    BeneficiaryListView,
    FarmerInterventionHistoryView,
    FisherfolkBeneficiaryDeleteView,
    FisherfolkBeneficiaryListCreateView,
    FisherfolkInterventionHistoryView,
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
        'programs/<int:program_id>/fisherfolk-beneficiaries/',
        FisherfolkBeneficiaryListCreateView.as_view(),
        name='fisherfolk-beneficiaries-list-create',
    ),
    path(
        'fisherfolk-beneficiaries/<int:id>/',
        FisherfolkBeneficiaryDeleteView.as_view(),
        name='fisherfolk-beneficiaries-delete',
    ),
]
