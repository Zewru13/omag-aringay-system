from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import IsAdminOrEvaluator

from .models import FarmVisit
from .serializers import FarmVisitSerializer


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
