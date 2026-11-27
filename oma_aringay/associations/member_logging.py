"""Who a cooperative may log for. A member without an activated account cannot log their own activities, so their cooperative does it
for them: crop activities, and pond/cage feeding and health logs (never a harvest, and nothing else of the member's records).

Only a CURRENT member counts (an ended membership does not), and only while they have no activated account. This is worked out again
for every request, so once a member's account is activated the cooperative can no longer log for them.

A caller that is not a cooperative of the right kind gets an EMPTY set, never "everything": see accounts.permissions.scope_to_farmer
and scope_to_fisherfolk, which must not be used for a cooperative (the fisheries one filters nothing for it).
"""
from accounts.utils import accountless_or_unactivated_ids

from .models import FarmersOrganizationMember, FisherfolkOrganizationMember

# the member's kind of record -> (the cooperative account that may act for them, the membership table, its person column)
KINDS = {
    'FARMER': ('FARMERS_ORG', FarmersOrganizationMember, 'farmer_id'),
    'FISHERFOLK': ('FISHERFOLK_ORG', FisherfolkOrganizationMember, 'fisherfolk_id'),
}


def is_cooperative_for(user, person_type):
    """A signed-in cooperative account whose members are of this kind ('FARMER' or 'FISHERFOLK')."""
    return bool(
        user and user.is_authenticated and user.role == 'CITIZEN'
        and user.linked_record_type == KINDS[person_type][0] and user.linked_record_id is not None
    )


def loggable_member_ids(user, person_type):
    """The ids of the farmers / fisherfolk this cooperative account may log for."""
    if not is_cooperative_for(user, person_type):
        return set()
    _account_type, membership, column = KINDS[person_type]
    members = membership.objects.filter(organization_id=user.linked_record_id, is_active=True).values_list(column, flat=True)
    return accountless_or_unactivated_ids(person_type, members)
