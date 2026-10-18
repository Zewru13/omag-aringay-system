from django.urls import path

from .rsbsa_import_undo import RsbsaImportBatchListView, RsbsaImportUndoView
from .rsbsa_import_views import RsbsaUpdateImportCommitView, RsbsaUpdateImportPreviewView
from .views import (
    FarmCropDeleteView,
    FarmCropListCreateView,
    FarmerCreateView,
    FarmCropPcicFormView,
    FarmerDeleteView,
    FarmerDetailView,
    FarmerDuplicateCheckView,
    FarmerListView,
    FarmMachineryDeleteView,
    FarmMachineryListCreateView,
    FarmParcelCreateView,
    FarmParcelListView,
    MyFarmParcelListView,
)


urlpatterns = [
    path('', FarmerListView.as_view(), name='farmers-list'),
    path('check-duplicate/', FarmerDuplicateCheckView.as_view(), name='farmers-check-duplicate'),
    path('me/parcels/', MyFarmParcelListView.as_view(), name='farm-parcels-mine'),
    path('rsbsa-import/preview/', RsbsaUpdateImportPreviewView.as_view(), name='rsbsa-import-preview'),
    path('rsbsa-import/commit/', RsbsaUpdateImportCommitView.as_view(), name='rsbsa-import-commit'),
    path('rsbsa-import/batches/', RsbsaImportBatchListView.as_view(), name='rsbsa-import-batches'),
    path('rsbsa-import/batches/<uuid:batch_id>/undo/', RsbsaImportUndoView.as_view(), name='rsbsa-import-undo'),
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
    path('crops/<int:id>/pcic-form/', FarmCropPcicFormView.as_view(), name='farm-crops-pcic-form'),
    # Machinery
    path(
        'parcels/<int:parcel_id>/machinery/',
        FarmMachineryListCreateView.as_view(),
        name='farm-machinery-list-create',
    ),
    path('machinery/<int:id>/', FarmMachineryDeleteView.as_view(), name='farm-machinery-delete'),
]
