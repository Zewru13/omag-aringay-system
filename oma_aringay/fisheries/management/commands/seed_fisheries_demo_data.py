"""
Management command: python manage.py seed_fisheries_demo_data [--flush]

Creates demo data for showcasing the fisheries domain (mirrors
production/management/commands/seed_demo_data.py's conventions):
  - 15 demo fisherfolk (marker: lgu_registration_number starting '2099-')
  - 20 stocking records across all 6 species (incl. Oyster), with 3
    fisherfolk+species pairs repeated across 3 cycles each (feeds the
    Forecasting tab's cycle-trend panel)
  - Activity logs with a realistic done/overdue/upcoming mix
  - Harvest records (single-final and multi-partial patterns) with a mix
    of positive and negative variance outcomes
  - Stocking-level disaster reports (active/partial, active/all-done,
    resolved, total-loss)
  - Capture & Vessels: FishingTripLog + TripSpeciesEntry, VesselInspection
  - Assistance records
  - Fisherfolk-level disaster reports (monitoring app)

--flush  deletes all previously-created demo data before seeding.

Safe to re-run: each domain is skipped (not duplicated) if demo records
already exist for it. Use --flush to reset and reseed from scratch.
"""
import random
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db.models import Q

from fisheries.models import (
    Fisherfolk,
    FisheriesActivityLog,
    FisheriesAssistanceRecord,
    FisheriesDisasterReport,
    FisheriesDisasterResponseRule,
    FisheriesHarvestRecord,
    FishingTripLog,
    SpeciesActivityStage,
    SpeciesOption,
    StockingRecord,
    TripSpeciesEntry,
    VesselInspection,
)
from monitoring.models import FisherfolkDisasterReport

User = get_user_model()

DEMO_LGU_YEAR = '2099'  # unmistakably-fake registration year used as the demo marker
SEED_TAG = 'Seeded by seed_fisheries_demo_data command.'

# first, last, gender, birth_year, barangay, fisherfolk_type, pwd, icc, fourps, has_fishr, has_rsbsa, has_boatr
FISHERFOLK_DATA = [
    ('Marcelo',      'Bautista',      'Male',   1970, 'San Juan West',    'Aquaculture', False, False, False, True,  True,  False),
    ('Herminia',     'Salvador',      'Female', 1983, 'San Juan East',    'Aquaculture', False, False, True,  True,  False, False),
    ('Teodoro',      'Villegas',      'Male',   1965, 'Poblacion',        'Aquaculture', True,  False, False, False, True,  False),
    ('Consuelo',     'Ramirez',       'Female', 1990, 'Santa Lucia',      'Aquaculture', False, False, False, True,  True,  False),
    ('Pablo',        'Guerrero',      'Male',   1958, 'Dulao',            'Aquaculture', False, True,  False, False, False, False),
    ('Remedios',     'Castro',        'Female', 1977, 'Manga',            'Aquaculture', False, False, False, True,  False, False),
    ('Anselmo',      'Rivera',        'Male',   1985, 'Gallano',          'Aquaculture', False, False, False, True,  True,  False),
    ('Dolores',      'Aquino',        'Female', 1968, 'Macabato',         'Aquaculture', False, False, False, False, True,  False),
    ('Rogelio',      'Domingo',       'Male',   1962, 'San Juan East',    'Capture',     False, False, False, True,  True,  True),
    ('Estrella',     'Manalo',        'Female', 1975, 'San Juan West',    'Capture',     False, False, True,  True,  False, True),
    ('Isagani',      'Cortez',        'Male',   1980, 'Samara',           'Capture',     False, False, False, False, True,  True),
    ('Purificacion', 'Del Rosario',   'Female', 1955, 'Alaska',           'Capture',     False, False, False, True,  True,  True),
    ('Wilfredo',     'Marasigan',     'Male',   1992, 'San Benito Sur',   'Capture',     False, False, False, True,  False, False),
    ('Corazon',      'Espino',        'Female', 1972, 'San Benito Norte', 'Inland',      False, False, False, True,  True,  False),
    ('Danilo',       'Mercado',       'Male',   1988, 'San Eugenio',      'Inland',      False, False, False, False, False, False),
]

# ff_idx refers to a 0-based position into FISHERFOLK_DATA / the created fisherfolk list.
STOCKING_PLAN = [
    # ── Repeat-cycle group A: Marcelo + Tilapia + Pond (3 sequential cycles) ──
    dict(key='a1', ff_idx=0, species='Tilapia', culture_type='Cage', fingerlings=5000, days_ago=400,
         completion=1.0, harvest=dict(pattern='single', actual_kg=1120, harvest_offset_days=5)),
    dict(key='a2', ff_idx=0, species='Tilapia', culture_type='Cage', fingerlings=5000, days_ago=250,
         completion=0.35, harvest=dict(pattern='multi', partials=[400, 420], harvest_offset_days=8,
                                        reason='Delayed second batch due to feed shortage.')),
    dict(key='a3', ff_idx=0, species='Tilapia', culture_type='Cage', fingerlings=5000, days_ago=140,
         completion=0.9, harvest=dict(pattern='single', actual_kg=1030, harvest_offset_days=2)),

    # ── Repeat-cycle group B: Herminia + Bangus + Pen (3 sequential cycles) ──
    dict(key='b1', ff_idx=1, species='Bangus', culture_type='Pen', fingerlings=4000, days_ago=430,
         completion=1.0, harvest=dict(pattern='single', actual_kg=1297, harvest_offset_days=3)),
    dict(key='b2', ff_idx=1, species='Bangus', culture_type='Pen', fingerlings=4000, days_ago=270,
         completion=0.35, harvest=dict(pattern='multi', partials=[300, 300, 328], harvest_offset_days=10,
                                        reason='Harvest staggered — fish kill scare prompted early partial pull.')),
    dict(key='b3', ff_idx=1, species='Bangus', culture_type='Pen', fingerlings=4000, days_ago=165,
         completion=0.9, harvest=dict(pattern='single', actual_kg=1130, harvest_offset_days=-3)),

    # ── Repeat-cycle group C: Teodoro + Hito + Pond (3 sequential cycles) ──
    dict(key='c1', ff_idx=2, species='Hito', culture_type='Pond', fingerlings=6000, days_ago=300,
         completion=1.0, harvest=dict(pattern='single', actual_kg=1552, harvest_offset_days=4)),
    dict(key='c2', ff_idx=2, species='Hito', culture_type='Pond', fingerlings=6000, days_ago=190,
         completion=0.35, harvest=dict(pattern='multi', partials=[600, 615], harvest_offset_days=6,
                                        reason='Partial harvest split across two pond compartments.')),
    dict(key='c3', ff_idx=2, species='Hito', culture_type='Pond', fingerlings=6000, days_ago=95,
         completion=0.9, harvest=dict(pattern='single', actual_kg=1377, harvest_offset_days=1)),

    # ── Consuelo: Dalag, Pond — three states (Stocked/Near Harvest/Harvested) ──
    dict(key='consuelo_harvested', ff_idx=3, species='Dalag', culture_type='Pond', fingerlings=4500, days_ago=200,
         completion=0.85, harvest=dict(pattern='single', actual_kg=1336, harvest_offset_days=6)),
    dict(key='consuelo_nh', ff_idx=3, species='Dalag', culture_type='Pond', fingerlings=4000, days_ago=143,
         completion=0.5, harvest=None),
    dict(key='consuelo_stocked', ff_idx=3, species='Dalag', culture_type='Pond', fingerlings=4200, days_ago=60,
         completion=0.45, harvest=None),

    # ── Pablo: Shrimp, Pond — Near Harvest + Harvested (multi-partial, negative variance) ──
    dict(key='pablo_nh', ff_idx=4, species='Shrimp', culture_type='Pond', fingerlings=9000, days_ago=115,
         completion=0.55, harvest=None),
    dict(key='pablo_harvested', ff_idx=4, species='Shrimp', culture_type='Pond', fingerlings=8000, days_ago=260,
         completion=0.4, harvest=dict(pattern='multi', partials=[60, 62.4], harvest_offset_days=9,
                                       reason='Shrimp harvested below target after a mid-cycle disease scare.')),

    # ── Remedios: Oyster, Cage — early Stocked + Total Loss (disaster-driven) ──
    dict(key='remedios_stocked', ff_idx=5, species='Oyster', culture_type='Cage', fingerlings=2000, days_ago=15,
         completion=0.2, harvest=None),
    dict(key='remedios_totalloss', ff_idx=5, species='Oyster', culture_type='Cage', fingerlings=2500, days_ago=90,
         completion=0.3, harvest=None),

    # ── Anselmo: Tilapia, Cage — Near Harvest (active/partial disaster) + Stocked ──
    dict(key='anselmo_nh', ff_idx=6, species='Tilapia', culture_type='Cage', fingerlings=3000, days_ago=118,
         completion=0.5, harvest=None),
    dict(key='anselmo_stocked', ff_idx=6, species='Tilapia', culture_type='Cage', fingerlings=3200, days_ago=30,
         completion=0.4, harvest=None),

    # ── Dolores: Bangus, Pond — Stocked (active/all-done disaster) + Harvested (resolved disaster) ──
    dict(key='dolores_stocked', ff_idx=7, species='Bangus', culture_type='Pond', fingerlings=3500, days_ago=45,
         completion=0.45, harvest=None),
    dict(key='dolores_harvested', ff_idx=7, species='Bangus', culture_type='Pond', fingerlings=3500, days_ago=220,
         completion=0.8, harvest=dict(pattern='single', actual_kg=1083, harvest_offset_days=4)),
]

# Attach a stocking-level FisheriesDisasterReport to a specific STOCKING_PLAN key.
DISASTER_PLAN = [
    dict(stocking_key='anselmo_nh', disaster_type='Disease Outbreak', days_ago=25,
         status='Active', rules_done='partial'),
    dict(stocking_key='dolores_stocked', disaster_type='Fish Kill', days_ago=15,
         status='Active', rules_done='all'),
    dict(stocking_key='dolores_harvested', disaster_type='Flood', days_ago=200,
         status='Resolved', resolved_days_ago=185, rules_done='all'),
    dict(stocking_key='remedios_totalloss', disaster_type='Predator Attack', days_ago=40,
         status='Resolved', resolved_days_ago=20, is_total_loss=True, rules_done='all'),
]

TRIP_GEAR = ['Gill Net', 'Hook and Line', 'Fish Trap (Bubo)', 'Cast Net', 'Bottom Set Longline']
TRIP_GROUNDS = ['San Fernando Bay', 'Aringay River Mouth', 'Coastal Waters off San Juan', 'Bauang Channel']
CATCH_SPECIES = ['Galunggong (Round Scad)', 'Tulingan (Skipjack Tuna)', 'Bangus (Milkfish)',
                  'Alumahan (Mackerel)', 'Hipon (Shrimp)', 'Bisugo (Threadfin Bream)']

ASSISTANCE_TYPES = ['Fishing Gear', 'Boat/Vessel', 'Fingerlings/Seeds', 'Feed',
                     'Equipment', 'Cash Assistance', 'Training', 'Other']
ASSISTANCE_SOURCES = ['BFAR Region I', 'DA-RFO I', 'LGU Aringay', 'PCIC', 'Provincial Agriculture Office']

FF_DISASTER_TYPES = ['Typhoon', 'Flooding', 'Storm Surge', 'El Nino Drought', 'Red Tide', 'Disease Outbreak']


def _season_for(d):
    return 'Wet' if d.month in (6, 7, 8, 9, 10, 11) else 'Dry'


class Command(BaseCommand):
    help = 'Seed the database with fisheries demo data for showcasing.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--flush',
            action='store_true',
            help='Delete all previously-created fisheries demo data before seeding.',
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

        species_map = self._load_species()
        if species_map is None:
            return

        fisherfolk = self._create_fisherfolk()
        aquaculture_ff = [fisherfolk[i] for i in range(0, 8)]
        capture_ff = [fisherfolk[i] for i in range(8, 13)]
        capture_and_inland_ff = [fisherfolk[i] for i in range(8, 15)]

        stocking_by_key, stocking_created = self._create_stocking_domain(
            aquaculture_ff, species_map, admin_user,
        )
        disaster_count = self._create_stocking_disasters(stocking_by_key, admin_user) if stocking_created else \
            FisheriesDisasterReport.objects.filter(stocking_record__fisherfolk__in=aquaculture_ff).count()

        trips_created, entries_created = self._create_capture_data(capture_and_inland_ff, admin_user)
        vessels_created = self._create_vessel_inspections(capture_ff, admin_user)
        assistance_created = self._create_assistance(fisherfolk, admin_user)
        ff_disasters_created = self._create_fisherfolk_disasters(fisherfolk, admin_user)

        # ── Summary ──────────────────────────────────────────────────────────
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('================================================'))
        self.stdout.write(self.style.SUCCESS('  FISHERIES DEMO DATA SEEDER - SUMMARY'))
        self.stdout.write(self.style.SUCCESS('================================================'))
        self.stdout.write(f'  Fisherfolk          : {len(fisherfolk):>3}')
        all_stocking = StockingRecord.objects.filter(fisherfolk__in=aquaculture_ff)
        self.stdout.write(f'  Stocking records     : {all_stocking.count():>3}')
        status_counts = {}
        for s in all_stocking.values_list('status', flat=True):
            status_counts[s] = status_counts.get(s, 0) + 1
        for st, cnt in sorted(status_counts.items()):
            self.stdout.write(f'    {st:<12}: {cnt:>3}')
        self.stdout.write(f'  Activity logs        : {FisheriesActivityLog.objects.filter(stocking_record__fisherfolk__in=aquaculture_ff).count():>3}')
        self.stdout.write(f'  Harvest records       : {FisheriesHarvestRecord.objects.filter(stocking_record__fisherfolk__in=aquaculture_ff).count():>3}')
        self.stdout.write(f'  Stocking disasters    : {disaster_count:>3}')
        self.stdout.write(f'  Fishing trips         : {FishingTripLog.objects.filter(fisherfolk__in=capture_and_inland_ff).count():>3}')
        self.stdout.write(f'  Trip species entries  : {TripSpeciesEntry.objects.filter(fishing_trip__fisherfolk__in=capture_and_inland_ff).count():>3}')
        self.stdout.write(f'  Vessel inspections    : {VesselInspection.objects.filter(fisherfolk__in=capture_ff).count():>3}')
        self.stdout.write(f'  Assistance records    : {FisheriesAssistanceRecord.objects.filter(fisherfolk__in=fisherfolk).count():>3}')
        self.stdout.write(f'  Fisherfolk disasters  : {FisherfolkDisasterReport.objects.filter(fisherfolk__in=fisherfolk).count():>3}')
        self.stdout.write(self.style.SUCCESS('================================================'))
        self.stdout.write(self.style.SUCCESS('  Done! Run --flush to reset.'))
        self.stdout.write('')

    # ── Flush ────────────────────────────────────────────────────────────────

    def _flush(self):
        demo_ff_ids = list(Fisherfolk.objects.filter(
            lgu_registration_number__startswith=f'{DEMO_LGU_YEAR}-'
        ).values_list('id', flat=True))

        # StockingRecord.fisherfolk is SET_NULL, not CASCADE — delete explicitly
        # first so demo stocking records don't get orphaned onto real data.
        stocking_deleted, _ = StockingRecord.objects.filter(fisherfolk_id__in=demo_ff_ids).delete()

        # FishingTripLog / VesselInspection / FisheriesAssistanceRecord /
        # FisherfolkDisasterReport are all CASCADE on fisherfolk — deleting
        # the fisherfolk cleans those up automatically.
        ff_deleted, _ = Fisherfolk.objects.filter(id__in=demo_ff_ids).delete()

        self.stdout.write(self.style.WARNING(
            f'Flushed: {ff_deleted} demo fisherfolk (cascades included), '
            f'{stocking_deleted} demo stocking-domain rows deleted explicitly.'
        ))

    # ── Species lookup (do not create — read-only per Batch 6 instructions) ──

    def _load_species(self):
        names = ['Tilapia', 'Bangus', 'Hito', 'Dalag', 'Shrimp', 'Oyster']
        species_map = {}
        missing = []
        for name in names:
            try:
                species_map[name] = SpeciesOption.objects.get(species_name=name)
            except SpeciesOption.DoesNotExist:
                missing.append(name)
        if missing:
            self.stderr.write(self.style.ERROR(
                f'Missing SpeciesOption rows: {", ".join(missing)}. '
                'Seed species reference data before running this command.'
            ))
            return None
        return species_map

    # ── Fisherfolk ───────────────────────────────────────────────────────────

    def _create_fisherfolk(self):
        created = []
        for idx, (first, last, gender, birth_year, barangay, ftype, pwd, icc, fourps,
                   has_fishr, has_rsbsa, has_boatr) in enumerate(FISHERFOLK_DATA):
            lgu_reg = f'{DEMO_LGU_YEAR}-03302-{idx + 1:04d}'
            birth_month = (idx % 12) + 1
            birth_day = min((idx % 28) + 1, 28)
            birthdate = date(birth_year, birth_month, birth_day)

            defaults = {
                'first_name': first,
                'last_name': last,
                'gender': gender,
                'birthdate': birthdate,
                'barangay': barangay,
                'municipality': 'Aringay',
                'civil_status': 'Married',
                'fisherfolk_type': ftype,
                'is_pwd': pwd,
                'is_icc_ip_member': icc,
                'is_4ps_beneficiary': fourps,
                'is_active': True,
                'is_aquaculture': ftype == 'Aquaculture',
                'is_capture_fishery': ftype == 'Capture',
                'is_inland_fishery': ftype == 'Inland',
                'fishr_number': f'01-33-02-{DEMO_LGU_YEAR}-{idx + 1:04d}' if has_fishr else None,
                'rsbsa_number': f'01-33-02-999-{idx + 1:06d}' if has_rsbsa else None,
                'boatr_number': f'DEMO-BOATR-{idx + 1:04d}' if has_boatr else '',
                'contact_number': f'0917{idx + 1:07d}',
            }
            ff, was_created = Fisherfolk.objects.get_or_create(
                lgu_registration_number=lgu_reg,
                defaults=defaults,
            )
            created.append(ff)
            if was_created:
                self.stdout.write(f'  Created fisherfolk: {ff.full_name} ({ftype})')
            else:
                self.stdout.write(f'  Exists (skip):      {ff.full_name} ({ftype})')
        return created

    # ── Stocking domain (stocking + activity logs + harvests) ────────────────

    def _create_stocking_domain(self, aquaculture_ff, species_map, admin_user):
        if StockingRecord.objects.filter(fisherfolk__in=aquaculture_ff).exists():
            self.stdout.write('  Stocking domain already seeded — skipping (use --flush to reset).')
            return {}, False

        today = date.today()
        stocking_by_key = {}

        for spec in STOCKING_PLAN:
            ff = aquaculture_ff[spec['ff_idx']]
            species = species_map[spec['species']]
            date_stocked = today - timedelta(days=spec['days_ago'])
            area = Decimal(str(round(random.uniform(0.3, 2.0), 4)))

            rec = StockingRecord(
                fisherfolk=ff,
                pond_location_barangay=ff.barangay,
                land_status=random.choice(['Owner', 'Lessee', 'Tenant']),
                culture_type=spec['culture_type'],
                species=species,
                date_stocked=date_stocked,
                area_hectares=area,
                number_of_fingerlings=spec['fingerlings'],
                water_source=random.choice(['River', 'Deep Well', 'Rain-fed']),
                number_of_units=random.randint(1, 4),
                unit_dimensions='10m x 10m x 2m',
                fingerling_source=random.choice(['BFAR', 'Private Hatchery', 'Own Production']),
                avg_fingerling_size='2-3 cm',
                season=_season_for(date_stocked),
                year=date_stocked.year,
                notes=SEED_TAG,
                recorded_by=admin_user,
            )
            rec.save()
            stocking_by_key[spec['key']] = rec

            self._seed_activity_logs(rec, admin_user, spec['completion'], harvested=bool(spec['harvest']))
            if spec['harvest']:
                self._seed_harvests(rec, spec['harvest'], admin_user)

        self.stdout.write(f'  Created {len(stocking_by_key)} stocking records.')
        return stocking_by_key, True

    def _seed_activity_logs(self, rec, admin_user, completion_fraction, harvested):
        stages = list(SpeciesActivityStage.objects.filter(species_option_id=rec.species_id).order_by('day_after_stocking'))
        occurrences = []
        for stage in stages:
            days_list = stage.application_days or [stage.day_after_stocking]
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
            if i not in always_idx and (rec.date_stocked + timedelta(days=day)) <= today
        ]
        n_middle_done = round(len(due_middle_idx) * completion_fraction)
        done_middle = set(random.sample(due_middle_idx, n_middle_done)) if due_middle_idx else set()

        count = 0
        for i, (day, stage) in enumerate(occurrences):
            due_date = rec.date_stocked + timedelta(days=day)
            if due_date > today:
                continue
            if i not in always_idx and i not in done_middle:
                continue

            log_date = due_date + timedelta(days=random.choice([-1, 0, 0, 1]))
            if log_date > today:
                log_date = today
            if log_date < rec.date_stocked:
                log_date = rec.date_stocked
            window = stage.window_days
            is_late = (log_date - due_date).days > window

            FisheriesActivityLog.objects.create(
                stocking_record=rec,
                activity=stage.activity_name,
                date_of_activity=log_date,
                water_fish_condition=random.choice(['Good', 'Good', 'Fair']),
                feed_type='Commercial Pellets, 32% CP' if stage.activity_name == 'Feed Monitoring' else '',
                feed_quantity_kg=Decimal(str(round(random.uniform(5, 40), 2))) if stage.activity_name == 'Feed Monitoring' else None,
                recommendations=stage.recommendation,
                target_day=day,
                is_late=is_late,
                logged_by=admin_user,
            )
            count += 1
        return count

    def _seed_harvests(self, rec, harvest_spec, admin_user):
        today = date.today()
        expected = rec.expected_harvest_date
        offset = harvest_spec.get('harvest_offset_days', 0)
        final_date = expected + timedelta(days=offset)
        if final_date > today:
            final_date = today

        area_label = 'Whole pond' if rec.culture_type == 'Pond' else f'{rec.culture_type} unit'

        if harvest_spec['pattern'] == 'single':
            FisheriesHarvestRecord.objects.create(
                stocking_record=rec,
                harvest_date=final_date,
                quantity_kg=Decimal(str(harvest_spec['actual_kg'])),
                avg_body_weight_kg=rec.avg_body_weight_kg,
                area_or_units_harvested=area_label,
                is_final=True,
                early_late_reason=harvest_spec.get('reason', ''),
                notes=SEED_TAG,
                recorded_by=admin_user,
            )
        else:
            partials = harvest_spec['partials']
            n = len(partials)
            for i, qty in enumerate(partials):
                is_last = (i == n - 1)
                if is_last:
                    hd = final_date
                else:
                    hd = final_date - timedelta(days=(n - i) * 10)
                    if hd < rec.date_stocked:
                        hd = rec.date_stocked + timedelta(days=1)
                FisheriesHarvestRecord.objects.create(
                    stocking_record=rec,
                    harvest_date=hd,
                    quantity_kg=Decimal(str(qty)),
                    avg_body_weight_kg=rec.avg_body_weight_kg,
                    area_or_units_harvested=f'Partial batch {i + 1}',
                    is_final=is_last,
                    early_late_reason=harvest_spec.get('reason', '') if is_last else '',
                    notes=SEED_TAG,
                    recorded_by=admin_user,
                )

    # ── Stocking-level disasters ───────────────────────────────────────────

    def _create_stocking_disasters(self, stocking_by_key, admin_user):
        count = 0
        for spec in DISASTER_PLAN:
            rec = stocking_by_key.get(spec['stocking_key'])
            if rec is None:
                continue
            today = date.today()
            occurrence_date = today - timedelta(days=spec['days_ago'])
            disaster = FisheriesDisasterReport.objects.create(
                stocking_record=rec,
                disaster_type=spec['disaster_type'],
                date_of_occurrence=occurrence_date,
                area_affected_ha=((rec.area_hectares or Decimal('0.5')) * Decimal('0.6')).quantize(Decimal('0.0001')),
                estimated_damage='Noticeable stock stress and mortality observed following the event.',
                production_loss='Estimated partial production loss; under monitoring.',
                is_total_loss=spec.get('is_total_loss', False),
                status=spec['status'],
                resolved_date=(today - timedelta(days=spec.get('resolved_days_ago', 0))) if spec['status'] == 'Resolved' else None,
                resolved_by=admin_user if spec['status'] == 'Resolved' else None,
                reported_by=admin_user,
            )
            count += 1

            rules_done = spec.get('rules_done')
            if rules_done:
                rules = list(FisheriesDisasterResponseRule.objects.filter(
                    disaster_type=spec['disaster_type'],
                ).filter(Q(species=rec.species) | Q(species__isnull=True)))
                to_mark = rules if rules_done == 'all' else rules[:max(1, len(rules) // 2)]
                for rule in to_mark:
                    log_date = occurrence_date + timedelta(days=random.randint(1, 3))
                    if log_date > today:
                        log_date = today
                    FisheriesActivityLog.objects.create(
                        stocking_record=rec,
                        activity=rule.activity_name,
                        date_of_activity=log_date,
                        recommendations=f'Response to {spec["disaster_type"]}: {rule.title}. {SEED_TAG}',
                        disaster_report=disaster,
                        disaster_rule=rule,
                        logged_by=admin_user,
                    )
        self.stdout.write(f'  Created {count} stocking-level disaster reports.')
        return count

    # ── Capture & Vessels ────────────────────────────────────────────────────

    def _create_capture_data(self, capture_and_inland_ff, admin_user):
        if FishingTripLog.objects.filter(fisherfolk__in=capture_and_inland_ff).exists():
            self.stdout.write('  Fishing trips already seeded — skipping (use --flush to reset).')
            return 0, 0

        today = date.today()
        trips_created = 0
        entries_created = 0

        # 6 trips spread across the 5 Capture + 2 Inland fisherfolk
        trip_specs = [
            dict(ff_idx=8, days_ago=5, n_species=2),
            dict(ff_idx=9, days_ago=12, n_species=1),
            dict(ff_idx=10, days_ago=20, n_species=3),
            dict(ff_idx=11, days_ago=8, n_species=2),
            dict(ff_idx=12, days_ago=30, n_species=1),
            dict(ff_idx=13, days_ago=15, n_species=2),
        ]
        for i, spec in enumerate(trip_specs):
            ff = capture_and_inland_ff[spec['ff_idx'] - 8]
            trip_date = today - timedelta(days=spec['days_ago'])
            return_date = trip_date  # day trip
            trip = FishingTripLog.objects.create(
                fisherfolk=ff,
                trip_date=trip_date,
                return_date=return_date,
                fishing_ground=TRIP_GROUNDS[i % len(TRIP_GROUNDS)],
                gear_used=TRIP_GEAR[i % len(TRIP_GEAR)],
                hours_at_sea=Decimal(str(round(random.uniform(4, 10), 2))),
                fuel_consumption_liters=Decimal(str(round(random.uniform(5, 25), 2))),
                remarks=SEED_TAG,
                recorded_by=admin_user,
            )
            trips_created += 1
            species_choices = random.sample(CATCH_SPECIES, spec['n_species'])
            for sp_name in species_choices:
                TripSpeciesEntry.objects.create(
                    fishing_trip=trip,
                    species_name=sp_name,
                    volume_kg=Decimal(str(round(random.uniform(8, 60), 2))),
                    notes='',
                )
                entries_created += 1

        self.stdout.write(f'  Created {trips_created} fishing trips, {entries_created} species entries.')
        return trips_created, entries_created

    def _create_vessel_inspections(self, capture_ff, admin_user):
        if VesselInspection.objects.filter(fisherfolk__in=capture_ff).exists():
            self.stdout.write('  Vessel inspections already seeded — skipping (use --flush to reset).')
            return 0

        today = date.today()
        specs = [
            dict(ff_idx=0, inspected_days_ago=60, expiry_days_from_now=20, condition='Good'),
            dict(ff_idx=1, inspected_days_ago=90, expiry_days_from_now=200, condition='Fair'),
            dict(ff_idx=2, inspected_days_ago=30, expiry_days_from_now=-15, condition='For Repair'),
            dict(ff_idx=3, inspected_days_ago=120, expiry_days_from_now=10, condition='Good'),
        ]
        count = 0
        for i, spec in enumerate(specs):
            ff = capture_ff[spec['ff_idx']]
            VesselInspection.objects.create(
                fisherfolk=ff,
                inspection_date=today - timedelta(days=spec['inspected_days_ago']),
                license_number=f'BFAR-LIC-{2020 + i}-{ff.id:04d}',
                license_expiry_date=today + timedelta(days=spec['expiry_days_from_now']),
                vessel_condition=spec['condition'],
                remarks=SEED_TAG,
                inspected_by=admin_user,
            )
            count += 1
        self.stdout.write(f'  Created {count} vessel inspections.')
        return count

    # ── Assistance ───────────────────────────────────────────────────────────

    def _create_assistance(self, fisherfolk, admin_user):
        if FisheriesAssistanceRecord.objects.filter(fisherfolk__in=fisherfolk).exists():
            self.stdout.write('  Assistance records already seeded — skipping (use --flush to reset).')
            return 0

        today = date.today()
        specs = [
            dict(ff_idx=0, atype='Fingerlings/Seeds', days_ago=200),
            dict(ff_idx=2, atype='Feed', days_ago=150),
            dict(ff_idx=5, atype='Boat/Vessel', days_ago=400),
            dict(ff_idx=9, atype='Fishing Gear', days_ago=60),
            dict(ff_idx=11, atype='Cash Assistance', days_ago=90),
            dict(ff_idx=13, atype='Training', days_ago=30),
        ]
        count = 0
        for i, spec in enumerate(specs):
            ff = fisherfolk[spec['ff_idx']]
            date_received = today - timedelta(days=spec['days_ago'])
            FisheriesAssistanceRecord.objects.create(
                fisherfolk=ff,
                assistance_type=spec['atype'],
                description=f'{spec["atype"]} support provided under the LGU fisheries assistance program.',
                quantity=random.choice(['1 set', '2 sacks', '50 kg', '1 unit']),
                date_received=date_received,
                source_agency=ASSISTANCE_SOURCES[i % len(ASSISTANCE_SOURCES)],
                season=_season_for(date_received),
                year=date_received.year,
                remarks=SEED_TAG,
                recorded_by=admin_user,
            )
            count += 1
        self.stdout.write(f'  Created {count} assistance records.')
        return count

    # ── Fisherfolk-level disasters (monitoring app) ────────────────────────

    def _create_fisherfolk_disasters(self, fisherfolk, admin_user):
        if FisherfolkDisasterReport.objects.filter(fisherfolk__in=fisherfolk).exists():
            self.stdout.write('  Fisherfolk disaster reports already seeded — skipping (use --flush to reset).')
            return 0

        today = date.today()
        specs = [
            dict(ff_idx=1, dtype='Typhoon', status='Reported', days_ago=10),
            dict(ff_idx=6, dtype='Storm Surge', status='Verified', days_ago=45),
            dict(ff_idx=9, dtype='Flooding', status='Closed', days_ago=180),
            dict(ff_idx=12, dtype='Red Tide', status='Verified', days_ago=70),
        ]
        count = 0
        for spec in specs:
            ff = fisherfolk[spec['ff_idx']]
            FisherfolkDisasterReport.objects.create(
                fisherfolk=ff,
                report_date=today - timedelta(days=spec['days_ago']),
                disaster_type=spec['dtype'],
                affected_barangay=ff.barangay,
                description=f'{spec["dtype"]} affected {ff.full_name}\'s fishing operations in {ff.barangay}.',
                estimated_loss_php=Decimal(str(random.randint(5000, 60000))),
                volume_lost_kg=Decimal(str(random.randint(20, 500))),
                status=spec['status'],
                recorded_by=admin_user,
            )
            count += 1
        self.stdout.write(f'  Created {count} fisherfolk-level disaster reports.')
        return count
