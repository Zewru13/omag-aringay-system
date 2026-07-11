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
        if not is_owner and not is_admin:
            return Response(
                {'detail': 'Only the lock owner or an administrator can release this lock.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        lock.delete()
        return Response({'released': True, 'forced': is_admin and not is_owner}, status=status.HTTP_200_OK)


class LockStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        record_type = request.query_params.get('record_type')
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
        page_num = int(request.query_params.get('page', 1))
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
