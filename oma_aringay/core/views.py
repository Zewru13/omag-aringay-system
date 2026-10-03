import json

from django.contrib.auth import get_user_model
from django.core.paginator import Paginator
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .locking import acquire_lock
from .models import Notification, RecordLock
from .serializers import NotificationSerializer

User = get_user_model()


def _user_brief(user):
    return {'id': user.id, 'name': user.full_name or user.email}


def _lock_payload(lock, locked=True):
    if not locked or lock is None:
        return {'locked': False}
    return {
        'locked': True,
        'locked_by': _user_brief(lock.locked_by),
        'locked_at': lock.locked_at.isoformat(),
        'expires_in_seconds': lock.expires_in_seconds(),
    }


# ─── Record Locking ───────────────────────────────────────────────────────────

class LockAcquireView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        record_type = request.data.get('record_type')
        record_id = request.data.get('record_id')
        if not record_type or not record_id:
            return Response({'detail': 'record_type and record_id are required.'}, status=status.HTTP_400_BAD_REQUEST)

        lock = acquire_lock(request.user, record_type, record_id)
        if lock is not None:
            return Response(_lock_payload(lock), status=status.HTTP_200_OK)

        current = RecordLock.objects.select_related('locked_by').get(
            record_type=record_type, record_id=record_id,
        )
        return Response(_lock_payload(current), status=status.HTTP_409_CONFLICT)


class LockHeartbeatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        record_type = request.data.get('record_type')
        record_id = request.data.get('record_id')
        if not record_type or not record_id:
            return Response({'detail': 'record_type and record_id are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            lock = RecordLock.objects.select_related('locked_by').get(
                record_type=record_type, record_id=record_id,
            )
        except RecordLock.DoesNotExist:
            return Response({'locked': False, 'detail': 'No lock to heartbeat.'}, status=status.HTTP_409_CONFLICT)

        if lock.locked_by_id != request.user.id:
            return Response(_lock_payload(lock), status=status.HTTP_409_CONFLICT)

        lock.save(update_fields=['locked_at'])
        return Response(_lock_payload(lock), status=status.HTTP_200_OK)


def _citizen_owns_locked_record(user, record_type, record_id):
    """
    Evaluator-parity batch: does `user` (a CITIZEN) own the underlying
    Farmer/Fisherfolk record that `record_type`/`record_id` (RecordLock's
    own vocabulary — 'crop' or 'stocking') refers to? Mirrors the
    get_target_owner_id resolution used throughout production/views.py and
    fisheries/views.py, but standalone here since LockReleaseView isn't
    built on IsStaffOrOwnRecordCitizen's has_object_permission hook (a lock
    isn't the entry being edited — it's a row on a completely different
    model with no FK to Farmer/Fisherfolk at all).
    """
    if user.linked_record_type not in ('FARMER', 'FISHERFOLK'):
        return False
    try:
        record_id_int = int(record_id)
    except (TypeError, ValueError):
        return False
    if record_type == 'crop' and user.linked_record_type == 'FARMER':
        from production.models import CropMonitoringRecord
        return CropMonitoringRecord.objects.filter(
            pk=record_id_int, farmer_id=user.linked_record_id,
        ).exists()
    if record_type == 'stocking' and user.linked_record_type == 'FISHERFOLK':
        from fisheries.models import StockingRecord
        return StockingRecord.objects.filter(
            pk=record_id_int, fisherfolk_id=user.linked_record_id,
        ).exists()
    return False


class LockReleaseView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        record_type = request.data.get('record_type')
        record_id = request.data.get('record_id')
        if not record_type or not record_id:
            return Response({'detail': 'record_type and record_id are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            lock = RecordLock.objects.get(record_type=record_type, record_id=record_id)
        except RecordLock.DoesNotExist:
            return Response({'released': True}, status=status.HTTP_200_OK)

        is_owner = lock.locked_by_id == request.user.id
        is_admin = request.user.role == 'ADMIN'
        # Evaluator-parity batch: a CITIZEN may force-release a stale lock
        # held by someone else, but ONLY on their own record — never on
        # anyone else's, and this is a genuinely separate grant from
        # `is_owner` above (is_owner already covers "it's my own lock").
        is_citizen_own_record = (
            request.user.role == 'CITIZEN'
            and _citizen_owns_locked_record(request.user, record_type, record_id)
        )
        if not is_owner and not is_admin and not is_citizen_own_record:
            return Response(
                {'detail': 'Only the lock owner, an administrator, or the record\'s own citizen owner can release this lock.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        lock.delete()
        forced = not is_owner and (is_admin or is_citizen_own_record)
        return Response({'released': True, 'forced': forced}, status=status.HTTP_200_OK)


MAX_LOCK_STATUS_IDS = 200


def _citizen_owned_ids(user, record_type, ids):
    """The subset of `ids` (record_type 'crop' / 'stocking') that this CITIZEN owns - the batch form of
    _citizen_owns_locked_record()."""
    if record_type == 'crop' and user.linked_record_type == 'FARMER':
        from production.models import CropMonitoringRecord
        return set(CropMonitoringRecord.objects.filter(pk__in=ids, farmer_id=user.linked_record_id).values_list('id', flat=True))
    if record_type == 'stocking' and user.linked_record_type == 'FISHERFOLK':
        from fisheries.models import StockingRecord
        return set(StockingRecord.objects.filter(pk__in=ids, fisherfolk_id=user.linked_record_id).values_list('id', flat=True))
    return set()


class LockStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        record_type = request.query_params.get('record_type')
        record_ids = request.query_params.get('record_ids')
        if record_type and record_ids is not None:
            return self._batch(request, record_type, record_ids)
        record_id = request.query_params.get('record_id')
        if not record_type or not record_id:
            return Response({'detail': 'record_type and record_id are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            lock = RecordLock.objects.select_related('locked_by').get(
                record_type=record_type, record_id=record_id,
            )
        except RecordLock.DoesNotExist:
            return Response(_lock_payload(None, locked=False))

        if not lock.is_active():
            return Response(_lock_payload(None, locked=False))
        return Response(_lock_payload(lock))

    def _batch(self, request, record_type, record_ids):
        """GET ?record_type=stocking&record_ids=1,2,3 -> {"results": {"1": <status>, ...}}: the same per-record
        status as the single form, for a whole page in one request. A CITIZEN only gets the records they own
        (others are simply left out); staff get every requested record, as with the single form."""
        try:
            ids = sorted({int(x) for x in record_ids.split(',') if x.strip()})
        except ValueError:
            return Response({'detail': 'record_ids must be a comma-separated list of ids.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(ids) > MAX_LOCK_STATUS_IDS:
            return Response({'detail': f'At most {MAX_LOCK_STATUS_IDS} record_ids per request.'}, status=status.HTTP_400_BAD_REQUEST)
        if request.user.role == 'CITIZEN':
            ids = sorted(_citizen_owned_ids(request.user, record_type, ids)) if ids else []
        locks = {
            lock.record_id: lock
            for lock in RecordLock.objects.select_related('locked_by').filter(record_type=record_type, record_id__in=ids)
        } if ids else {}
        results = {}
        for rid in ids:
            lock = locks.get(rid)
            results[str(rid)] = _lock_payload(lock) if lock is not None and lock.is_active() else _lock_payload(None, locked=False)
        return Response({'results': results})


class LockReleaseBeaconView(APIView):
    """
    Best-effort release for `navigator.sendBeacon` on tab close. sendBeacon
    cannot set an Authorization header, so the access token travels in the
    beacon's JSON body instead and is validated manually here. The 10-minute
    lock expiry is the real backstop if this never fires (browser killed,
    beacon blocked, etc.) — this is purely a nicety to free the lock sooner.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            payload = json.loads(request.body.decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            return Response(status=status.HTTP_400_BAD_REQUEST)

        record_type = payload.get('record_type')
        record_id = payload.get('record_id')
        token_str = payload.get('access_token')
        if not (record_type and record_id and token_str):
            return Response(status=status.HTTP_400_BAD_REQUEST)

        try:
            from rest_framework_simplejwt.tokens import AccessToken
            token = AccessToken(token_str)
            user_id = token['user_id']
        except Exception:
            return Response(status=status.HTTP_401_UNAUTHORIZED)

        RecordLock.objects.filter(
            record_type=record_type, record_id=record_id, locked_by_id=user_id,
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Notifications ────────────────────────────────────────────────────────────
#
# Simple polling (30-60s interval on the frontend) rather than websockets —
# this is a LAN office app with a handful of concurrent users, so the extra
# infrastructure (channels/ASGI/a message broker) wouldn't be worth it.

class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Notification.objects.filter(recipient=request.user).select_related('actor')
        unread_count = qs.filter(is_read=False).count()

        page_size = 20
        try:
            page_num = max(1, int(request.query_params.get('page', 1)))
        except (TypeError, ValueError):
            page_num = 1
        paginator = Paginator(qs, page_size)
        page = paginator.get_page(page_num)

        return Response({
            'count': paginator.count,
            'unread_count': unread_count,
            'next': page.next_page_number() if page.has_next() else None,
            'previous': page.previous_page_number() if page.has_previous() else None,
            'results': NotificationSerializer(page.object_list, many=True).data,
        })


class NotificationMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        updated = Notification.objects.filter(pk=pk, recipient=request.user).update(is_read=True)
        if not updated:
            return Response({'detail': 'Notification not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'detail': 'Marked as read.'})


class NotificationMarkAllReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        count = Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return Response({'detail': 'All notifications marked as read.', 'updated': count})
