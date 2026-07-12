from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdminOrEvaluator

from .models import FarmVisit, FisherfolkDisasterReport
from .serializers import FarmVisitSerializer, FisherfolkDisasterReportSerializer


class FarmVisitListCreateView(generics.ListCreateAPIView):
    serializer_class = FarmVisitSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        qs = FarmVisit.objects.select_related('farmer', 'conducted_by').order_by('-visit_date')
        params = self.request.query_params
        if params.get('farmer'):
            qs = qs.filter(farmer_id=params['farmer'])
        if params.get('barangay'):
            qs = qs.filter(farmer__barangay=params['barangay'])
        if params.get('year'):
            qs = qs.filter(visit_date__year=params['year'])
        return qs

    def perform_create(self, serializer):
        serializer.save(conducted_by=self.request.user)


class FarmVisitDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = FarmVisitSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FarmVisit.objects.select_related('farmer', 'conducted_by')


# ─── Fisherfolk Disaster Reports ─────────────────────────────────────────────

class FisherfolkDisasterReportListCreateView(generics.ListCreateAPIView):
    serializer_class = FisherfolkDisasterReportSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        qs = FisherfolkDisasterReport.objects.select_related('fisherfolk').order_by('-report_date')
        params = self.request.query_params
        if params.get('fisherfolk'):
            qs = qs.filter(fisherfolk_id=params['fisherfolk'])
        if params.get('barangay'):
            qs = qs.filter(affected_barangay=params['barangay'])
        if params.get('disaster_type'):
            qs = qs.filter(disaster_type=params['disaster_type'])
        return qs

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


class FisherfolkDisasterReportDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = FisherfolkDisasterReportSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FisherfolkDisasterReport.objects.select_related('fisherfolk')
    http_method_names = ['get', 'patch', 'delete']

    def destroy(self, request, *args, **kwargs):
        if request.user.role != 'ADMIN':
            return Response(
                {'detail': 'Only administrators can delete disaster reports.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)
