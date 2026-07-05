from django.urls import path

from .views import (
    AssociationListReport,
    BarangayCropSummaryReport,
    BeneficiaryMasterlistReport,
    CropHistoricalReport,
    CropOptionsReport,
    DamageReportsExport,
    FarmVisitReport,
    FarmerMasterlistReport,
    FarmerProfileReport,
    FisheriesCatchSummaryReport,
    FisheriesProductionReport,
    FisherfolkMasterlistReport,
    HarvestProductionReport,
    HarvestedCropReport,
    PlantingRecordsReport,
    SeasonalCatchReport,
    SeasonalVarianceReport,
    VesselLicenseStatusReport,
)


urlpatterns = [
    path('farmers/masterlist/', FarmerMasterlistReport.as_view(), name='report-farmer-masterlist'),
    path('farmers/<int:farmer_id>/profile/', FarmerProfileReport.as_view(), name='report-farmer-profile'),
    path('production/', HarvestProductionReport.as_view(), name='report-harvest-production'),
    path('production/planting/', PlantingRecordsReport.as_view(), name='report-planting-records'),
    path('production/damage/', DamageReportsExport.as_view(), name='report-damage-reports'),
    path('production/barangay-crop-summary/', BarangayCropSummaryReport.as_view(), name='report-barangay-crop-summary'),
    path('production/crop-history/', CropHistoricalReport.as_view(), name='report-crop-history'),
    path(
        'interventions/<int:program_id>/masterlist/',
        BeneficiaryMasterlistReport.as_view(),
        name='report-beneficiary-masterlist',
    ),
    path(
        'fisheries/masterlist/',
        FisherfolkMasterlistReport.as_view(),
        name='report-fisherfolk-masterlist',
    ),
    path('monitoring/seasonal-variance/', SeasonalVarianceReport.as_view(), name='report-seasonal-variance'),
    path('monitoring/farm-visits/', FarmVisitReport.as_view(), name='report-farm-visits'),
    path('monitoring/seasonal-catch/', SeasonalCatchReport.as_view(), name='report-seasonal-catch'),
    path('monitoring/vessel-licenses/', VesselLicenseStatusReport.as_view(), name='report-vessel-licenses'),
    path('monitoring/catch-summary/', FisheriesCatchSummaryReport.as_view(), name='report-catch-summary'),
    path('production/harvested-crop/', HarvestedCropReport.as_view(), name='report-harvested-crop'),
    path('associations/list/', AssociationListReport.as_view(), name='report-association-list'),
    path('production/crop-options/', CropOptionsReport.as_view(), name='report-crop-options'),
    path('fisheries/production/', FisheriesProductionReport.as_view(), name='report-fisheries-production'),
]
