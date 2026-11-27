from django.db.models import Q
from rest_framework.generics import ListAPIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from auditlog.history import history_of
from auditlog.models import AuditLogEntry
from auditlog.serializers import AuditLogEntrySerializer
from core.utils import build_text_search_q, day_range_bounds, search_tokens


def _search_q(search):
    """Every word typed, in the description or in who did it. An entry written before names were kept on it is found by its
    account's name; one that kept a name is found by that name only (after a restore another account can have the same id)."""
    found = Q()
    for word in search_tokens(search):
        nameless = Q(user_name='') & build_text_search_q(word, ['user__full_name', 'user__email'])
        found &= build_text_search_q(word, ['object_repr', 'user_name', 'user_email']) | nameless
    return found


class AuditLogPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


class AuditLogListView(ListAPIView):
    serializer_class = AuditLogEntrySerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    pagination_class = AuditLogPagination

    def get_queryset(self):
        # the id settles the order of entries written in the same moment, so no row shows on two pages
        qs = AuditLogEntry.objects.select_related('user').prefetch_related('user__linked_records').order_by('-timestamp', '-id')

        model_name = self.request.query_params.get('model_name')
        action = self.request.query_params.get('action')
        user_id = self.request.query_params.get('user_id')
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        module = self.request.query_params.get('module')
        search = (self.request.query_params.get('search') or '').strip()

        if model_name:
            qs = qs.filter(model_name=model_name)
        if action:
            qs = qs.filter(action=action)
        if user_id:
            qs = qs.filter(user_id=user_id)
        if module:
            qs = qs.filter(module=module)
        if search:
            qs = qs.filter(_search_q(search))
        if date_from:
            bound = day_range_bounds(date_from)
            if bound:
                qs = qs.filter(timestamp__gte=bound)
        if date_to:
            bound = day_range_bounds(date_to, end_of_day=True)
            if bound:
                qs = qs.filter(timestamp__lte=bound)

        return qs


class AuditHistoryView(APIView):
    """The history of one farmer, fisherfolk or cooperative (auditlog.history), ten events to a page."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, kind, pk):
        found = history_of(kind, pk)
        if found is None:
            return Response({'detail': 'This record is no longer in the system.'}, status=404)
        subject, events = found
        pages = AuditLogPagination()
        shown = pages.paginate_queryset(events, request, view=self)
        return Response({'subject': subject, 'count': len(events), 'results': shown})
