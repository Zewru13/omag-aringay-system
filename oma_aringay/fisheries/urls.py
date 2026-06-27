from django.urls import path

from .views import (
    FisherfolkCreateView,
    FisherfolkDetailView,
    FisherfolkListView,
)


urlpatterns = [
    path('', FisherfolkListView.as_view(), name='fisherfolk-list'),
    path('create/', FisherfolkCreateView.as_view(), name='fisherfolk-create'),
    path('<int:id>/', FisherfolkDetailView.as_view(), name='fisherfolk-detail'),
]
