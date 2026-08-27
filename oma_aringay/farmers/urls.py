from django.urls import path

from .rsbsa_import_views import RsbsaUpdateImportPreviewView
from .views import (
    FarmCropDeleteView,
    FarmCropListCreateView,
    FarmerCreateView,
    FarmerDeleteView,
    FarmerDetailView,
    FarmerDuplicateCheckView,
    FarmerListView,
    FarmMachineryDeleteView,
    FarmMachineryListCreateView,
    FarmParcelCreateView,
    FarmParcelListView,
)


urlpatterns = [
    path('', FarmerListView.as_view(), name='farmers-list'),
    path('check-duplicate/', FarmerDuplicateCheckView.as_view(), name='farmers-check-duplicate'),
    path('rsbsa-import/preview/', RsbsaUpdateImportPreviewView.as_view(), name='rsbsa-import-preview'),
    path('create/', FarmerCreateView.as_view(), name='farmers-create'),
    path('<int:id>/', FarmerDetailView.as_view(), name='farmers-detail'),
    path('<int:id>/delete/', FarmerDeleteView.as_view(), name='farmers-delete'),
    path('<int:farmer_id>/parcels/', FarmParcelListView.as_view(), name='farm-parcels-list'),
    path(
        '<int:farmer_id>/parcels/create/',
        FarmParcelCreateView.as_view(),
        name='farm-parcels-create',
    ),
    # Crops
    path(
        'parcels/<int:parcel_id>/crops/',
        FarmCropListCreateView.as_view(),
        name='farm-crops-list-create',
    ),
    path('crops/<int:id>/', FarmCropDeleteView.as_view(), name='farm-crops-delete'),
    # Machinery
    path(
        'parcels/<int:parcel_id>/machinery/',
        FarmMachineryListCreateView.as_view(),
        name='farm-machinery-list-create',
    ),
    path('machinery/<int:id>/', FarmMachineryDeleteView.as_view(), name='farm-machinery-delete'),
]
