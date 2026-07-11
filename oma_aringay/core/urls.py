from django.urls import path

from .views import (
    LockAcquireView,
    LockHeartbeatView,
    LockReleaseBeaconView,
    LockReleaseView,
    LockStatusView,
    NotificationListView,
    NotificationMarkAllReadView,
    NotificationMarkReadView,
)

urlpatterns = [
    path('locks/acquire/', LockAcquireView.as_view(), name='lock-acquire'),
    path('locks/heartbeat/', LockHeartbeatView.as_view(), name='lock-heartbeat'),
    path('locks/release/', LockReleaseView.as_view(), name='lock-release'),
    path('locks/release-beacon/', LockReleaseBeaconView.as_view(), name='lock-release-beacon'),
    path('locks/status/', LockStatusView.as_view(), name='lock-status'),

    path('notifications/', NotificationListView.as_view(), name='notifications-list'),
    path('notifications/<int:pk>/read/', NotificationMarkReadView.as_view(), name='notifications-mark-read'),
    path('notifications/read-all/', NotificationMarkAllReadView.as_view(), name='notifications-mark-all-read'),
]
