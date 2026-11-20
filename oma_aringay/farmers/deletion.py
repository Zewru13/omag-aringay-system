"""What stops a farmer from being deleted, and the clean-up when nothing does.

A farmer registered by mistake can be deleted; a farmer with any history cannot, because deleting them would erase or orphan that history
(parcels and assistance were deleted with the farmer, and crop records were left with no farmer). The relations are read from the model, so a
table added later that points at a farmer blocks deletion without anyone having to remember this file."""
from accounts.models import User, UserLinkedRecord

# Plain words for the office; a table not listed here falls back to its own name.
PLAIN_NAMES = {
    'FarmParcel': 'farm parcel',
    'CropMonitoringRecord': 'crop record',
    'BeneficiaryRecord': 'assistance record',
    'FarmerMachinery': 'machinery record',
    'FarmVisit': 'farm visit',
    'FarmersOrganizationMember': 'organization membership',
    'OrganizationOfficer': 'organization officer position',
    'FarmersOrganizationEquipmentLoan': 'equipment loan',
}


def reasons_to_keep(farmer):
    """Short reasons, like '2 crop records', for everything recorded for this farmer; an active login is a reason too."""
    reasons = []
    for relation in farmer._meta.related_objects:
        count = getattr(farmer, relation.get_accessor_name()).count()
        if count:
            model = relation.related_model
            name = PLAIN_NAMES.get(model.__name__) or str(model._meta.verbose_name)
            reasons.append(f'{count} {name}{"" if count == 1 else "s"}')
    if _linked_users(farmer).filter(is_active=True).exists():
        reasons.append('the farmer already has a working login')
    return reasons


def remove_waiting_accounts(farmer):
    """Delete the unused login made at registration (inactive, never set up), so no account is left pointing at a farmer that is gone."""
    for user in _linked_users(farmer).filter(is_active=False):
        user.delete()
    UserLinkedRecord.objects.filter(record_type=User.LinkedRecordType.FARMER, record_id=farmer.pk).delete()


def _linked_users(farmer):
    ids = UserLinkedRecord.objects.filter(record_type=User.LinkedRecordType.FARMER, record_id=farmer.pk).values_list('user_id', flat=True)
    return User.objects.filter(pk__in=ids)
