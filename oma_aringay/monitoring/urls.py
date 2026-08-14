from django.urls import path

from fisheries.views import GeneralDisasterReportDetailView, GeneralDisasterReportListCreateView

from .views import FarmVisitDetailView, FarmVisitListCreateView

urlpatterns = [
    path('farm-visits/', FarmVisitListCreateView.as_view(), name='farm-visit-list-create'),
    path('farm-visits/<int:pk>/', FarmVisitDetailView.as_view(), name='farm-visit-detail'),
    # Consolidated onto fisheries.FisheriesDisasterReport — URL path kept
    # stable so the frontend didn't need to change its request paths.
    path('fisherfolk-disasters/', GeneralDisasterReportListCreateView.as_view(), name='fisherfolk-disaster-list'),
    path('fisherfolk-disasters/<int:pk>/', GeneralDisasterReportDetailView.as_view(), name='fisherfolk-disaster-detail'),
]
