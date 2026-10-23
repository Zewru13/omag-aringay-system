"""Create the three persistent demo Fisherfolk Organizations.

These are NOT test fixtures — they are meant to stay in the database. Until
now the FisherfolkOrganization table has been empty, which meant the whole
fisherfolk half of the organization feature (membership join table, officer
roster, bulk distribution, the citizen org account) had never been exercised
against real records.

Members are drawn from genuinely imported Fisherfolk rows, preferring people
who actually live in the organization's barangay, so the demo data is
plausible rather than arbitrary. Officer coverage is deliberately uneven
across the three — one nearly complete, one sparse — so the dashboard's
vacancy detection has something real to detect.

Idempotent: re-running matches on registration_number and tops up any
missing members/officers instead of duplicating them.
"""
import datetime

from django.core.management.base import BaseCommand
from django.db import transaction

from associations.models import (
    FisherfolkOrganization,
    FisherfolkOrganizationMember,
    FisherfolkOrganizationOfficer,
)
from fisheries.models import Fisherfolk

# (registration_number, name, barangay, member_target, [positions to fill])
DEMO_ORGS = [
    (
        'BFAR-RIII-2024-0101',
        'Samara Fisherfolk Association',
        'Samara',
        8,
        ['President', 'Vice President', 'Secretary', 'Treasurer', 'Auditor'],
    ),
    (
        'BFAR-RIII-2024-0102',
        'Dulao Coastal Fisherfolk Cooperative',
        'Dulao',
        6,
        ['President', 'Secretary', 'Treasurer'],
    ),
    (
        'BFAR-RIII-2024-0103',
        'Alaska Aquaculture Growers Association',
        'Alaska',
        5,
        ['President'],
    ),
]


class Command(BaseCommand):
    help = 'Create/refresh the three persistent demo Fisherfolk Organizations.'

    @transaction.atomic
    def handle(self, *args, **options):
        today = datetime.date.today()

        for reg_no, name, barangay, member_target, positions in DEMO_ORGS:
            org, created = FisherfolkOrganization.objects.get_or_create(
                registration_number=reg_no,
                defaults=dict(
                    name=name,
                    barangay=barangay,
                    registration_agency='BFAR',
                    contact_person='—',
                    contact_number='09000000000',
                    date_organized=today - datetime.timedelta(days=730),
                    date_registered=today - datetime.timedelta(days=700),
                ),
            )
            self.stdout.write(
                f"{'CREATED' if created else 'EXISTS '} org#{org.id} {org.name} "
                f"(Brgy. {org.barangay}, {org.registration_number})"
            )

            have = org.members.count()
            if have < member_target:
                # Prefer people from this barangay; fall back to anyone not
                # already in THIS organization so the target is still met.
                taken = set(org.members.values_list('fisherfolk_id', flat=True))
                local = list(
                    Fisherfolk.objects.filter(barangay=barangay)
                    .exclude(id__in=taken).order_by('id')[: member_target - have]
                )
                if len(local) < member_target - have:
                    filler = (
                        Fisherfolk.objects
                        .exclude(id__in=taken | {f.id for f in local})
                        .order_by('id')[: member_target - have - len(local)]
                    )
                    local += list(filler)
                for f in local:
                    FisherfolkOrganizationMember.objects.get_or_create(
                        organization=org, fisherfolk=f,
                        defaults=dict(date_joined=today - datetime.timedelta(days=365)),
                    )

            members = list(org.members.select_related('fisherfolk').order_by('id'))
            for i, position in enumerate(positions):
                if i >= len(members):
                    break
                if FisherfolkOrganizationOfficer.objects.filter(
                    organization=org, position=position,
                ).exists():
                    continue
                m = members[i]
                FisherfolkOrganizationOfficer.objects.create(
                    organization=org, member=m, position=position,
                    full_name=m.fisherfolk.full_name,
                )

            self.stdout.write(
                f"         members={org.members.count()}  "
                f"officers={org.officers.count()}/"
                f"{len(FisherfolkOrganizationOfficer.POSITION_CHOICES)}"
            )
            for o in org.officers.order_by('position'):
                self.stdout.write(f"           {o.position}: {o.full_name}")
