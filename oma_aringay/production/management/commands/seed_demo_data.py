"""
Management command: python manage.py seed_demo_data [--flush]

Creates demo data for showcasing the system:
  - 5 farmer associations (suffix: " (Demo)")
  - 30 farmers (prefix: "DEMO-" on RSBSA number)
  - 50 crop monitoring records with varied statuses
  - Activity logs and disaster reports

--flush  deletes all previously-created demo data before seeding.
"""
import random
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from associations.models import AssociationOfficer, FarmersAssociation
from farmers.models import Farmer
from production.models import (
    CropActivityLog,
    CropCategory,
    CropDisasterReport,
    CropMonitoringRecord,
    CropType,
)

User = get_user_model()

DEMO_ASSOC_SUFFIX = ' (Demo)'
DEMO_RSBSA_PREFIX = 'DEMO-'

ASSOCIATIONS = [
    {
        'name': 'Basca Integrated Farmers Cooperative' + DEMO_ASSOC_SUFFIX,
        'barangay': 'Basca',
        'contact_person': 'Eduardo Ramil Santos',
        'contact_number': '09171234001',
        'email_address': 'basca.ifc.demo@aringay.gov.ph',
    },
    {
        'name': 'San Juan Sustainable Farming Association' + DEMO_ASSOC_SUFFIX,
        'barangay': 'San Juan East',
        'contact_person': 'Felicitas Reyes Aguilar',
        'contact_number': '09181234002',
        'email_address': 'sanjuan.sfa.demo@aringay.gov.ph',
    },
    {
        'name': 'San Antonio Smallholder Farmers Group' + DEMO_ASSOC_SUFFIX,
        'barangay': 'San Antonio',
        'contact_person': 'Bernardo Lim Corpuz',
        'contact_number': '09191234003',
        'email_address': 'sanantonio.sfg.demo@aringay.gov.ph',
    },
    {
        'name': 'Poblacion Farmers Alliance' + DEMO_ASSOC_SUFFIX,
        'barangay': 'Poblacion',
        'contact_person': 'Maricel Bautista Cruz',
        'contact_number': '09201234004',
        'email_address': 'poblacion.fa.demo@aringay.gov.ph',
    },
    {
        'name': 'Santa Cecilia Progressive Farmers (Demo)',
        'barangay': 'Santa Cecilia',
        'contact_person': 'Rogelio Macaraeg Valdez',
        'contact_number': '09211234005',
        'email_address': 'santacecilia.pf.demo@aringay.gov.ph',
    },
]

OFFICERS_TEMPLATE = [
    ('President',      ['Juan dela Cruz', 'Maria Santos', 'Pedro Reyes', 'Rosa Villanueva', 'Carlos Mendoza']),
    ('Vice President', ['Ana Bautista',   'Jose Flores',  'Lita Garcia',  'Ramon Torres',    'Elena Morales']),
    ('Secretary',      ['Nena Ramos',     'Felix Castillo','Gina Lopez',   'Vic Hernandez',   'Alma Jimenez']),
    ('Treasurer',      ['Ben Villanueva', 'Cora Pascual', 'Doy Aguirre',  'Luz Espiritu',    'Tony Salcedo']),
    ('Auditor',        ['Rita Ocampo',    'Leo Navarro',  'Mely Buena',   'Jun Soriano',     'Cely Padua']),
]

FARMERS_DATA = [
    # first_name, last_name, gender, birth_year, barangay, pwd, icc, fourPs
    ('Jose',       'Santos',      'Male',   1975, 'Basca',              False, False, False),
    ('Maria',      'Reyes',       'Female', 1982, 'San Juan East',           False, False, True),
    ('Pedro',      'Cruz',        'Male',   1968, 'San Antonio',        False, False, False),
    ('Ana',        'Garcia',      'Female', 1990, 'Poblacion',          False, False, False),
    ('Eduardo',    'Ramos',       'Male',   1965, 'Santa Cecilia',      True,  False, False),
    ('Felicitas',  'Torres',      'Female', 1979, 'Basca',              False, False, False),
    ('Bernardo',   'Flores',      'Male',   1972, 'San Juan East',           False, True,  False),
    ('Maricel',    'Lopez',       'Female', 1988, 'San Antonio',        False, False, True),
    ('Rogelio',    'Hernandez',   'Male',   1960, 'Poblacion',          False, False, False),
    ('Lourdes',    'Villanueva',  'Female', 1995, 'Santa Cecilia',      False, False, False),
    ('Ricardo',    'Bautista',    'Male',   1970, 'Basca',              True,  False, True),
    ('Concepcion', 'Castillo',    'Female', 1955, 'San Juan East',           False, False, False),
    ('Domingo',    'Aguilar',     'Male',   1983, 'San Antonio',        False, False, False),
    ('Rosario',    'Navarro',     'Female', 1976, 'Poblacion',          False, True,  False),
    ('Francisco',  'Espiritu',    'Male',   1948, 'Santa Cecilia',      False, False, False),
    ('Carmen',     'Ocampo',      'Female', 1992, 'Basca',              False, False, False),
    ('Arturo',     'Pascual',     'Male',   1967, 'San Juan East',           False, False, True),
    ('Gloria',     'Mendoza',     'Female', 1980, 'San Antonio',        True,  False, False),
    ('Ernesto',    'Jimenez',     'Male',   1973, 'Poblacion',          False, False, False),
    ('Teresita',   'Morales',     'Female', 1986, 'Santa Cecilia',      False, False, False),
    ('Rodrigo',    'Dela Cruz',   'Male',   1952, 'Basca',              False, True,  False),
    ('Natividad',  'Soriano',     'Female', 1969, 'San Juan East',           False, False, True),
    ('Maximo',     'Padua',       'Male',   1963, 'San Antonio',        False, False, False),
    ('Perla',      'Buena',       'Female', 1997, 'Poblacion',          False, False, False),
    ('Gregorio',   'Salcedo',     'Male',   1978, 'Santa Cecilia',      False, False, False),
    ('Milagros',   'Aquino',      'Female', 1984, 'Basca',              False, False, True),
    ('Virgilio',   'Macaraeg',    'Male',   1958, 'San Juan East',           True,  False, False),
    ('Caridad',    'Lagman',      'Female', 1991, 'San Antonio',        False, False, False),
    ('Arsenio',    'Sarmiento',   'Male',   1974, 'Poblacion',          False, True,  False),
    ('Resurreccion','Quirino',    'Female', 1962, 'Santa Cecilia',      False, False, False),
]

CROP_NAMES_FALLBACK = [
    ('Rice', 120, 3500),
    ('Corn', 90,  2800),
    ('Eggplant', 70, 15000),
    ('Tomato', 75, 20000),
    ('Sitao', 60, 4000),
]

ACTIVITY_TYPES = [
    'Land Preparation',
    'Planting',
    'Fertilizer Application',
    'Irrigation',
    'Weeding',
    'Pest Control',
    'Disease Control',
    'Harvesting',
]


class Command(BaseCommand):
    help = 'Seed the database with demo data for showcasing.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--flush',
            action='store_true',
            help='Delete all demo data before seeding.',
        )

    def handle(self, *args, **options):
        if options['flush']:
            self._flush()

        admin_user = User.objects.filter(is_superuser=True).first() or User.objects.first()
        if admin_user is None:
            self.stderr.write(self.style.ERROR(
                'No users found. Create a superuser first: python manage.py createsuperuser'
            ))
            return

        crop_types = self._ensure_crop_types()
        associations = self._create_associations()
        farmers = self._create_farmers(associations)
        records = self._create_monitoring_records(associations, farmers, crop_types, admin_user)
        self._create_activity_logs(records, admin_user)
        self._create_disaster_reports(records, admin_user)

        # ── Summary ───────────────────────────────────────────────────────────
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('======================================'))
        self.stdout.write(self.style.SUCCESS('  DEMO DATA SEEDER - SUMMARY'))
        self.stdout.write(self.style.SUCCESS('======================================'))
        self.stdout.write(f'  Associations : {len(associations):>3}')
        self.stdout.write(f'  Farmers      : {len(farmers):>3}')
        self.stdout.write(f'  Crop Records : {len(records):>3}')
        status_counts = {}
        for r in records:
            status_counts[r.status] = status_counts.get(r.status, 0) + 1
        for st, cnt in sorted(status_counts.items()):
            self.stdout.write(f'    {st:<12}: {cnt:>3}')
        disaster_count = CropDisasterReport.objects.filter(
            monitoring_record__in=records
        ).count()
        self.stdout.write(f'  Disaster rpts: {disaster_count:>3}')
        activity_count = CropActivityLog.objects.filter(
            monitoring_record__in=records
        ).count()
        self.stdout.write(f'  Activity logs: {activity_count:>3}')
        self.stdout.write(self.style.SUCCESS('======================================'))
        self.stdout.write(self.style.SUCCESS('  Done! Run --flush to reset.'))
        self.stdout.write('')

    # ── Flush ─────────────────────────────────────────────────────────────────

    def _flush(self):
        farmers_deleted, _ = Farmer.objects.filter(
            rsbsa_number__startswith=DEMO_RSBSA_PREFIX
        ).delete()
        assoc_deleted, _ = FarmersAssociation.objects.filter(
            name__endswith=DEMO_ASSOC_SUFFIX
        ).delete()
        self.stdout.write(self.style.WARNING(
            f'Flushed: {farmers_deleted} demo farmers, {assoc_deleted} demo associations (cascades included).'
        ))

    # ── Crop Types ────────────────────────────────────────────────────────────

    def _ensure_crop_types(self):
        existing = list(CropType.objects.all()[:10])
        if existing:
            return existing
        self.stdout.write(self.style.WARNING(
            'No crop types found — creating minimal set for seeder.'
        ))
        category, _ = CropCategory.objects.get_or_create(
            name='Demo Crops',
            defaults={'description': 'Auto-created by seed_demo_data'},
        )
        types = []
        for name, days, yield_kg in CROP_NAMES_FALLBACK:
            ct, _ = CropType.objects.get_or_create(
                name=name,
                defaults={
                    'days_to_harvest': days,
                    'yield_per_ha_kg': Decimal(yield_kg),
                    'category': category,
                },
            )
            types.append(ct)
        return types

    # ── Associations ──────────────────────────────────────────────────────────

    def _create_associations(self):
        created = []
        base_date = date(2018, 6, 15)
        for i, data in enumerate(ASSOCIATIONS):
            assoc, was_created = FarmersAssociation.objects.get_or_create(
                name=data['name'],
                defaults={
                    'barangay':             data['barangay'],
                    'registration_number':  f'DEMO-REG-{i + 1:03d}',
                    'date_organized':       base_date + timedelta(days=i * 30),
                    'date_registered':      base_date + timedelta(days=i * 30 + 60),
                    'registration_agency':  'CDA',
                    'email_address':        data['email_address'],
                    'contact_person':       data['contact_person'],
                    'contact_number':       data['contact_number'],
                    'is_active':            True,
                },
            )
            created.append(assoc)
            if was_created:
                self._create_officers(assoc, i)
                self.stdout.write(f'  Created association: {assoc.name}')
            else:
                self.stdout.write(f'  Exists (skip):       {assoc.name}')
        return created

    def _create_officers(self, assoc, assoc_index):
        for position, names in OFFICERS_TEMPLATE:
            name = names[assoc_index % len(names)]
            AssociationOfficer.objects.get_or_create(
                association=assoc,
                position=position,
                defaults={'full_name': name},
            )

    # ── Farmers ───────────────────────────────────────────────────────────────

    def _create_farmers(self, associations):
        created = []
        assoc_pool = associations  # cycle through associations for ~70% membership
        today = date.today()

        for idx, (first, last, gender, birth_year, barangay, pwd, icc, fourps) in enumerate(FARMERS_DATA):
            rsbsa = f'{DEMO_RSBSA_PREFIX}{idx + 1:04d}'
            birth_month = (idx % 12) + 1
            birth_day = min((idx % 28) + 1, 28)
            birthdate = date(birth_year, birth_month, birth_day)
            age = today.year - birth_year
            is_senior = age >= 60

            # ~70% get an association
            assoc = associations[idx % len(associations)] if idx % 10 < 7 else None

            civil_choices = ['Single', 'Married', 'Married', 'Married', 'Widowed']
            civil_status = civil_choices[idx % len(civil_choices)]

            farmer, was_created = Farmer.objects.get_or_create(
                rsbsa_number=rsbsa,
                defaults={
                    'first_name':          first,
                    'last_name':           last,
                    'gender':              gender,
                    'birthdate':           birthdate,
                    'barangay':            barangay,
                    'civil_status':        civil_status,
                    'is_pwd':              pwd,
                    'is_icc_ip_member':    icc,
                    'is_4ps_beneficiary':  fourps,
                    'is_senior_citizen':   is_senior,
                    'farmers_association': assoc,
                    'is_active':           True,
                },
            )
            created.append(farmer)
            if was_created:
                self.stdout.write(f'  Created farmer: {farmer.full_name}')
        return created

    # ── Crop Monitoring Records ───────────────────────────────────────────────

    def _create_monitoring_records(self, associations, farmers, crop_types, admin_user):
        created = []
        today = date.today()
        cur_year = today.year
        season = 'Wet' if today.month >= 6 else 'Dry'

        def pick_crop():
            return random.choice(crop_types)

        def make_record(assoc, status, date_planted, growth_stage='', actual_yield=None, actual_harvest=None):
            ct = pick_crop()
            area = Decimal(str(round(random.uniform(0.25, 2.5), 2)))
            farmer = random.choice(farmers) if farmers else None
            land_status = random.choice(['Owner', 'Lessee', 'Tenant'])
            rec = CropMonitoringRecord(
                farmers_association=assoc,
                farmer=farmer,
                land_status=land_status,
                farm_location_barangay=farmer.barangay if farmer else '',
                crop_type=ct,
                season=season,
                year=cur_year,
                date_planted=date_planted,
                area_planted_ha=area,
                status=status,
                current_growth_stage=growth_stage,
                variety_used='NSIC Rc222' if ct.name == 'Rice' else '',
                seed_source='Own Seeds',
                notes='Created by seed_demo_data command.',
                recorded_by=admin_user,
            )
            if actual_yield is not None:
                rec.actual_yield_kg = actual_yield
                rec.actual_harvest_date = actual_harvest
            rec.save()
            return rec

        # 15 Active / Planted (planted 10-30 days ago, harvest far off)
        for i in range(15):
            assoc = associations[i % len(associations)]
            days_ago = random.randint(10, 30)
            dp = today - timedelta(days=days_ago)
            r = make_record(assoc, 'Active', dp, 'Planted')
            created.append(r)

        # 10 Active / For Harvest (harvest date within next 14 days)
        for i in range(10):
            assoc = associations[i % len(associations)]
            # Plant far enough back that harvest is imminent
            # pick a crop type and set planted so expected_harvest is within 14 days
            ct = pick_crop()
            days_to_harvest = ct.days_to_harvest
            plant_offset = days_to_harvest - random.randint(1, 14)
            dp = today - timedelta(days=plant_offset)
            r = make_record(assoc, 'Active', dp, 'Near Harvest')
            created.append(r)

        # 5 Active / Overdue (harvest date 1-30 days past)
        for i in range(5):
            assoc = associations[i % len(associations)]
            ct = pick_crop()
            overdue_by = random.randint(1, 30)
            dp = today - timedelta(days=ct.days_to_harvest + overdue_by)
            r = make_record(assoc, 'Active', dp, 'Maturity')
            created.append(r)

        # 15 Harvested
        for i in range(15):
            assoc = associations[i % len(associations)]
            harvest_days_ago = random.randint(10, 90)
            ah = today - timedelta(days=harvest_days_ago)
            ct = pick_crop()
            dp = ah - timedelta(days=ct.days_to_harvest)
            area = Decimal(str(round(random.uniform(0.25, 2.5), 2)))
            actual_yield = (ct.yield_per_ha_kg * area * Decimal(str(round(random.uniform(0.75, 1.10), 2)))).quantize(Decimal('0.01')) if ct.yield_per_ha_kg else Decimal('1500.00')
            r = make_record(assoc, 'Harvested', dp, 'Harvested', actual_yield=actual_yield, actual_harvest=ah)
            created.append(r)

        # 5 Damaged (with disaster reports added later)
        for i in range(5):
            assoc = associations[i % len(associations)]
            days_ago = random.randint(20, 60)
            dp = today - timedelta(days=days_ago)
            r = make_record(assoc, 'Damaged', dp, 'Vegetative')
            created.append(r)

        self.stdout.write(f'  Created {len(created)} monitoring records.')
        return created

    # ── Activity Logs ─────────────────────────────────────────────────────────

    def _create_activity_logs(self, records, admin_user):
        count = 0
        for rec in records:
            if rec.status == 'Damaged':
                continue  # disasters only
            num_logs = random.randint(1, 3)
            for j in range(num_logs):
                days_offset = random.randint(1, max(1, (date.today() - rec.date_planted).days - 1))
                activity_date = rec.date_planted + timedelta(days=days_offset)
                CropActivityLog.objects.create(
                    monitoring_record=rec,
                    activity_type=random.choice(ACTIVITY_TYPES[:6]),
                    activity_date=activity_date,
                    plant_condition=random.choice(['Good', 'Fair', 'Good', 'Good']),
                    status_at_log=random.choice(['Vegetative', 'Flowering', 'Vegetative']),
                    notes='Auto-generated by seed_demo_data.',
                    recorded_by=admin_user,
                )
                count += 1
        self.stdout.write(f'  Created {count} activity logs.')

    # ── Disaster Reports ──────────────────────────────────────────────────────

    def _create_disaster_reports(self, records, admin_user):
        disaster_recs = [r for r in records if r.status == 'Damaged']
        disaster_types = ['Typhoon', 'Flood', 'Drought', 'Pest Outbreak', 'Strong Winds']
        count = 0
        for i, rec in enumerate(disaster_recs):
            days_ago = random.randint(5, 20)
            CropDisasterReport.objects.create(
                monitoring_record=rec,
                disaster_type=disaster_types[i % len(disaster_types)],
                date_of_occurrence=date.today() - timedelta(days=days_ago),
                area_affected_ha=rec.area_planted_ha * Decimal('0.75'),
                estimated_damage='Significant crop damage to leaves and stems.',
                production_loss='Estimated 60-80% production loss.',
                reported_by=admin_user,
            )
            count += 1
        self.stdout.write(f'  Created {count} disaster reports.')
