"""Municipality-wide activity-status aggregation for the staff dashboard.

The reference dashboard shows OVERDUE / DUE TODAY / UPCOMING counts per domain
and per barangay. Both numbers already exist in the system, but only one record
at a time: CropActivitySuggestionsView and the fisheries equivalent compute them
inside a detail view. This module lifts that same rule to a whole queryset.

IMPORTANT: the classification below is copied from those two views deliberately,
not re-invented. If the rule ever changes there it must change here too, or the
dashboard will disagree with the record screens it links to. The rule is:

    days_diff = occurrence_day - days_elapsed
    done      -> a matching activity log exists
    overdue   -> days_diff < -window_days
    due_now   -> abs(days_diff) <= window_days
    upcoming  -> otherwise

"DUE TODAY" on the dashboard therefore means "inside the activity's window",
which is the system's own definition of due — not literally today's date. The
two differ by `window_days` and the label follows the reference's wording.

Models are resolved through the app registry rather than imported at module
level, so this module can be used from either app without an import cycle.
"""

from collections import defaultdict
from datetime import datetime, time, timedelta

from django.apps import apps
from django.utils import timezone

# Records that are finished or written off carry no outstanding activities.
_CLOSED = ('Harvested', 'Total Loss')


def _classify(occurrence_day, days_elapsed, window):
    days_diff = occurrence_day - days_elapsed
    if days_diff < -window:
        return 'overdue'
    if abs(days_diff) <= window:
        return 'due_now'
    return 'upcoming'


def _blank():
    return {'overdue': 0, 'due_today': 0, 'upcoming': 0}


def _tally(records, stages_by_key, logs_by_record, *, key_attr, start_attr,
           stage_day_attr, stage_name_attr, log_name_attr, barangay_attr):
    """Walk every open record once and bucket its outstanding activities.

    Returns (totals, by_barangay) where by_barangay maps barangay -> counts.
    """
    today = timezone.localdate()
    totals = _blank()
    by_barangay = defaultdict(_blank)

    for rec in records:
        started = getattr(rec, start_attr, None)
        if not started:
            continue
        days_elapsed = (today - started).days
        stages = stages_by_key.get(getattr(rec, key_attr), ())
        if not stages:
            continue

        logs = logs_by_record.get(rec.id, ())
        barangay = (getattr(rec, barangay_attr, '') or '').strip() or 'Unspecified'

        for stage in stages:
            days_list = stage.application_days or [getattr(stage, stage_day_attr)]
            window = stage.window_days
            stage_name = getattr(stage, stage_name_attr)

            for occurrence_day in days_list:
                if occurrence_day is None:
                    continue
                due_date = started + timedelta(days=occurrence_day)

                # Same done-matching as the detail views: an explicit target_day
                # hit, or any log of that activity inside the window.
                done = False
                for log_name, log_date, target_day in logs:
                    if log_name != stage_name:
                        continue
                    if target_day is not None and target_day == occurrence_day:
                        done = True
                        break
                    if log_date and abs((log_date - due_date).days) <= window:
                        done = True
                        break
                if done:
                    continue

                status = _classify(occurrence_day, days_elapsed, window)
                bucket = 'due_today' if status == 'due_now' else status
                totals[bucket] += 1
                by_barangay[barangay][bucket] += 1

    return totals, by_barangay


def crop_activity_status():
    """Outstanding crop activities across every open monitoring record."""
    Record = apps.get_model('production', 'CropMonitoringRecord')
    Stage = apps.get_model('production', 'CropActivityStage')
    Log = apps.get_model('production', 'CropActivityLog')

    records = list(
        Record.objects.exclude(status__in=_CLOSED)
        # An estimated date_planted (see the field's own comment) is not a
        # real event date — including these would generate overdue/due/
        # upcoming noise across the whole municipality dashboard based on
        # dates nobody has confirmed. Same exclusion as CropActivitySuggestionsView.
        .exclude(date_planted_is_estimated=True)
        .only('id', 'crop_type_id', 'date_planted', 'farm_location_barangay')
    )
    stages_by_key = defaultdict(list)
    for s in Stage.objects.all():
        stages_by_key[s.crop_type_id].append(s)

    logs_by_record = defaultdict(list)
    for rec_id, name, date, target in Log.objects.values_list(
        'monitoring_record_id', 'activity_type', 'date_of_activity', 'target_day'
    ):
        logs_by_record[rec_id].append((name, date, target))

    return _tally(
        records, stages_by_key, logs_by_record,
        key_attr='crop_type_id', start_attr='date_planted',
        stage_day_attr='day_after_planting', stage_name_attr='stage_name',
        log_name_attr='activity_type', barangay_attr='farm_location_barangay',
    )


def fisheries_activity_status():
    """Outstanding fisheries activities across every open stocking record."""
    Record = apps.get_model('fisheries', 'StockingRecord')
    Stage = apps.get_model('fisheries', 'SpeciesActivityStage')
    Log = apps.get_model('fisheries', 'FisheriesActivityLog')

    records = list(
        Record.objects.exclude(status__in=_CLOSED)
        # Same exclusion as crop_activity_status() above — an estimated
        # date_stocked is not a real event date. Same exclusion as
        # FisheriesActivitySuggestionsView.
        .exclude(date_stocked_is_estimated=True)
        .only('id', 'species_id', 'date_stocked', 'pond_location_barangay')
    )
    stages_by_key = defaultdict(list)
    for s in Stage.objects.all():
        stages_by_key[s.species_option_id].append(s)

    logs_by_record = defaultdict(list)
    for rec_id, name, date, target in Log.objects.values_list(
        'stocking_record_id', 'activity', 'date_of_activity', 'target_day'
    ):
        logs_by_record[rec_id].append((name, date, target))

    return _tally(
        records, stages_by_key, logs_by_record,
        key_attr='species_id', start_attr='date_stocked',
        stage_day_attr='day_after_stocking', stage_name_attr='activity_name',
        log_name_attr='activity', barangay_attr='pond_location_barangay',
    )


def barangay_rows(by_barangay):
    """Sorted per-barangay rows, busiest first, for the Activity Status table."""
    rows = [
        {'barangay': name, **counts}
        for name, counts in by_barangay.items()
    ]
    rows.sort(key=lambda r: (-r['overdue'], -r['due_today'], r['barangay']))
    return rows


def active_disaster_rows(limit=12):
    """Active disaster reports across BOTH domains, newest first.

    The reference draws one "Active Disaster Reports" panel carrying a CROP or
    FISH pill per row, so this merges the two models rather than making the
    frontend call two endpoints and interleave them itself.

    Crop disasters previously had no municipality-wide list at all — they were
    only reachable per monitoring record — which is why this exists.

    On affected counts: the mockup shows "8 farmers affected". A disaster report
    links to exactly ONE monitoring/stocking record, so the system does not model
    a multi-farmer disaster event. Rather than invent a grouping, each row
    reports the record's own owner and area affected, which is what is true.
    """
    Crop = apps.get_model('production', 'CropDisasterReport')
    Fish = apps.get_model('fisheries', 'FisheriesDisasterReport')
    rows = []

    for d in (
        Crop.objects.filter(status='Active')
        .select_related('monitoring_record', 'monitoring_record__farmer')
        .order_by('-date_of_occurrence')[:limit]
    ):
        rec = d.monitoring_record
        farmer = getattr(rec, 'farmer', None)
        rows.append({
            'id': d.id,
            'domain': 'crop',
            'record_id': getattr(rec, 'id', None),
            'disaster_type': d.disaster_type_other_specify or d.disaster_type,
            'date_of_occurrence': d.date_of_occurrence,
            'barangay': getattr(rec, 'farm_location_barangay', '') or '',
            'subject': getattr(farmer, 'full_name', '') or '',
            'area_affected_ha': d.area_affected_ha,
            'is_total_loss': d.is_total_loss,
        })

    for d in (
        Fish.objects.filter(status='Active')
        .select_related('stocking_record', 'stocking_record__fisherfolk', 'fisherfolk')
        .order_by('-date_of_occurrence')[:limit]
    ):
        # Consolidated batch: d.fisherfolk is the fallback subject/barangay
        # source for reports with no stocking_record (Capture-type
        # fisherfolk have no cycle to attach one to).
        rec = d.stocking_record
        person = getattr(rec, 'fisherfolk', None) or d.fisherfolk
        rows.append({
            'id': d.id,
            'domain': 'fisheries',
            'record_id': getattr(rec, 'id', None),
            'disaster_type': d.disaster_type_other_specify or d.disaster_type,
            'date_of_occurrence': d.date_of_occurrence,
            'barangay': getattr(rec, 'pond_location_barangay', '') or getattr(person, 'barangay', '') or '',
            'subject': getattr(person, 'full_name', '') or '',
            'area_affected_ha': d.area_affected_ha,
            'is_total_loss': d.is_total_loss,
        })

    rows.sort(key=lambda r: (r['date_of_occurrence'] or ''), reverse=True)
    return rows[:limit]


def not_received_count():
    """Open (unresolved) NOT_RECEIVED beneficiary records, per domain, for the
    dashboard's "Needs Attention" tier — same tier active disaster reports
    already surface on. RESOLVED cases are excluded on purpose: once staff
    has followed up, it is no longer something needing attention."""
    Beneficiary = apps.get_model('interventions', 'BeneficiaryRecord')
    FisherfolkBeneficiary = apps.get_model('interventions', 'FisherfolkBeneficiaryRecord')
    crop = Beneficiary.objects.filter(status='NOT_RECEIVED').count()
    fisheries = FisherfolkBeneficiary.objects.filter(status='NOT_RECEIVED').count()
    return {'crop': crop, 'fisheries': fisheries, 'total': crop + fisheries}


def sector_summary():
    """The two sector cards: registry totals plus this-month new registrations.

    The reference prints "+23 this month" under each headline figure. Both
    Farmer and Fisherfolk carry `date_registered`, so this is a real count, not
    a placeholder.
    """
    today = timezone.localdate()
    # date_registered is a DateTimeField, so the boundary has to be an aware
    # datetime — comparing it against a plain date makes Django warn and
    # compare against a naive midnight, which silently shifts by the UTC offset.
    month_start = timezone.make_aware(datetime.combine(today.replace(day=1), time.min))

    Farmer = apps.get_model('farmers', 'Farmer')
    Fisherfolk = apps.get_model('fisheries', 'Fisherfolk')
    FOrg = apps.get_model('associations', 'FarmersOrganization')
    FFOrg = apps.get_model('associations', 'FisherfolkOrganization')

    return {
        'crop': {
            'registered': Farmer.objects.count(),
            'new_this_month': Farmer.objects.filter(date_registered__gte=month_start).count(),
            'organizations': FOrg.objects.count(),
        },
        'fisheries': {
            'registered': Fisherfolk.objects.count(),
            'new_this_month': Fisherfolk.objects.filter(date_registered__gte=month_start).count(),
            'organizations': FFOrg.objects.count(),
        },
    }


def crop_yield_variance(limit=8):
    """Season Snapshot — estimated vs actual yield per crop.

    "Target" here is the record's own `estimated_yield_kg`, set when the crop was
    planted; the model already computes `yield_variance_kg`/`yield_variance_pct`
    on save. Nothing new is calculated — this only groups by crop type and
    converts to mt/ha so the figures read the way the reference draws them.

    Only harvested records with BOTH an estimate and an actual can appear: a
    variance against a missing estimate would be meaningless.
    """
    Record = apps.get_model('production', 'CropMonitoringRecord')
    rows_by_crop = defaultdict(lambda: {'est': 0.0, 'act': 0.0, 'area': 0.0, 'n': 0, 'season': '', 'year': None})

    qs = (
        Record.objects.filter(status='Harvested')
        .exclude(estimated_yield_kg__isnull=True)
        .exclude(actual_yield_kg__isnull=True)
        .select_related('crop_type')
        .order_by('-year')
    )
    for r in qs:
        name = getattr(r.crop_type, 'crop_name', None) or getattr(r.crop_type, 'name', None) or str(r.crop_type)
        b = rows_by_crop[name]
        b['est'] += float(r.estimated_yield_kg or 0)
        b['act'] += float(r.actual_yield_kg or 0)
        b['area'] += float(r.area_planted_ha or 0)
        b['n'] += 1
        if b['year'] is None or (r.year or 0) > b['year']:
            b['year'], b['season'] = r.year, r.season

    out = []
    for name, b in rows_by_crop.items():
        if not b['area']:
            continue
        target = b['est'] / b['area'] / 1000.0   # kg -> mt per hectare
        actual = b['act'] / b['area'] / 1000.0
        variance_pct = ((b['act'] - b['est']) / b['est'] * 100.0) if b['est'] else None
        out.append({
            'crop': name,
            'target_mt_ha': round(target, 2),
            'actual_mt_ha': round(actual, 2),
            'variance_pct': round(variance_pct, 1) if variance_pct is not None else None,
            'season': b['season'],
            'year': b['year'],
            'records': b['n'],
        })
    out.sort(key=lambda r: -abs(r['variance_pct'] or 0))
    return out[:limit]
