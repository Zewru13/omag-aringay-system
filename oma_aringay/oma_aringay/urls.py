from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView


def api_root(request):
    return JsonResponse({
        'system': 'Integrated Agricultural Monitoring and Production Management System',
        'office': 'Office of the Municipal Agriculturist of Aringay',
        'municipality': 'Aringay, La Union',
    })


api_urlpatterns = [
    path('', api_root, name='api-root'),
    path('accounts/', include('accounts.urls')),
    path('public/', include('core.urls')),
    path('farmers/', include('farmers.urls')),
    path('fisheries/', include('fisheries.urls')),
    path('interventions/', include('interventions.urls')),
    path('production/', include('production.urls')),
    path('monitoring/', include('monitoring.urls')),
    path('reports/', include('reports.urls')),
    path('associations/', include('associations.urls')),
    path('auditlog/', include('auditlog.urls')),
    path('token/', TokenObtainPairView.as_view(), name='token-obtain-pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
]

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(api_urlpatterns)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
