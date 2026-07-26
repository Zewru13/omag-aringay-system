"""
Management command: python manage.py seed_demo_data [--flush]

Creates a small, defense-friendly demo dataset for the crop domain (Batch F
reduction — mirrors fisheries/management/commands/seed_fisheries_demo_data.py's
conventions exactly):
  - 5 farmer organizations (suffix: " (Demo)")
  - 10 farmers (prefix: "DEMO-" on RSBSA number), 2 per barangay
  - 15 crop monitoring records, composed deliberately:
      - 5 under active monitoring (Planted/Near Harvest, no disaster) —
        mid-cycle, realistic done/overdue/upcoming activity-log mix driven
        by each crop's real CropActivityStage template
      - 5 Harvested (mix of above/below-estimate variance — driven by an
        explicit variance_factor per record, same technique as fisheries)
      - 3 with a disaster: 2 genuinely ACTIVE, 1 marked TOTAL LOSS (terminal
        — CropDisasterReport.is_total_loss=True auto-flips the monitoring
        record's status)
      - 2 with a disaster marked RECOVERED (Batch D terminology)

--flush  deletes all previously-created demo data before seeding.

Safe to re-run: skipped (not duplicated) if demo monitoring records already
exist. Use --flush to reset and reseed from scratch.
"""
import random
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db.models import Q

from associations.models import OrganizationOfficer, FarmersOrganization
from farmers.models import Farmer
from production.models import (
    CropActivityLog,
    CropActivityStage,
    CropDisasterReport,
    CropMonitoringRecord,
    CropType,
    DisasterResponseRule,
    HarvestRecord,
)

User = get_user_model()

DEMO_ASSOC_SUFFIX = ' (Demo)'
DEMO_RSBSA_PREFIX = 'DEMO-'
SEED_TAG = 'Created by seed_demo_data command.'

ORGANIZATIONS = [
    {
        'name': 'Basca Integrated Farmers Cooperative' + DEMO_ASSOC_SUFFIX,
        'barangay': 'Basca',
        'contact_person': 'Eduardo Ramil Santos',
        'contact_number': '09171234001',
        'email_address': 'basca.ifc.demo@aringay.gov.ph',
    },
    {
        'name': 'San Juan Sustainable Farming Organization' + DEMO_ASSOC_SUFFIX,
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

# 10 farmers (Batch F reduction from 30) — 2 per barangay, one organization
# each, matched to their own barangay's organization for realism.
# first_name, last_name, gender, birth_year, barangay, pwd, icc, fourPs
FARMERS_DATA = [
    ('Jose',      'Santos',     'Male',   1975, 'Basca',         False, False, False),
    ('Maria',     'Reyes',      'Female', 1982, 'San Juan East', False, False, True),
    ('Pedro',     'Cruz',       'Male',   1968, 'San Antonio',   False, False, False),
    ('Ana',       'Garcia',     'Female', 1990, 'Poblacion',     False, False, False),
    ('Eduardo',   'Ramos',      'Male',   1965, 'Santa Cecilia', True,  False, False),
    ('Felicitas', 'Torres',     'Female', 1979, 'Basca',         False, False, False),
    ('Bernardo',  'Flores',     'Male',   1972, 'San Juan East', False, True,  False),
    ('Maricel',   'Lopez',      'Female', 1988, 'San Antonio',   False, False, True),
    ('Rogelio',   'Hernandez',  'Male',   1960, 'Poblacion',     False, False, False),
    ('Lourdes',   'Villanueva', 'Female', 1995, 'Santa Cecilia', False, False, False),
]

# farmer_idx refers to a 0-based position into FARMERS_DATA / the created
# farmers list. 15 records total (Batch F). Farmers 0-4 each carry 2 records
# (one under-monitoring/harvested pair per crop) — deliberately, so the
# grouped-by-farmer forecasting view (Batch E, item 2) has at least a few
# farmers with real multi-record history to expand. Farmers 5-9 carry 1 each.
#
# Harvested entries carry a `variance_factor` — actual_yield_kg = the
# model's own auto-computed estimated_yield_kg * factor — so above/below-
# estimate outcomes are guaranteed. Only crop types with yield_per_ha_kg set
# (Palay, Corn, Onion, Tomato, Pechay) are used for harvested entries, since
# estimated_yield_kg is only computed when the crop type has a yield figure.
CROP_PLAN = [
    # ── 5 under active monitoring (mid-cycle, no disaster) ──
    dict(key='stk1', farmer_idx=0, crop='Palay (Rice)',       days_ago=55, completion=0.50, harvest=None),
    dict(key='stk2', farmer_idx=1, crop='Corn (Mais)',        days_ago=40, completion=0.40, harvest=None),
    dict(key='stk3', farmer_idx=2, crop='Ampalaya',           days_ago=30, completion=0.55, harvest=None),
    dict(key='stk4', farmer_idx=3, crop='Eggplant (Talong)',  days_ago=70, completion=0.90, harvest=None),  # -> auto Near Harvest
    dict(key='stk5', farmer_idx=4, crop='Sitaw',               days_ago=57, completion=0.85, harvest=None),  # -> auto Near Harvest

    # ── 5 Harvested (mixed variance — 3 above estimate, 2 below) ──
    dict(key='hrv1', farmer_idx=0, crop='Palay (Rice)', days_ago=150, completion=1.0,
         harvest=dict(variance_factor=1.12, harvest_offset_days=3)),
    dict(key='hrv2', farmer_idx=1, crop='Corn (Mais)', days_ago=130, completion=0.9,
         harvest=dict(variance_factor=0.85, harvest_offset_days=-4,
                       reason='Harvested below estimate after a dry mid-season spell.')),
    dict(key='hrv3', farmer_idx=2, crop='Onion', days_ago=140, completion=1.0,
         harvest=dict(variance_factor=1.08, harvest_offset_days=2)),
    dict(key='hrv4', farmer_idx=3, crop='Tomato', days_ago=100, completion=0.9,
         harvest=dict(variance_factor=0.80, harvest_offset_days=-5,
                       reason='Harvested below estimate — pest pressure late in the cycle.')),
    dict(key='hrv5', farmer_idx=4, crop='Pechay', days_ago=60, completion=1.0,
         harvest=dict(variance_factor=1.15, harvest_offset_days=1)),

    # ── 3 with a disaster: 2 genuinely ACTIVE, 1 TOTAL LOSS ──
    dict(key='dis_active1', farmer_idx=5, crop='Garlic',  days_ago=50, completion=0.5, harvest=None),
    dict(key='dis_active2', farmer_idx=6, crop='Cabbage', days_ago=45, completion=0.5, harvest=None),
    dict(key='dis_total_loss', farmer_idx=7, crop='Kamote', days_ago=40, completion=0.3, harvest=None),

    # ── 2 with a RECOVERED disaster ──
    dict(key='dis_recovered1', farmer_idx=8, crop='Cassava', days_ago=100, completion=0.45, harvest=None),
    dict(key='dis_recovered2', farmer_idx=9, crop='Ginger',  days_ago=90,  completion=0.45, harvest=None),
]

# Attach a CropDisasterReport to a specific CROP_PLAN key. 2 Active + 1 Total
# Loss + 2 Recovered (Batch D terminology). is_total_loss=True on the Total
# Loss entry is what flips the monitoring record's status to 'Total Loss'
# (CropDisasterReport.save() override) — not set directly on CROP_PLAN.
DISASTER_PLAN = [
    dict(plan_key='dis_active1', disaster_type='Pest Outbreak', days_ago=20,
         status='Active', rules_done='partial'),
    dict(plan_key='dis_active2', disaster_type='Strong Winds', days_ago=12,
         status='Active', rules_done='partial'),
    dict(plan_key='dis_total_loss', disaster_type='Flood', days_ago=15,
         status='Active', is_total_loss=True, rules_done='all'),
    dict(plan_key='dis_recovered1', disaster_type='Typhoon', days_ago=70,
         status='Recovered', recovered_days_ago=55, rules_done='all'),
    dict(plan_key='dis_recovered2', disaster_type='Drought', days_ago=60,
         status='Recovered', recovered_days_ago=40, rules_done='all'),
]


class Command(BaseCommand):
    help = 'Seed the database with crop demo data for showcasing.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--flush',
            action='store_true',
            help='Delete all previously-created demo data before seeding.',
        )

    def handle(self, *args, **options):
        if options['flush']:
            self._flush()

        random.seed(20260713)

        admin_user = User.objects.filter(is_superuser=True).first() or User.objects.first()
        if admin_user is None:
            self.stderr.write(self.style.ERROR(
                'No users found. Create a superuser first: python manage.py createsuperuser'
            ))
            return

        crop_types = self._load_crop_types()
        if crop_types is None:
            return

        organizations = self._create_organizations()
        farmers = self._create_farmers(organizations)
        plan_by_key, records_created = self._create_monitoring_domain(farmers, crop_types, admin_user)
        disaster_count = self._create_crop_disasters(plan_by_key, admin_user) if records_created else \
            CropDisasterReport.objects.filter(monitoring_record__farmer__in=farmers).count()

        # ── Summary ───────────────────────────────────────────────────────────
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('======================================'))
        self.stdout.write(self.style.SUCCESS('  CROP DEMO DATA SEEDER - SUMMARY'))
        self.stdout.write(self.style.SUCCESS('======================================'))
        self.stdout.write(f'  Organizations : {len(organizations):>3}')
        self.stdout.write(f'  Farmers      : {len(farmers):>3}')
        all_records = CropMonitoringRecord.objects.filter(farmer__in=farmers)
        self.stdout.write(f'  Crop Records : {all_records.count():>3}')
        status_counts = {}
        for st in all_records.values_list('status', flat=True):
            status_counts[st] = status_counts.get(st, 0) + 1
        for st, cnt in sorted(status_counts.items()):
            self.stdout.write(f'    {st:<12}: {cnt:>3}')
        self.stdout.write(f'  Disaster rpts: {disaster_count:>3}')
        self.stdout.write(f'  Activity logs: {CropActivityLog.objects.filter(monitoring_record__farmer__in=farmers).count():>3}')
        self.stdout.write(self.style.SUCCESS('======================================'))
        self.stdout.write(self.style.SUCCESS('  Done! Run --flush to reset.'))
        self.stdout.write('')

    # ── Flush ─────────────────────────────────────────────────────────────────

    def _flush(self):
        demo_farmer_ids = list(Farmer.objects.filter(
            rsbsa_number__startswith=DEMO_RSBSA_PREFIX
        ).values_list('id', flat=True))

        # CropMonitoringRecord.farmer is SET_NULL, not CASCADE — delete
        # explicitly first so demo records don't get orphaned onto real data
        # (mirrors the fix already applied to the fisheries seeder).
        records_deleted, _ = CropMonitoringRecord.objects.filter(farmer_id__in=demo_farmer_ids).delete()

        farmers_deleted, _ = Farmer.objects.filter(id__in=demo_farmer_ids).delete()
        assoc_deleted, _ = FarmersOrganization.objects.filter(
            name__endswith=DEMO_ASSOC_SUFFIX
        ).delete()
        self.stdout.write(self.style.WARNING(
            f'Flushed: {farmers_deleted} demo farmers, {assoc_deleted} demo organizations, '
            f'{records_deleted} demo crop records deleted explicitly (cascades included).'
        ))

    # ── Crop types (read-only lookup, do not create — reference data seeded
    #    via migrations, same convention as fisheries' SpeciesOption lookup) ──

    def _load_crop_types(self):
        names = [
            'Palay (Rice)', 'Corn (Mais)', 'Ampalaya', 'Eggplant (Talong)', 'Sitaw',
            'Onion', 'Tomato', 'Pechay', 'Garlic', 'Cabbage', 'Kamote', 'Cassava', 'Ginger',
        ]
        crop_types = {}
        missing = []
        for name in names:
            try:
                crop_types[name] = CropType.objects.get(name=name)
            except CropType.DoesNotExist:
                missing.append(name)
        if missing:
            self.stderr.write(self.style.ERROR(
                f'Missing CropType rows: {", ".join(missing)}. '
                'Run migrations to seed crop reference data before running this command.'
            ))
            return None
        return crop_types

    # ── Organizations ──────────────────────────────────────────────────────────

    def _create_organizations(self):
        created = []
        base_date = date(2018, 6, 15)
        for i, data in enumerate(ORGANIZATIONS):
            assoc, was_created = FarmersOrganization.objects.get_or_create(
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
                self.stdout.write(f'  Created organization: {assoc.name}')
            else:
                self.stdout.write(f'  Exists (skip):       {assoc.name}')
        return created

    def _create_officers(self, assoc, assoc_index):
        for position, names in OFFICERS_TEMPLATE:
            name = names[assoc_index % len(names)]
            OrganizationOfficer.objects.get_or_create(
                organization=assoc,
                position=position,
                defaults={'full_name': name},
            )

    # ── Farmers ───────────────────────────────────────────────────────────────

    def _create_farmers(self, organizations):
        created = []
        assoc_by_barangay = {a.barangay: a for a in organizations}
        today = date.today()

        for idx, (first, last, gender, birth_year, barangay, pwd, icc, fourps) in enumerate(FARMERS_DATA):
            rsbsa = f'{DEMO_RSBSA_PREFIX}{idx + 1:04d}'
            birth_month = (idx % 12) + 1
            birth_day = min((idx % 28) + 1, 28)
            birthdate = date(birth_year, birth_month, birth_day)
            age = today.year - birth_year
            is_senior = age >= 60

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
                    'farmers_organization': assoc_by_barangay.get(barangay),
                    'is_active':           True,
                },
            )
            created.append(farmer)
            if was_created:
                self.stdout.write(f'  Created farmer: {farmer.full_name}')
        return created

    # ── Crop Monitoring domain (records + activity logs) ────────────────────

    def _create_monitoring_domain(self, farmers, crop_types, admin_user):
        if CropMonitoringRecord.objects.filter(farmer__in=farmers).exists():
            self.stdout.write('  Crop monitoring domain already seeded — skipping (use --flush to reset).')
            return {}, False

        today = date.today()
        plan_by_key = {}

        for spec in CROP_PLAN:
            farmer = farmers[spec['farmer_idx']]
            ct = crop_types[spec['crop']]
            date_planted = today - timedelta(days=spec['days_ago'])
            area = Decimal(str(round(random.uniform(0.25, 2.5), 2)))
            land_status = random.choice(['Owner', 'Lessee', 'Tenant'])
            season = 'Wet' if date_planted.month in (6, 7, 8, 9, 10, 11) else 'Dry'

            rec = CropMonitoringRecord(
                farmer=farmer,
                farmers_organization=farmer.farmers_organization,
                farm_location_barangay=farmer.barangay,
                land_status=land_status,
                crop_type=ct,
                season=season,
                year=date_planted.year,
                date_planted=date_planted,
                area_planted_ha=area,
                variety_used='',
                seed_source='Own Seeds',
                notes=SEED_TAG,
                recorded_by=admin_user,
            )

            if spec['harvest']:
                rec.status = CropMonitoringRecord.Status.HARVESTED
                rec.save()  # first save computes estimated_yield_kg from crop_type + area
                h = spec['harvest']
                base = rec.estimated_yield_kg or (ct.yield_per_ha_kg or Decimal('1500')) * area
                actual = (base * Decimal(str(h['variance_factor']))).quantize(Decimal('0.01'))
                harvest_date = rec.expected_harvest_date + timedelta(days=h.get('harvest_offset_days', 0))
                if harvest_date > today:
                    harvest_date = today
                rec.actual_yield_kg = actual
                rec.actual_harvest_date = harvest_date
                rec.notes = f"{SEED_TAG} {h.get('reason', '')}".strip()
                rec.save()  # second save computes yield_variance_kg/pct from actual vs. estimated

                # Yield Analysis reads actual volume from HarvestRecord rows
                # (rec.harvest_records), not from the flat actual_yield_kg
                # field above — without this, Yield Analysis shows 0 kg /
                # -100% variance for every harvested record regardless of
                # the flat field. Mirrors the fisheries seeder's
                # _seed_harvests(). Note: HarvestRecord.save() re-derives
                # the parent's actual_harvest_date from date_recorded
                # (auto_now_add = today), overwriting the back-dated
                # harvest_date set above — harvest_start_date below is the
                # field of record for the historical date.
                HarvestRecord.objects.create(
                    monitoring_record=rec,
                    season=rec.season,
                    year=rec.year,
                    crop_name=ct.name,
                    area_harvested_hectares=area,
                    harvest_start_date=harvest_date,
                    harvest_end_date=harvest_date,
                    volume_kg=actual,
                    early_late_reason=h.get('reason', ''),
                    remarks=SEED_TAG,
                    recorded_by=admin_user,
                )
            else:
                rec.status = CropMonitoringRecord.Status.PLANTED
                rec.save()  # auto-transitions to Near Harvest if within 7 days, per model save()

            plan_by_key[spec['key']] = rec
            self._seed_activity_logs(rec, admin_user, spec['completion'], harvested=bool(spec['harvest']))

        self.stdout.write(f'  Created {len(plan_by_key)} crop monitoring records.')
        return plan_by_key, True

    def _seed_activity_logs(self, rec, admin_user, completion_fraction, harvested):
        stages = list(CropActivityStage.objects.filter(crop_type_id=rec.crop_type_id).order_by('day_after_planting'))
        occurrences = []
        for stage in stages:
            days_list = stage.application_days or [stage.day_after_planting]
            for day in days_list:
                occurrences.append((day, stage))
        occurrences.sort(key=lambda x: x[0])
        if not occurrences:
            return 0

        today = date.today()
        n = len(occurrences)
        always_idx = {0, 1}
        if harvested:
            always_idx.add(n - 1)

        # Only occurrences that have actually come due can be logged (future
        # ones stay unlogged and read as "upcoming"). Sample done ones
        # RANDOMLY among the due middle occurrences — not the first N
        # chronologically — so an in-progress record shows a genuine mix of
        # done and overdue/due_now items instead of "everything logged up to
        # some day, nothing after" (which never leaves an overdue gap).
        due_middle_idx = [
            i for i, (day, stage) in enumerate(occurrences)
            if i not in always_idx and (rec.date_planted + timedelta(days=day)) <= today
        ]
        n_middle_done = round(len(due_middle_idx) * completion_fraction)
        done_middle = set(random.sample(due_middle_idx, n_middle_done)) if due_middle_idx else set()

        count = 0
        for i, (day, stage) in enumerate(occurrences):
            due_date = rec.date_planted + timedelta(days=day)
            if due_date > today:
                continue
            if i not in always_idx and i not in done_middle:
                continue

            log_date = due_date + timedelta(days=random.choice([-1, 0, 0, 1]))
            if log_date > today:
                log_date = today
            if log_date < rec.date_planted and not stage.allows_pre_planting:
                log_date = rec.date_planted
            window = stage.window_days
            is_late = (log_date - due_date).days > window

            CropActivityLog.objects.create(
                monitoring_record=rec,
                activity_type=stage.stage_name,
                date_of_activity=log_date,
                plant_condition=random.choice(['Good', 'Good', 'Fair']),
                notes=stage.recommendation,
                target_day=day,
                is_late=is_late,
                recorded_by=admin_user,
            )
            count += 1
        return count

    # ── Disaster Reports ──────────────────────────────────────────────────────

    def _create_crop_disasters(self, plan_by_key, admin_user):
        today = date.today()
        count = 0
        for spec in DISASTER_PLAN:
            rec = plan_by_key.get(spec['plan_key'])
            if rec is None:
                continue
            occurrence_date = today - timedelta(days=spec['days_ago'])
            is_total_loss = spec.get('is_total_loss', False)
            disaster = CropDisasterReport.objects.create(
                monitoring_record=rec,
                disaster_type=spec['disaster_type'],
                date_of_occurrence=occurrence_date,
                area_affected_ha=(rec.area_planted_ha * Decimal('0.6')).quantize(Decimal('0.0001')),
                estimated_damage='Noticeable crop stress and damage observed following the event.',
                production_loss=(
                    'Total crop loss — production cycle ended.' if is_total_loss
                    else 'Estimated partial production loss; under monitoring.'
                ),
                is_total_loss=is_total_loss,
                status=spec['status'],
                recovered_date=(today - timedelta(days=spec.get('recovered_days_ago', 0))) if spec['status'] == 'Recovered' else None,
                recovered_by=admin_user if spec['status'] == 'Recovered' else None,
                recovery_note='Seeded recovery — response rules fully logged.' if spec['status'] == 'Recovered' else '',
                reported_by=admin_user,
            )
            count += 1

            rules_done = spec.get('rules_done')
            if rules_done:
                rules = list(DisasterResponseRule.objects.filter(
                    disaster_type=spec['disaster_type'],
                ).filter(Q(crop_type=rec.crop_type) | Q(crop_type__isnull=True)))
                to_mark = rules if rules_done == 'all' else rules[:max(1, len(rules) // 2)]
                for rule in to_mark:
                    log_date = occurrence_date + timedelta(days=random.randint(1, 3))
                    if log_date > today:
                        log_date = today
                    CropActivityLog.objects.create(
                        monitoring_record=rec,
                        activity_type=rule.activity_name,
                        date_of_activity=log_date,
                        notes=f'Response to {spec["disaster_type"]}: {rule.title}. {SEED_TAG}',
                        disaster_report=disaster,
                        disaster_rule=rule,
                        recorded_by=admin_user,
                    )
        self.stdout.write(f'  Created {count} crop disaster reports.')
        return count
