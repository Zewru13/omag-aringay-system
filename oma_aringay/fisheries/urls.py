from django.urls import path

from .views import (
    FisherfolkListView,
    FisherfolkDetailView,
    FisherfolkDuplicateCheckView,
    SpeciesCategoryListCreateView,
    SpeciesCategoryDetailView,
    SpeciesOptionListCreateView,
    SpeciesOptionDetailView,
    SpeciesActivityStageListCreateView,
    SpeciesActivityStageDeleteView,
    StockingListCreateView,
    StockingDetailView,
    StockingActivityLogListCreateView,
    StockingActivityLogDeleteView,
    StockingDisasterReportListCreateView,
    StockingHarvestListCreateView,
    StockingHarvestDeleteView,
    FisheriesActivitySuggestionsView,
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
    path('stocking/<int:pk>/', StockingDetailView.as_view(), name='stocking-detail'),

    # ── Nested stocking sub-resources ───────────────────────────────────────
    path('stocking/<int:stocking_id>/logs/', StockingActivityLogListCreateView.as_view(), name='stocking-logs'),
    path('stocking/logs/<int:pk>/', StockingActivityLogDeleteView.as_view(), name='stocking-log-delete'),
    path('stocking/<int:stocking_id>/disasters/', StockingDisasterReportListCreateView.as_view(), name='stocking-disasters'),
    path('stocking/<int:stocking_id>/harvests/', StockingHarvestListCreateView.as_view(), name='stocking-harvests'),
    path('stocking/harvests/<int:pk>/', StockingHarvestDeleteView.as_view(), name='stocking-harvest-delete'),
    path('stocking/<int:stocking_id>/suggestions/', FisheriesActivitySuggestionsView.as_view(), name='stocking-suggestions'),
]
