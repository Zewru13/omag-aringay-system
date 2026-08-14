"""
Management command: python manage.py seed_fisheries_demo_data [--flush]

Creates a small, defense-friendly demo dataset for the fisheries domain
(mirrors production/management/commands/seed_demo_data.py's conventions).

Stocking records — 15 total (Batch E reduction), composed deliberately:
  - 5 "Stocked" / under-monitoring (mid-cycle, realistic done/overdue/
    upcoming activity-log mix so the suggestion engine looks real)
  - 5 "Harvested" (harvest records producing a MIX of above/below-estimate
    variance — driven by an explicit variance_factor per record)
  - 3 with a stocking-level disaster: 2 genuinely ACTIVE (not yet recovered)
    and 1 marked TOTAL LOSS (Batch F fix — the original Batch E plan had
    0 Total Loss records, leaving nothing to demonstrate that status)
  - 2 with a RECOVERED stocking-level disaster (Batch D terminology)

Plus, kept intentionally sparse so those tabs aren't empty:
  - 15 demo fisherfolk (marker: lgu_registration_number starting '2099-')
  - Capture: a few FishingTripLog + TripSpeciesEntry (at least one
    multi-species trip)
  - Assistance records
  - Fisherfolk-level disaster reports (no stocking cycle involved)

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

from interventions.models import FisherfolkBeneficiaryRecord
from fisheries.models import (
    Fisherfolk,
    FisheriesActivityLog,
    FisheriesDisasterReport,
    FisheriesDisasterResponseRule,
    FisheriesHarvestRecord,
    FishingTripLog,
    SpeciesActivityStage,
    SpeciesOption,
    StockingRecord,
    TripSpeciesEntry,
)

User = get_user_model()

DEMO_LGU_YEAR = '2099'  # unmistakably-fake registration year used as the demo marker
SEED_TAG = 'Seeded by seed_fisheries_demo_data command.'

# first, last, gender, birth_year, barangay, fisherfolk_type, pwd, icc, fourps, has_fishr, has_rsbsa
FISHERFOLK_DATA = [
    ('Marcelo',      'Bautista',      'Male',   1970, 'San Juan West',    'Aquaculture', False, False, False, True,  True),
    ('Herminia',     'Salvador',      'Female', 1983, 'San Juan East',    'Aquaculture', False, False, True,  True,  False),
    ('Teodoro',      'Villegas',      'Male',   1965, 'Poblacion',        'Aquaculture', True,  False, False, False, True),
    ('Consuelo',     'Ramirez',       'Female', 1990, 'Santa Lucia',      'Aquaculture', False, False, False, True,  True),
    ('Pablo',        'Guerrero',      'Male',   1958, 'Dulao',            'Aquaculture', False, True,  False, False, False),
    ('Remedios',     'Castro',        'Female', 1977, 'Manga',            'Aquaculture', False, False, False, True,  False),
    ('Anselmo',      'Rivera',        'Male',   1985, 'Gallano',          'Aquaculture', False, False, False, True,  True),
    ('Dolores',      'Aquino',        'Female', 1968, 'Macabato',         'Aquaculture', False, False, False, False, True),
    ('Rogelio',      'Domingo',       'Male',   1962, 'San Juan East',    'Capture',     False, False, False, True,  True),
    ('Estrella',     'Manalo',        'Female', 1975, 'San Juan West',    'Capture',     False, False, True,  True,  False),
    ('Isagani',      'Cortez',        'Male',   1980, 'Samara',           'Capture',     False, False, False, False, True),
    ('Purificacion', 'Del Rosario',   'Female', 1955, 'Alaska',           'Capture',     False, False, False, True,  True),
    ('Wilfredo',     'Marasigan',     'Male',   1992, 'San Benito Sur',   'Capture',     False, False, False, True,  False),
    ('Corazon',      'Espino',        'Female', 1972, 'San Benito Norte', 'Inland',      False, False, False, True,  True),
    ('Danilo',       'Mercado',       'Male',   1988, 'San Eugenio',      'Inland',      False, False, False, False, False),
]

# ff_idx refers to a 0-based position into FISHERFOLK_DATA / the created fisherfolk list.
#
# 15 records total (Batch E). Harvested records carry a `variance_factor` —
# actual harvest = estimated_harvest_kg * factor — so above/below-estimate
# outcomes are guaranteed regardless of species survival/weight defaults.
# `days_ago` on the mid-cycle records is kept well short of each species'
# culture duration so they stay "Stocked" (not auto-flipped to Near Harvest).
STOCKING_PLAN = [
    # ── 5 STOCKED / under monitoring (mid-cycle, no disaster) ──
    dict(key='stk1', ff_idx=0, species='Tilapia', culture_type='Cage', fingerlings=5000, days_ago=55,
         completion=0.5, harvest=None),
    dict(key='stk2', ff_idx=1, species='Bangus', culture_type='Pen', fingerlings=4000, days_ago=45,
         completion=0.4, harvest=None),
    dict(key='stk3', ff_idx=2, species='Hito', culture_type='Pond', fingerlings=6000, days_ago=60,
         completion=0.6, harvest=None),
    dict(key='stk4', ff_idx=3, species='Dalag', culture_type='Pond', fingerlings=4500, days_ago=50,
         completion=0.5, harvest=None),
    dict(key='stk5', ff_idx=6, species='Tilapia', culture_type='Cage', fingerlings=3200, days_ago=35,
         completion=0.45, harvest=None),

    # ── 5 HARVESTED (mixed variance — 3 above estimate, 2 below) ──
    dict(key='hrv1', ff_idx=0, species='Tilapia', culture_type='Cage', fingerlings=5000, days_ago=200,
         completion=1.0, harvest=dict(pattern='single', variance_factor=1.15, harvest_offset_days=5)),
    dict(key='hrv2', ff_idx=1, species='Bangus', culture_type='Pen', fingerlings=4000, days_ago=220,
         completion=0.9, harvest=dict(pattern='single', variance_factor=0.82, harvest_offset_days=-3,
                                       reason='Harvested below estimate after slow late-cycle growth.')),
    dict(key='hrv3', ff_idx=2, species='Hito', culture_type='Pond', fingerlings=6000, days_ago=180,
         completion=1.0, harvest=dict(pattern='single', variance_factor=1.08, harvest_offset_days=2)),
    dict(key='hrv4', ff_idx=4, species='Shrimp', culture_type='Pond', fingerlings=8000, days_ago=160,
         completion=0.9, harvest=dict(pattern='multi', n_partials=2, variance_factor=0.78, harvest_offset_days=9,
                                       reason='Shrimp harvested below target after a mid-cycle disease scare.')),
    dict(key='hrv5', ff_idx=7, species='Bangus', culture_type='Pond', fingerlings=3500, days_ago=210,
         completion=0.9, harvest=dict(pattern='single', variance_factor=1.06, harvest_offset_days=4)),

    # ── 3 with a stocking-level disaster: dis_active1/2 stay genuinely ──
    # ── active (base status stays Stocked/Near Harvest); dis_active3 is    ──
    # ── flipped to TOTAL LOSS via DISASTER_PLAN's is_total_loss (Batch F). ──
    dict(key='dis_active1', ff_idx=5, species='Oyster', culture_type='Cage', fingerlings=2500, days_ago=90,
         completion=0.3, harvest=None),
    dict(key='dis_active2', ff_idx=6, species='Tilapia', culture_type='Cage', fingerlings=3000, days_ago=110,
         completion=0.5, harvest=None),
    dict(key='dis_active3', ff_idx=7, species='Bangus', culture_type='Pond', fingerlings=3500, days_ago=45,
         completion=0.45, harvest=None),

    # ── 2 with a RECOVERED stocking-level disaster ──
    dict(key='dis_recovered1', ff_idx=3, species='Dalag', culture_type='Pond', fingerlings=4000, days_ago=140,
         completion=0.5, harvest=None),
    dict(key='dis_recovered2', ff_idx=4, species='Shrimp', culture_type='Pond', fingerlings=9000, days_ago=115,
         completion=0.55, harvest=None),
]

# Attach a stocking-level FisheriesDisasterReport to a specific STOCKING_PLAN key.
# 2 genuinely Active + 1 TOTAL LOSS + 2 Recovered (Batch D terminology; Batch F
# fix — the original Batch E plan had 3 Active/0 Total Loss, leaving no Total
# Loss stocking record to demonstrate). is_total_loss=True on dis_active3 is
# what flips the parent stocking record's status to 'Total Loss'
# (FisheriesDisasterReport.save() override) — not set directly on STOCKING_PLAN.
DISASTER_PLAN = [
    dict(stocking_key='dis_active1', disaster_type='Predator Attack', days_ago=40,
         status='Active', rules_done='partial'),
    dict(stocking_key='dis_active2', disaster_type='Disease Outbreak', days_ago=25,
         status='Active', rules_done='partial'),
    dict(stocking_key='dis_active3', disaster_type='Fish Kill', days_ago=15,
         status='Active', is_total_loss=True, rules_done='all'),
    dict(stocking_key='dis_recovered1', disaster_type='Flood', days_ago=130,
         status='Recovered', recovered_days_ago=115, rules_done='all'),
    dict(stocking_key='dis_recovered2', disaster_type='Typhoon', days_ago=100,
         status='Recovered', recovered_days_ago=85, rules_done='all'),
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
        capture_and_inland_ff = [fisherfolk[i] for i in range(8, 15)]

        stocking_by_key, stocking_created = self._create_stocking_domain(
            aquaculture_ff, species_map, admin_user,
        )
        disaster_count = self._create_stocking_disasters(stocking_by_key, admin_user) if stocking_created else \
            FisheriesDisasterReport.objects.filter(stocking_record__fisherfolk__in=aquaculture_ff).count()

        trips_created, entries_created = self._create_capture_data(capture_and_inland_ff, admin_user)
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
        self.stdout.write(f'  Assistance records    : {FisherfolkBeneficiaryRecord.objects.filter(program__isnull=True, fisherfolk__in=fisherfolk).count():>3}')
        self.stdout.write(f'  Fisherfolk disasters  : {FisheriesDisasterReport.objects.filter(fisherfolk__in=fisherfolk).count():>3}')
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

        # FishingTripLog / FisherfolkBeneficiaryRecord / FisheriesDisasterReport
        # (fisherfolk-direct rows) are all CASCADE on fisherfolk — deleting the
        # fisherfolk cleans those up automatically.
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
                   has_fishr, has_rsbsa) in enumerate(FISHERFOLK_DATA):
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

        # Actual harvest is derived from the record's own estimate so the
        # variance sign is deterministic: factor > 1 harvests above estimate,
        # < 1 below. Falls back to a rough estimate if the model couldn't
        # compute one (e.g. missing survival/weight defaults).
        base = rec.estimated_harvest_kg or (Decimal(str(rec.number_of_fingerlings)) * Decimal('0.2'))
        factor = Decimal(str(harvest_spec.get('variance_factor', 1.0)))
        actual_total = (base * factor).quantize(Decimal('0.01'))

        if harvest_spec['pattern'] == 'single':
            FisheriesHarvestRecord.objects.create(
                stocking_record=rec,
                harvest_date=final_date,
                quantity_kg=actual_total,
                avg_body_weight_kg=rec.avg_body_weight_kg,
                area_or_units_harvested=area_label,
                is_final=True,
                early_late_reason=harvest_spec.get('reason', ''),
                notes=SEED_TAG,
                recorded_by=admin_user,
            )
        else:
            n = harvest_spec.get('n_partials', 2)
            part = (actual_total / n).quantize(Decimal('0.01'))
            partials = [part] * (n - 1)
            partials.append((actual_total - part * (n - 1)).quantize(Decimal('0.01')))
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
                    quantity_kg=qty,
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
                recovered_date=(today - timedelta(days=spec.get('recovered_days_ago', 0))) if spec['status'] == 'Recovered' else None,
                recovered_by=admin_user if spec['status'] == 'Recovered' else None,
                recovery_note='Seeded recovery — response rules fully logged.' if spec['status'] == 'Recovered' else '',
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

    # ── Capture ──────────────────────────────────────────────────────────────

    def _create_capture_data(self, capture_and_inland_ff, admin_user):
        if FishingTripLog.objects.filter(fisherfolk__in=capture_and_inland_ff).exists():
            self.stdout.write('  Fishing trips already seeded — skipping (use --flush to reset).')
            return 0, 0

        today = date.today()
        trips_created = 0
        entries_created = 0

        # A few trips (kept sparse — Batch E). At least one multi-species trip
        # so the catch table's "+N more" species-breakdown affordance has data.
        trip_specs = [
            dict(ff_idx=10, days_ago=20, n_species=3),
            dict(ff_idx=8,  days_ago=5,  n_species=2),
            dict(ff_idx=13, days_ago=15, n_species=1),
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

    # ── Assistance ───────────────────────────────────────────────────────────

    def _create_assistance(self, fisherfolk, admin_user):
        # Batch 6: assistance records now live in interventions.FisherfolkBeneficiaryRecord
        # (program=null — this seed command was never program-aware, so ad-hoc is the
        # correct equivalent of the retired FisheriesAssistanceRecord it used to create).
        if FisherfolkBeneficiaryRecord.objects.filter(program__isnull=True, fisherfolk__in=fisherfolk).exists():
            self.stdout.write('  Assistance records already seeded — skipping (use --flush to reset).')
            return 0

        today = date.today()
        specs = [
            dict(ff_idx=0, atype='Fingerlings/Seeds', days_ago=200),
            dict(ff_idx=9, atype='Fishing Gear', days_ago=60),
            dict(ff_idx=11, atype='Cash Assistance', days_ago=90),
        ]
        count = 0
        for i, spec in enumerate(specs):
            ff = fisherfolk[spec['ff_idx']]
            date_received = today - timedelta(days=spec['days_ago'])
            FisherfolkBeneficiaryRecord.objects.create(
                program=None,
                fisherfolk=ff,
                assistance_type=spec['atype'],
                description=f'{spec["atype"]} support provided under the LGU fisheries assistance program.',
                quantity=random.choice(['1 set', '2 sacks', '50 kg', '1 unit']),
                date_given=date_received,
                source_agency=ASSISTANCE_SOURCES[i % len(ASSISTANCE_SOURCES)],
                season=_season_for(date_received),
                year=date_received.year,
                remarks=SEED_TAG,
                recorded_by=admin_user,
            )
            count += 1
        self.stdout.write(f'  Created {count} assistance records.')
        return count

    # ── Fisherfolk-level disasters (fisherfolk-direct, no stocking cycle) ───

    def _create_fisherfolk_disasters(self, fisherfolk, admin_user):
        if FisheriesDisasterReport.objects.filter(fisherfolk__in=fisherfolk).exists():
            self.stdout.write('  Fisherfolk disaster reports already seeded — skipping (use --flush to reset).')
            return 0

        today = date.today()
        # status here is 'Active'/'Recovered' (FisheriesDisasterReport's terms,
        # not the retired model's Reported/Verified/Closed).
        specs = [
            dict(ff_idx=1, dtype='Typhoon', status='Active', days_ago=10),
            dict(ff_idx=9, dtype='Flooding', status='Recovered', days_ago=180),
            dict(ff_idx=12, dtype='Red Tide', status='Active', days_ago=70),
        ]
        count = 0
        for spec in specs:
            ff = fisherfolk[spec['ff_idx']]
            is_recovered = spec['status'] == 'Recovered'
            FisheriesDisasterReport.objects.create(
                fisherfolk=ff,
                date_of_occurrence=today - timedelta(days=spec['days_ago']),
                disaster_type=spec['dtype'],
                estimated_damage=f'{spec["dtype"]} affected {ff.full_name}\'s fishing operations in {ff.barangay}.',
                volume_lost_kg=Decimal(str(random.randint(20, 500))),
                status=spec['status'],
                recovered_date=(today - timedelta(days=spec['days_ago'] - 5)) if is_recovered else None,
                recovered_by=admin_user if is_recovered else None,
                recovery_note='Resolved on its own — no equipment or intervention needed.' if is_recovered else '',
                reported_by=admin_user,
            )
            count += 1
        self.stdout.write(f'  Created {count} fisherfolk-level disaster reports.')
        return count
