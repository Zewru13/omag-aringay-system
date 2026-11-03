"""One position per person, one person per position, in an organization.

A position is held either by an officer (an active officer term) or by a member whose membership position is anything other than
"Member". "Member" is never taken. Ended terms and deactivated members hold nothing.
"""
from rest_framework import serializers

from .models import (
    FarmersOrganizationMember, FisherfolkOrganizationMember, FisherfolkOrganizationOfficer, OrganizationOfficer,
)

PLAIN_MEMBER = 'Member'

# officer_person: how an officer row points at the person (the farmers' officer row has the farmer; the fisherfolk's has the membership).
_CFG = {
    'farmers': dict(member=FarmersOrganizationMember, officer=OrganizationOfficer, person='farmer', officer_person='farmer'),
    'fisherfolk': dict(member=FisherfolkOrganizationMember, officer=FisherfolkOrganizationOfficer, person='fisherfolk',
                       officer_person='member__fisherfolk'),
}


def holder_of(domain, organization_id, position):
    """The name of whoever holds the position (an active officer first, else an active member), or None when it is free."""
    cfg = _CFG[domain]
    officer = cfg['officer'].objects.filter(organization_id=organization_id, position=position, is_active=True).first()
    if officer:
        return officer.full_name
    member = (cfg['member'].objects.filter(organization_id=organization_id, position=position, is_active=True)
              .select_related(cfg['person']).first())
    return getattr(member, cfg['person']).full_name if member else None


def position_of(domain, organization_id, person):
    """The position the person already holds (an active officer term, else a membership position other than Member), or None."""
    cfg = _CFG[domain]
    officer = cfg['officer'].objects.filter(organization_id=organization_id, is_active=True, **{cfg['officer_person']: person}).first()
    if officer:
        return officer.position
    member = (cfg['member'].objects.filter(organization_id=organization_id, is_active=True, **{cfg['person']: person})
              .exclude(position=PLAIN_MEMBER).first())
    return member.position if member else None


def check_position_free(domain, organization_id, position, field='position'):
    """Refuse a position somebody holds already (never "Member")."""
    if not position or position == PLAIN_MEMBER:
        return
    holder = holder_of(domain, organization_id, position)
    if holder:
        raise serializers.ValidationError(
            {field: f'{position} is already held by {holder}. End their term first, or choose another position.'})


def check_person_has_no_position(domain, organization_id, person):
    """Refuse a second position for someone who holds one."""
    current = position_of(domain, organization_id, person)
    if current:
        raise serializers.ValidationError(
            {'detail': f'{person.full_name} already holds the position of {current}. A person can hold only one position: end it first.'})
