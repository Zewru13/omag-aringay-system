import datetime
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from associations.models import (
    FarmersOrganization, FarmersOrganizationEquipment, FarmersOrganizationMember,
    FisherfolkOrganization, FisherfolkOrganizationEquipment, FisherfolkOrganizationMember,
)
from farmers.models import Farmer
from fisheries.models import Fisherfolk

MARK = 'Sample data (top_up_organizations)'
# The kinds of equipment added, in this order, skipping what the organization already has. All are real choices of the equipment form.
FARMERS_EQUIPMENT = ['Hand Tractor', 'Rice Thresher', 'Water Pump/Irrigation Pump', 'Knapsack Sprayer', 'Corn Sheller', 'Rice Mill', 'Dryer',
                     'Storage Facility', 'Seedling Tray', 'Harvesting Equipment']
FISHERFOLK_EQUIPMENT = ['Fishing Boat/Banca', 'Outboard Motor', 'Fish Net (Gill Net)', 'Fish Net (Cast Net)', 'Ice Box/Cooler', 'Aerator/Air Pump',
                        'Fish Weighing Scale', 'Life Vest/Safety Gear', 'Water Pump', 'Feeding Equipment']
QUANTITIES = [2, 1, 3, 1, 2, 4, 1, 2, 1, 3]

# One description per kind of organization, so the farmers and the fisherfolk go through the same code.
KINDS = [
    {
        'key': 'farmers', 'label': 'farmers', 'org': FarmersOrganization, 'member': FarmersOrganizationMember, 'person': Farmer, 'person_fk': 'farmer',
        'equipment': FarmersOrganizationEquipment, 'names': FARMERS_EQUIPMENT,
    },
    {
        'key': 'fisherfolk', 'label': 'fisherfolk', 'org': FisherfolkOrganization, 'member': FisherfolkOrganizationMember, 'person': Fisherfolk,
        'person_fk': 'fisherfolk', 'equipment': FisherfolkOrganizationEquipment, 'names': FISHERFOLK_EQUIPMENT,
    },
]


def candidates(kind, org, need, taken):
    """Up to `need` registered people who are in no organization yet (never a DEMO person, never someone already picked in this run), the
    people of the organization's own barangay first."""
    if need <= 0:
        return []
    free = kind['person'].objects.exclude(rsbsa_number__startswith='DEMO').exclude(pk__in=taken).exclude(
        pk__in=kind['member'].objects.filter(is_active=True).values(f"{kind['person_fk']}_id"))
    same = list(free.filter(barangay=org.barangay).order_by('id')[:need])
    rest = list(free.exclude(barangay=org.barangay).order_by('id')[:need - len(same)]) if len(same) < need else []
    return same + rest


def date_joined_for(org):
    day = org.date_registered or org.date_organized or datetime.date.today()
    return min(day, datetime.date.today())


def equipment_to_add(kind, org, target):
    have = set(org.equipment.values_list('equipment_name', flat=True))
    missing = target - len(have)
    if missing <= 0:
        return []
    return [name for name in kind['names'] if name not in have][:missing]


class Command(BaseCommand):
    help = (
        'Make every organization (farmers and fisherfolk) reach --members members and --equipment kinds of equipment. Members are registered people '
        'who are in no organization yet (the organization\'s own barangay first), added as ordinary Members; equipment is added as new kinds, marked '
        f'"{MARK}". Without --confirm it only shows the plan. With --confirm it writes a manifest of exactly what it added; '
        '--undo <manifest> --confirm removes exactly that.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--members', type=int, default=15, help='Members every organization should have (default 15).')
        parser.add_argument('--equipment', type=int, default=5, help='Kinds of equipment every organization should have (default 5).')
        parser.add_argument('--confirm', action='store_true', help='Really do it. Without it nothing changes.')
        parser.add_argument('--backup-dir', default='.', help='Where the manifest is written (default: the current folder).')
        parser.add_argument('--undo', metavar='MANIFEST', help='Remove exactly the rows a manifest lists.')

    def handle(self, *args, **options):
        if options['undo']:
            return self.undo(options['undo'], options['confirm'])
        plans = self.plan(options['members'], options['equipment'])
        if not any(p['people'] or p['equipment'] for p in plans):
            self.stdout.write(self.style.SUCCESS('Nothing to add: every organization already has enough members and equipment.'))
            return
        for p in plans:
            parts = []
            if p['people'] or p['short']:
                parts.append(f"add {len(p['people'])} member(s)" + (f" (only {len(p['people'])} people available, wanted {p['wanted']})" if p['short'] else ''))
            if p['equipment']:
                parts.append(f"add {len(p['equipment'])} equipment ({', '.join(p['equipment'])})")
            self.stdout.write(f"  {p['kind']['label']:10} #{p['org'].id} {p['org'].name}: {p['have']} member(s); " + ('; '.join(parts) or 'nothing to add'))
        if not options['confirm']:
            self.stdout.write(self.style.WARNING('Nothing was changed. Add --confirm to add the members and equipment listed above.'))
            return

        manifest = {'farmers_members': [], 'fisherfolk_members': [], 'farmers_equipment': [], 'fisherfolk_equipment': []}
        with transaction.atomic():
            for p in plans:
                kind, org = p['kind'], p['org']
                joined = date_joined_for(org)
                for person in p['people']:
                    # Their first organization, so it is their main one (the same rule as adding a member from the organization's page).
                    row = kind['member'].objects.create(organization=org, **{kind['person_fk']: person}, position='Member', date_joined=joined, is_main=True)
                    manifest[f"{kind['key']}_members"].append(row.pk)
                for i, name in enumerate(p['equipment']):
                    row = kind['equipment'].objects.create(organization=org, equipment_name=name, quantity=QUANTITIES[i % len(QUANTITIES)], condition='Good', remarks=MARK)
                    manifest[f"{kind['key']}_equipment"].append(row.pk)
        stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
        path = Path(options['backup_dir']) / f'top-up-organizations-{stamp}.json'
        path.write_text(json.dumps(manifest, indent=1), encoding='utf8')
        total = {k: len(v) for k, v in manifest.items()}
        self.stdout.write(self.style.SUCCESS(f'Added {total["farmers_members"] + total["fisherfolk_members"]} member(s) and {total["farmers_equipment"] + total["fisherfolk_equipment"]} equipment row(s).'))
        self.stdout.write(f'  manifest written to {path} (use --undo {path} --confirm to remove exactly these rows)')

    def plan(self, want_members, want_equipment):
        plans, taken = [], {k['key']: set() for k in KINDS}
        for kind in KINDS:
            for org in kind['org'].objects.order_by('id'):
                have = org.members.filter(is_active=True).count()
                people = candidates(kind, org, want_members - have, taken[kind['key']])
                taken[kind['key']].update(p.pk for p in people)
                plans.append({
                    'kind': kind, 'org': org, 'have': have, 'people': people, 'wanted': want_members - have,
                    'short': len(people) < want_members - have, 'equipment': equipment_to_add(kind, org, want_equipment),
                })
        return plans

    def undo(self, manifest_path, confirm):
        try:
            manifest = json.loads(Path(manifest_path).read_text(encoding='utf8'))
        except (OSError, ValueError) as err:
            raise CommandError(f'Cannot read the manifest {manifest_path}: {err}')
        pairs = [('farmers_members', FarmersOrganizationMember), ('fisherfolk_members', FisherfolkOrganizationMember),
                 ('farmers_equipment', FarmersOrganizationEquipment), ('fisherfolk_equipment', FisherfolkOrganizationEquipment)]
        counts = {key: model.objects.filter(pk__in=manifest.get(key, [])).count() for key, model in pairs}
        self.stdout.write('  would remove ' + ', '.join(f'{n} {key.replace("_", " ")}' for key, n in counts.items()))
        if not confirm:
            self.stdout.write(self.style.WARNING('Nothing was changed. Add --confirm to remove them.'))
            return
        with transaction.atomic():
            for key, model in pairs:
                model.objects.filter(pk__in=manifest.get(key, [])).delete()
        self.stdout.write(self.style.SUCCESS('Removed.'))
