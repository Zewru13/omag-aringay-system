from django.urls import path

from .views import (
    DiseaseResponseGuideDetailView,
    DiseaseResponseGuideListCreateView,
    DiseaseTypeDetailView,
    DiseaseTypeListCreateView,
    FeedTypeDetailView,
    FeedTypeListCreateView,
    FisherfolkListView,
    FisherfolkDetailView,
    FisherfolkDuplicateCheckView,
    FisheriesActivitySuggestionsView,
    FisheriesActivityTypeDetailView,
    FisheriesActivityTypeListCreateView,
    FisheriesBarangaySummaryView,
    FisheriesDisasterResolveView,
    FisheriesHistoricalTimelineView,
    FisheriesYieldAnalysisView,
    FisheriesYieldAnalysisSummaryView,
    StockingFormOptionsView,
    FishingTripLogDetailView,
    FishingTripLogListCreateView,
    FishingTripSummaryView,
    PondBulkCreateView,
    PondDetailView,
    PondListCreateView,
    SpeciesCategoryListCreateView,
    SpeciesCategoryDetailView,
    SpeciesOptionListCreateView,
    SpeciesOptionDetailView,
    SpeciesActivityStageListCreateView,
    SpeciesActivityStageDeleteView,
    StockingListCreateView,
    StockingBulkCreateView,
    StockingForecastingTemplateView,
    StockingForecastingImportView,
    StockingHistoryView,
    StockingDetailView,
    StockingActivityLogListCreateView,
    StockingActivityLogDeleteView,
    StockingActivityLogDetailView,
    StockingDisasterReportListCreateView,
    StockingDisasterReportDeleteView,
    StockingHarvestListCreateView,
    StockingHarvestDeleteView,
    StockingHarvestDetailView,
    TripSpeciesEntryDeleteView,
    TripSpeciesEntryListCreateView,
)


urlpatterns = [
    # ── Fisherfolk ──────────────────────────────────────────────────────────
    path('fisherfolk/', FisherfolkListView.as_view(), name='fisherfolk-list'),
    path('fisherfolk/check-duplicate/', FisherfolkDuplicateCheckView.as_view(), name='fisherfolk-check-duplicate'),
    path('fisherfolk/<int:id>/', FisherfolkDetailView.as_view(), name='fisherfolk-detail'),

    # ── Ponds (Batch 3; bulk-create added Batch D) ──────────────────────────────
    path('fisherfolk/<int:fisherfolk_id>/ponds/', PondListCreateView.as_view(), name='fisherfolk-ponds-list-create'),
    path('fisherfolk/<int:fisherfolk_id>/ponds/bulk/', PondBulkCreateView.as_view(), name='fisherfolk-ponds-bulk-create'),
    path('ponds/<int:pk>/', PondDetailView.as_view(), name='pond-detail'),

    # ── Species categories ──────────────────────────────────────────────────
    path('species-categories/', SpeciesCategoryListCreateView.as_view(), name='species-category-list'),
    path('species-categories/<int:pk>/', SpeciesCategoryDetailView.as_view(), name='species-category-detail'),
    path('activity-types/', FisheriesActivityTypeListCreateView.as_view(), name='fisheries-activity-types'),
    path('activity-types/<int:pk>/', FisheriesActivityTypeDetailView.as_view(), name='fisheries-activity-type-detail'),

    # ── Species options & stages ────────────────────────────────────────────
    path('species/', SpeciesOptionListCreateView.as_view(), name='species-list'),
    path('species/<int:pk>/', SpeciesOptionDetailView.as_view(), name='species-detail'),
    path('species/<int:species_id>/stages/', SpeciesActivityStageListCreateView.as_view(), name='species-stages'),
    path('species/stages/<int:pk>/', SpeciesActivityStageDeleteView.as_view(), name='species-stage-delete'),

    # ── Feed types (Batch 4) ─────────────────────────────────────────────────
    path('feed-types/', FeedTypeListCreateView.as_view(), name='feed-type-list'),
    path('feed-types/<int:pk>/', FeedTypeDetailView.as_view(), name='feed-type-detail'),

    # ── Disease reference data (Batch 4) ────────────────────────────────────
    path('disease-types/', DiseaseTypeListCreateView.as_view(), name='disease-type-list'),
    path('disease-types/<int:pk>/', DiseaseTypeDetailView.as_view(), name='disease-type-detail'),
    path('disease-response-guides/', DiseaseResponseGuideListCreateView.as_view(), name='disease-response-guide-list'),
    path('disease-response-guides/<int:pk>/', DiseaseResponseGuideDetailView.as_view(), name='disease-response-guide-detail'),

    # ── Stocking records ────────────────────────────────────────────────────
    path('stocking/form-options/', StockingFormOptionsView.as_view(), name='stocking-form-options'),
    path('stocking/', StockingListCreateView.as_view(), name='stocking-list'),
    path('stocking/bulk/', StockingBulkCreateView.as_view(), name='stocking-bulk-create'),
    path('stocking/forecasting/template/', StockingForecastingTemplateView.as_view(), name='stocking-forecasting-template'),
    path('stocking/forecasting/import/', StockingForecastingImportView.as_view(), name='stocking-forecasting-import'),
    path('stocking/history/', StockingHistoryView.as_view(), name='stocking-history'),
    path('stocking/<int:pk>/', StockingDetailView.as_view(), name='stocking-detail'),

    # ── Nested stocking sub-resources ───────────────────────────────────────
    path('stocking/<int:stocking_id>/logs/', StockingActivityLogListCreateView.as_view(), name='stocking-logs'),
    path('stocking/logs/<int:pk>/', StockingActivityLogDeleteView.as_view(), name='stocking-log-delete'),
    path('stocking/logs/<int:id>/detail/', StockingActivityLogDetailView.as_view(), name='stocking-log-detail'),
    path('stocking/<int:stocking_id>/disasters/', StockingDisasterReportListCreateView.as_view(), name='stocking-disasters'),
    path('disasters/<int:pk>/resolve/', FisheriesDisasterResolveView.as_view(), name='fisheries-disaster-resolve'),
    path('disasters/<int:pk>/', StockingDisasterReportDeleteView.as_view(), name='fisheries-disaster-delete'),
    path('stocking/<int:stocking_id>/harvests/', StockingHarvestListCreateView.as_view(), name='stocking-harvests'),
    path('stocking/harvests/<int:pk>/', StockingHarvestDeleteView.as_view(), name='stocking-harvest-delete'),
    path('stocking/harvests/<int:id>/detail/', StockingHarvestDetailView.as_view(), name='stocking-harvest-detail'),
    path('stocking/<int:stocking_id>/suggestions/', FisheriesActivitySuggestionsView.as_view(), name='stocking-suggestions'),

    # ── Legacy Capture Fishing / Assistance (relocated from monitoring) ──────
    path('fishing-trips/', FishingTripLogListCreateView.as_view(), name='fishing-trip-list-create'),
    path('fishing-trips/summary/', FishingTripSummaryView.as_view(), name='fishing-trip-summary'),
    path('fishing-trips/history/', FisheriesHistoricalTimelineView.as_view(), name='fishing-trip-history'),
    path('fishing-trips/barangay-summary/', FisheriesBarangaySummaryView.as_view(), name='fishing-trip-barangay-summary'),
    path('fishing-trips/<int:pk>/', FishingTripLogDetailView.as_view(), name='fishing-trip-detail'),
    path('fishing-trips/<int:trip_id>/species/', TripSpeciesEntryListCreateView.as_view(), name='trip-species-list-create'),
    path('fishing-trips/species/<int:pk>/', TripSpeciesEntryDeleteView.as_view(), name='trip-species-delete'),
    # fisheries-assistance/ retired (Batch 6) — absorbed into
    # /interventions/fisherfolk-beneficiaries/adhoc/ (FisheriesAssistanceRecord -> FisherfolkBeneficiaryRecord).

    # ── Yield Analysis (descriptive, mirrors production/yield-analysis) ──────
    path('yield-analysis/', FisheriesYieldAnalysisView.as_view(), name='fisheries-yield-analysis'),
    path('yield-analysis/summary/', FisheriesYieldAnalysisSummaryView.as_view(), name='fisheries-yield-analysis-summary'),
]
