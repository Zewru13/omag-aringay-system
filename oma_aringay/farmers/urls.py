from django.urls import path

from .parcel_bulk import FarmParcelBulkCreateView
from .parcel_import import FarmParcelImportView, ParcelCropsParseView, ParcelCropsTemplateView, ParcelImportTemplateView
from .rsbsa_template import RsbsaImportTemplateView
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
    FarmerHarvestComparisonView,
    FarmMachineryDeleteView,
    FarmMachineryListCreateView,
    FarmParcelCreateView,
    FarmParcelDirectoryView,
    FarmParcelListView,
    MyFarmParcelListView,
    ParcelClassificationDetailView,
    ParcelClassificationListCreateView,
)


urlpatterns = [
    path('', FarmerListView.as_view(), name='farmers-list'),
    path('harvest-comparison/', FarmerHarvestComparisonView.as_view(), name='farmers-harvest-comparison'),
    path('check-duplicate/', FarmerDuplicateCheckView.as_view(), name='farmers-check-duplicate'),
    path('parcels/import/template/', ParcelImportTemplateView.as_view(), name='farm-parcels-import-template'),
    path('parcel-crops/template/', ParcelCropsTemplateView.as_view(), name='farm-parcel-crops-template'),
    path('parcel-crops/parse/', ParcelCropsParseView.as_view(), name='farm-parcel-crops-parse'),
    path('parcel-classifications/', ParcelClassificationListCreateView.as_view(), name='parcel-classifications'),
    path('parcel-classifications/<int:pk>/', ParcelClassificationDetailView.as_view(), name='parcel-classification-detail'),
    path('parcels/directory/', FarmParcelDirectoryView.as_view(), name='farm-parcels-directory'),
    path('me/parcels/', MyFarmParcelListView.as_view(), name='farm-parcels-mine'),
    path('rsbsa-import/template/', RsbsaImportTemplateView.as_view(), name='rsbsa-import-template'),
    path('rsbsa-import/preview/', RsbsaUpdateImportPreviewView.as_view(), name='rsbsa-import-preview'),
    path('rsbsa-import/commit/', RsbsaUpdateImportCommitView.as_view(), name='rsbsa-import-commit'),
    path('rsbsa-import/batches/', RsbsaImportBatchListView.as_view(), name='rsbsa-import-batches'),
    path('rsbsa-import/batches/<uuid:batch_id>/undo/', RsbsaImportUndoView.as_view(), name='rsbsa-import-undo'),
    path('create/', FarmerCreateView.as_view(), name='farmers-create'),
    path('<int:id>/', FarmerDetailView.as_view(), name='farmers-detail'),
    path('<int:id>/delete/', FarmerDeleteView.as_view(), name='farmers-delete'),
    path('<int:farmer_id>/parcels/', FarmParcelListView.as_view(), name='farm-parcels-list'),
    path('<int:farmer_id>/parcels/bulk/', FarmParcelBulkCreateView.as_view(), name='farm-parcels-bulk'),
    path('<int:farmer_id>/parcels/import/', FarmParcelImportView.as_view(), name='farm-parcels-import'),
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
