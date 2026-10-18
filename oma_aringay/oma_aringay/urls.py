from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path

from core.constants import SYSTEM_TITLE
from rest_framework_simplejwt.views import TokenRefreshView


def api_root(request):
    return JsonResponse({
        'system': SYSTEM_TITLE,
        'office': 'Office of the Municipal Agriculturist of Aringay',
        'municipality': 'Aringay, La Union',
    })


api_urlpatterns = [
    path('', api_root, name='api-root'),
    path('', include('core.urls')),
    path('accounts/', include('accounts.urls')),
path('farmers/', include('farmers.urls')),
    path('fisheries/', include('fisheries.urls')),
    path('interventions/', include('interventions.urls')),
    path('production/', include('production.urls')),
    path('monitoring/', include('monitoring.urls')),
    path('reports/', include('reports.urls')),
    path('organizations/', include('associations.urls')),
    path('auditlog/', include('auditlog.urls')),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
]

urlpatterns = [
    path('api/', include(api_urlpatterns)),
]

# The Django admin has its own, unthrottled login form and nobody uses it, so it is off unless explicitly enabled.
if getattr(settings, 'ENABLE_DJANGO_ADMIN', False):
    urlpatterns.insert(0, path('admin/', admin.site.urls))

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
