from rest_framework.generics import ListAPIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import IsAdmin
from auditlog.models import AuditLogEntry
from auditlog.serializers import AuditLogEntrySerializer
from core.utils import day_range_bounds


class AuditLogPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class AuditLogListView(ListAPIView):
    serializer_class = AuditLogEntrySerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    pagination_class = AuditLogPagination

    def get_queryset(self):
        qs = AuditLogEntry.objects.select_related('user').order_by('-timestamp')

        model_name = self.request.query_params.get('model_name')
        action = self.request.query_params.get('action')
        user_id = self.request.query_params.get('user_id')
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')

        if model_name:
            qs = qs.filter(model_name=model_name)
        if action:
            qs = qs.filter(action=action)
        if user_id:
            qs = qs.filter(user_id=user_id)
        if date_from:
            bound = day_range_bounds(date_from)
            if bound:
                qs = qs.filter(timestamp__gte=bound)
        if date_to:
            bound = day_range_bounds(date_to, end_of_day=True)
            if bound:
                qs = qs.filter(timestamp__lte=bound)

        return qs
