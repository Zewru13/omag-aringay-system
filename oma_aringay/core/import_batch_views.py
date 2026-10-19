"""Endpoints behind every "Undo a recent import" panel. Admin and Evaluator only.

  GET  /api/imports/batches/?type=<key>        recent batches of one import type (last 30 days, newest first)
  GET  /api/imports/batches/<id>/undo-plan/    what an undo would do right now (writes nothing)
  POST /api/imports/batches/<id>/undo/         {"item_ids": [...]} undo those items (at most 100 per call)

A bulk undo is where the security key will be asked for once that rule is switched on: `_before_undo` is that hook."""
from datetime import timedelta

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator
from core.import_batches import IMPORT_TYPES
from core.import_undo import build_plan, execute_items
from core.models import ImportBatch

WINDOW_DAYS = 30
MAX_ITEMS_PER_CALL = 100


def _before_undo(request):
    """Placeholder for the planned security-key check on bulk operations (docs/superpowers/plans/2026-10-19-security-key.md)."""


class _StaffView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]


class ImportBatchListView(_StaffView):
    def get(self, request):
        import_type = request.query_params.get('type', '')
        if import_type not in IMPORT_TYPES:
            return Response({'detail': 'Say which import to list (type=...).'}, status=400)
        since = timezone.now() - timedelta(days=WINDOW_DAYS)
        batches = ImportBatch.objects.filter(import_type=import_type, created_at__gte=since).select_related('performed_by')
        return Response({'batches': [{
            'id': str(b.id),
            'import_type': b.import_type,
            'label': b.label,
            'performed_by_name': (b.performed_by.full_name or b.performed_by.email or b.performed_by.username) if b.performed_by else '',
            'created_at': b.created_at.isoformat(),
            'row_count': b.row_count,
            'undone': b.undone_at is not None,
        } for b in batches]})


class ImportBatchPlanView(_StaffView):
    def get(self, request, batch_id):
        batch = get_object_or_404(ImportBatch, pk=batch_id)
        items = [{'item_id': p.item_id, 'label': p.label, 'can_undo': p.can_undo, 'reason': p.reason} for p in build_plan(batch)]
        return Response({
            'items': items,
            'can_undo': sum(1 for i in items if i['can_undo']),
            'kept': sum(1 for i in items if not i['can_undo']),
        })


class ImportBatchUndoView(_StaffView):
    def post(self, request, batch_id):
        batch = get_object_or_404(ImportBatch, pk=batch_id)
        ids = request.data.get('item_ids')
        if (not isinstance(ids, list) or not ids or len(ids) > MAX_ITEMS_PER_CALL
                or not all(isinstance(i, int) and not isinstance(i, bool) for i in ids)):
            return Response({'detail': f'Send between 1 and {MAX_ITEMS_PER_CALL} item ids as whole numbers.'}, status=400)
        _before_undo(request)
        return Response({'results': execute_items(batch, ids, request.user)})
