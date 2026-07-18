from django.urls import path

from .views import (
    FisherfolkListView,
    FisherfolkDetailView,
    FisherfolkDuplicateCheckView,
    FisheriesActivitySuggestionsView,
    FisheriesAssistanceDetailView,
    FisheriesAssistanceListCreateView,
    FisheriesBarangaySummaryView,
    FisheriesDisasterResolveView,
    FisheriesHistoricalTimelineView,
    FisheriesYieldAnalysisView,
    FisheriesYieldAnalysisSummaryView,
    FishingTripLogDetailView,
    FishingTripLogListCreateView,
    FishingTripSummaryView,
    SpeciesCategoryListCreateView,
    SpeciesCategoryDetailView,
    SpeciesOptionListCreateView,
    SpeciesOptionDetailView,
    SpeciesActivityStageListCreateView,
    SpeciesActivityStageDeleteView,
    StockingListCreateView,
    StockingHistoryView,
    StockingDetailView,
    StockingActivityLogListCreateView,
    StockingActivityLogDeleteView,
    StockingDisasterReportListCreateView,
    StockingDisasterReportDeleteView,
    StockingHarvestListCreateView,
    StockingHarvestDeleteView,
    TripSpeciesEntryDeleteView,
    TripSpeciesEntryListCreateView,
    VesselInspectionDetailView,
    VesselInspectionListCreateView,
    VesselLicenseAlertView,
)


urlpatterns = [
    # ── Fisherfolk ──────────────────────────────────────────────────────────
    path('fisherfolk/', FisherfolkListView.as_view(), name='fisherfolk-list'),
    path('fisherfolk/check-duplicate/', FisherfolkDuplicateCheckView.as_view(), name='fisherfolk-check-duplicate'),
    path('fisherfolk/<int:id>/', FisherfolkDetailView.as_view(), name='fisherfolk-detail'),

    # ── Species categories ──────────────────────────────────────────────────
    path('species-categories/', SpeciesCategoryListCreateView.as_view(), name='species-category-list'),
    path('species-categories/<int:pk>/', SpeciesCategoryDetailView.as_view(), name='species-category-detail'),

    # ── Species options & stages ────────────────────────────────────────────
    path('species/', SpeciesOptionListCreateView.as_view(), name='species-list'),
    path('species/<int:pk>/', SpeciesOptionDetailView.as_view(), name='species-detail'),
    path('species/<int:species_id>/stages/', SpeciesActivityStageListCreateView.as_view(), name='species-stages'),
    path('species/stages/<int:pk>/', SpeciesActivityStageDeleteView.as_view(), name='species-stage-delete'),

    # ── Stocking records ────────────────────────────────────────────────────
    path('stocking/', StockingListCreateView.as_view(), name='stocking-list'),
    path('stocking/history/', StockingHistoryView.as_view(), name='stocking-history'),
    path('stocking/<int:pk>/', StockingDetailView.as_view(), name='stocking-detail'),

    # ── Nested stocking sub-resources ───────────────────────────────────────
    path('stocking/<int:stocking_id>/logs/', StockingActivityLogListCreateView.as_view(), name='stocking-logs'),
    path('stocking/logs/<int:pk>/', StockingActivityLogDeleteView.as_view(), name='stocking-log-delete'),
    path('stocking/<int:stocking_id>/disasters/', StockingDisasterReportListCreateView.as_view(), name='stocking-disasters'),
    path('disasters/<int:pk>/resolve/', FisheriesDisasterResolveView.as_view(), name='fisheries-disaster-resolve'),
    path('disasters/<int:pk>/', StockingDisasterReportDeleteView.as_view(), name='fisheries-disaster-delete'),
    path('stocking/<int:stocking_id>/harvests/', StockingHarvestListCreateView.as_view(), name='stocking-harvests'),
    path('stocking/harvests/<int:pk>/', StockingHarvestDeleteView.as_view(), name='stocking-harvest-delete'),
    path('stocking/<int:stocking_id>/suggestions/', FisheriesActivitySuggestionsView.as_view(), name='stocking-suggestions'),

    # ── Legacy Capture Fishing / Vessel / Assistance (relocated from monitoring) ──
    path('fishing-trips/', FishingTripLogListCreateView.as_view(), name='fishing-trip-list-create'),
    path('fishing-trips/summary/', FishingTripSummaryView.as_view(), name='fishing-trip-summary'),
    path('fishing-trips/history/', FisheriesHistoricalTimelineView.as_view(), name='fishing-trip-history'),
    path('fishing-trips/barangay-summary/', FisheriesBarangaySummaryView.as_view(), name='fishing-trip-barangay-summary'),
    path('fishing-trips/<int:pk>/', FishingTripLogDetailView.as_view(), name='fishing-trip-detail'),
    path('fishing-trips/<int:trip_id>/species/', TripSpeciesEntryListCreateView.as_view(), name='trip-species-list-create'),
    path('fishing-trips/species/<int:pk>/', TripSpeciesEntryDeleteView.as_view(), name='trip-species-delete'),
    path('vessel-inspections/', VesselInspectionListCreateView.as_view(), name='vessel-inspection-list-create'),
    path('vessel-inspections/<int:pk>/', VesselInspectionDetailView.as_view(), name='vessel-inspection-detail'),
    path('vessel-licenses/alerts/', VesselLicenseAlertView.as_view(), name='vessel-license-alerts'),
    path('fisheries-assistance/', FisheriesAssistanceListCreateView.as_view(), name='fisheries-assistance-list'),
    path('fisheries-assistance/<int:pk>/', FisheriesAssistanceDetailView.as_view(), name='fisheries-assistance-detail'),

    # ── Yield Analysis (descriptive, mirrors production/yield-analysis) ──────
    path('yield-analysis/', FisheriesYieldAnalysisView.as_view(), name='fisheries-yield-analysis'),
    path('yield-analysis/summary/', FisheriesYieldAnalysisSummaryView.as_view(), name='fisheries-yield-analysis-summary'),
]
