from django.urls import path

from fisheries.views import GeneralDisasterReportDetailView, GeneralDisasterReportListCreateView

from .views import (
    AquacultureFeedingLogDeleteView,
    AquacultureFeedingLogListCreateView,
    AquacultureHealthLogDeleteView,
    AquacultureHealthLogListCreateView,
    AquacultureProductionCycleDetailView,
    AquacultureProductionCycleListCreateView,
    EstimateHarvestView,
    FarmVisitDetailView,
    FarmVisitListCreateView,
    FisheryInputLogDeleteView,
    FisheryInputLogListCreateView,
)

urlpatterns = [
    path('farm-visits/', FarmVisitListCreateView.as_view(), name='farm-visit-list-create'),
    path('farm-visits/<int:pk>/', FarmVisitDetailView.as_view(), name='farm-visit-detail'),
    # Aquaculture Production Cycle — RESTORED from commit 4da000a0 (same paths the frontend already calls)
    path('aquaculture-cycles/', AquacultureProductionCycleListCreateView.as_view(), name='aquaculture-cycle-list'),
    path('aquaculture-cycles/estimate-harvest/', EstimateHarvestView.as_view(), name='aquaculture-cycle-estimate-harvest'),
    path('aquaculture-cycles/<int:pk>/', AquacultureProductionCycleDetailView.as_view(), name='aquaculture-cycle-detail'),
    path('aquaculture-cycles/<int:cycle_id>/feeding/', AquacultureFeedingLogListCreateView.as_view(), name='aquaculture-feeding-list'),
    path('aquaculture-cycles/feeding/<int:pk>/', AquacultureFeedingLogDeleteView.as_view(), name='aquaculture-feeding-delete'),
    path('aquaculture-cycles/<int:cycle_id>/health/', AquacultureHealthLogListCreateView.as_view(), name='aquaculture-health-list'),
    path('aquaculture-cycles/health/<int:pk>/', AquacultureHealthLogDeleteView.as_view(), name='aquaculture-health-delete'),
    path('aquaculture-cycles/<int:cycle_id>/inputs/', FisheryInputLogListCreateView.as_view(), name='aquaculture-inputs-list'),
    path('aquaculture-inputs/<int:pk>/', FisheryInputLogDeleteView.as_view(), name='aquaculture-inputs-delete'),
    # Consolidated onto fisheries.FisheriesDisasterReport — URL path kept
    # stable so the frontend didn't need to change its request paths.
    path('fisherfolk-disasters/', GeneralDisasterReportListCreateView.as_view(), name='fisherfolk-disaster-list'),
    path('fisherfolk-disasters/<int:pk>/', GeneralDisasterReportDetailView.as_view(), name='fisherfolk-disaster-detail'),
]
