from django.urls import path

from .views import (
    AquacultureFeedingLogDeleteView,
    AquacultureFeedingLogListCreateView,
    AquacultureHealthLogDeleteView,
    AquacultureHealthLogListCreateView,
    AquacultureProductionCycleDetailView,
    AquacultureProductionCycleListCreateView,
    FarmVisitDetailView,
    FarmVisitListCreateView,
    FisherfolkDisasterReportDetailView,
    FisherfolkDisasterReportListCreateView,
    FisheryInputLogDeleteView,
    FisheryInputLogListCreateView,
)

urlpatterns = [
    path('farm-visits/', FarmVisitListCreateView.as_view(), name='farm-visit-list-create'),
    path('farm-visits/<int:pk>/', FarmVisitDetailView.as_view(), name='farm-visit-detail'),
    path('aquaculture-cycles/', AquacultureProductionCycleListCreateView.as_view(), name='aquaculture-cycle-list'),
    path('aquaculture-cycles/<int:pk>/', AquacultureProductionCycleDetailView.as_view(), name='aquaculture-cycle-detail'),
    path('aquaculture-cycles/<int:cycle_id>/feeding/', AquacultureFeedingLogListCreateView.as_view(), name='aquaculture-feeding-list'),
    path('aquaculture-cycles/feeding/<int:pk>/', AquacultureFeedingLogDeleteView.as_view(), name='aquaculture-feeding-delete'),
    path('aquaculture-cycles/<int:cycle_id>/health/', AquacultureHealthLogListCreateView.as_view(), name='aquaculture-health-list'),
    path('aquaculture-cycles/health/<int:pk>/', AquacultureHealthLogDeleteView.as_view(), name='aquaculture-health-delete'),
    path('aquaculture-cycles/<int:cycle_id>/inputs/', FisheryInputLogListCreateView.as_view(), name='aquaculture-inputs-list'),
    path('aquaculture-inputs/<int:pk>/', FisheryInputLogDeleteView.as_view(), name='aquaculture-inputs-delete'),
    path('fisherfolk-disasters/', FisherfolkDisasterReportListCreateView.as_view(), name='fisherfolk-disaster-list'),
    path('fisherfolk-disasters/<int:pk>/', FisherfolkDisasterReportDetailView.as_view(), name='fisherfolk-disaster-detail'),
]
