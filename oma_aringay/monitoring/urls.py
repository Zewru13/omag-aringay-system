from django.urls import path

from .views import (
    FarmVisitDetailView,
    FarmVisitListCreateView,
    FisherfolkDisasterReportDetailView,
    FisherfolkDisasterReportListCreateView,
)

urlpatterns = [
    path('farm-visits/', FarmVisitListCreateView.as_view(), name='farm-visit-list-create'),
    path('farm-visits/<int:pk>/', FarmVisitDetailView.as_view(), name='farm-visit-detail'),
    path('fisherfolk-disasters/', FisherfolkDisasterReportListCreateView.as_view(), name='fisherfolk-disaster-list'),
    path('fisherfolk-disasters/<int:pk>/', FisherfolkDisasterReportDetailView.as_view(), name='fisherfolk-disaster-detail'),
]
