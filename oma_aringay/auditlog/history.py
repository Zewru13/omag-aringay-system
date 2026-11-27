"""The history of one farmer, fisherfolk or cooperative for the Audit Log's history tabs, built from the records themselves, so it
covers everything on record, however old. Read only.

Each event is (date, what happened, module). A record without the date an event needs gives no event; what has no date at all
(farm parcels, machinery) is counted among the facts instead. A membership that ended keeps no end date, so only the joining is
listed, marked "(ended)".
"""
import datetime as dt

from django.db.models import Q
from django.utils import timezone

from associations.models import (
    FarmersOrganization, FarmersOrganizationEquipment, FarmersOrganizationEquipmentLoan, FarmersOrganizationEquipmentRepair,
    FarmersOrganizationMember, FisherfolkOrganization, FisherfolkOrganizationEquipment, FisherfolkOrganizationEquipmentLoan,
    FisherfolkOrganizationEquipmentRepair, FisherfolkOrganizationMember, FisherfolkOrganizationOfficer, OrganizationOfficer,
)
from auditlog.modules import ACCOUNT, ASSISTANCE, COOPERATIVES, CROPS, DISASTER, FISHERIES, REGISTRATION
from core.models import ProfileChangeRequest
from farmers.models import Farmer, FarmerMachinery, FarmParcel
from fisheries.models import (
    Fisherfolk, FisheriesActivityLog, FisheriesDisasterReport, FisheriesHarvestRecord, FishingTripLog, Pond, StockingRecord,
)
from interventions.distributions import record_item
from interventions.models import BeneficiaryRecord, DistributionStatus, FisherfolkBeneficiaryRecord, schedule_has_passed
from monitoring.models import AquacultureFeedingLog, AquacultureHealthLog, AquacultureProductionCycle, FarmVisit
from production.models import CropActivityLog, CropDisasterReport, CropMonitoringRecord, HarvestRecord


def event(when, what, module):
    """One line of history, or None when the record has no date for it."""
    if when is None:
        return None
    if isinstance(when, dt.datetime):
        when = timezone.localtime(when).date() if timezone.is_aware(when) else when.date()
    return {'date': when.isoformat(), 'what': what, 'module': module}


def amount(value):
    """1,250 or 12.5: no trailing zeros."""
    if value is None:
        return ''
    if isinstance(value, int):
        return f'{value:,}'
    return f'{value:,.2f}'.rstrip('0').rstrip('.')


def chosen(record, field):
    """The words of a chosen value, or what was typed for "Other"."""
    value = getattr(record, field)
    if value == 'Other':
        typed = getattr(record, f'{field}_other_specify', '')
        if typed:
            return typed
    shown = getattr(record, f'get_{field}_display', None)
    return shown() if shown else value


def equipment_name(equipment):
    if equipment.equipment_name == 'Other' and equipment.equipment_name_other:
        return equipment.equipment_name_other
    return equipment.get_equipment_name_display()


# ── what a farmer, a fisherfolk and a cooperative share ──

def assistance_events(records):
    """`records` must include the removed ones (`all_objects`): the default manager hides them."""
    for record in records:
        kind = record.get_assistance_type_display()
        if record.status == DistributionStatus.REMOVED:
            yield event(record.removed_at or record.date_given, f'Removed from the list: {kind}', ASSISTANCE)
            continue
        heading = 'Assistance' if schedule_has_passed(record.date_given, record.distribution_time) else 'Assistance scheduled'
        text = ' '.join(filter(None, [kind, record_item(record)]))
        yield event(record.date_given, f'{heading}: ' + ', '.join(filter(None, [text, record.quantity])), ASSISTANCE)


def membership_events(rows):
    for row in rows:
        yield event(row.date_joined, f'Joined {row.organization.name}' + ('' if row.is_active else ' (ended)'), COOPERATIVES)


def own_officer_events(rows):
    for row in rows:
        position, name = row.get_position_display(), row.organization.name
        yield event(row.term_start_date, f'Became {position} of {name}', COOPERATIVES)
        if not row.is_active:
            yield event(row.term_end_date, f'Term as {position} of {name} ended', COOPERATIVES)


def own_loan_events(loans):
    for loan in loans:
        item = f'{loan.quantity} {equipment_name(loan.equipment)}'
        coop = loan.equipment.organization.name
        if loan.borrowed_at is None:
            yield event(loan.requested_at, f'Asked to borrow {item}', COOPERATIVES)
            continue
        yield event(loan.borrowed_at, f'Borrowed {item} from {coop}', COOPERATIVES)
        yield event(loan.returned_at, f'Returned {item} to {coop}', COOPERATIVES)


def change_request_events(record_type, number):
    for request in ProfileChangeRequest.objects.filter(linked_record_type=record_type, linked_record_id=number):
        field = request.field_name.replace('_', ' ')
        yield event(request.requested_at, f'Asked to change {field} to "{request.requested_value}"', ACCOUNT)
        yield event(request.reviewed_at, f'Change of {field}: {request.get_status_display()}', ACCOUNT)


def disaster_events(report, what):
    kind = chosen(report, 'disaster_type')
    yield event(report.date_of_occurrence, f'Disaster on {what}: {kind}', DISASTER)
    yield event(report.recovered_date, f'{what} recovered from {kind}', DISASTER)


# ── the three histories; the order of the parts settles the order of events of the same day ──

def farmer_events(farmer):
    yield event(farmer.date_registered, 'Registered as a farmer', REGISTRATION)
    for crop in CropMonitoringRecord.objects.filter(farmer=farmer).select_related('crop_type'):
        yield event(crop.date_planted, f'Planted {crop.crop_type} ({crop.season} {crop.year}), {amount(crop.area_planted_ha)} ha', CROPS)
    for log in CropActivityLog.objects.filter(monitoring_record__farmer=farmer).select_related('monitoring_record__crop_type'):
        yield event(log.date_of_activity, f'{chosen(log, "activity_type")} on {log.monitoring_record.crop_type}', CROPS)
    for harvest in HarvestRecord.objects.filter(Q(monitoring_record__farmer=farmer) | Q(farm_parcel__farmer=farmer)).distinct():
        when = harvest.harvest_end_date or harvest.harvest_start_date or harvest.date_recorded
        if harvest.force_harvest_reason:
            what = f'Force harvested {harvest.crop_name}: {harvest.get_force_harvest_reason_display()}'
        else:
            what = f'Harvested {harvest.crop_name}: {amount(harvest.volume_kg)} kg'
        yield event(when, what, CROPS)
    for report in CropDisasterReport.objects.filter(monitoring_record__farmer=farmer).select_related('monitoring_record__crop_type'):
        yield from disaster_events(report, report.monitoring_record.crop_type)
    yield from assistance_events(BeneficiaryRecord.all_objects.filter(farmer=farmer))
    for visit in FarmVisit.objects.filter(farmer=farmer):
        yield event(visit.visit_date, f'Farm visit: {visit.purpose}', REGISTRATION)
    yield from membership_events(FarmersOrganizationMember.objects.filter(farmer=farmer).select_related('organization'))
    yield from own_officer_events(OrganizationOfficer.objects.filter(farmer=farmer).select_related('organization'))
    yield from own_loan_events(
        FarmersOrganizationEquipmentLoan.objects.filter(member=farmer).select_related('equipment__organization'))
    yield from change_request_events('FARMER', farmer.id)


def fisherfolk_events(fisher):
    yield event(fisher.date_registered, 'Registered as a fisherfolk', REGISTRATION)
    for pond in Pond.objects.filter(fisherfolk=fisher):
        yield event(pond.date_created, f'Added pond or cage {pond.name}', REGISTRATION)
    cycles = list(AquacultureProductionCycle.objects.filter(fisherfolk=fisher))
    for cycle in cycles:
        yield event(cycle.stocking_date, f'Started cycle {cycle.cycle_name} ({cycle.species_farmed})', FISHERIES)
    for stocking in StockingRecord.objects.filter(fisherfolk=fisher).select_related('species'):
        yield event(stocking.date_stocked, f'Stocked {amount(stocking.number_of_fingerlings)} {stocking.species.species_name}', FISHERIES)
    for log in AquacultureFeedingLog.objects.filter(production_cycle__fisherfolk=fisher).select_related('production_cycle'):
        yield event(log.feeding_date, f'Fed {amount(log.quantity_kg)} kg of {log.feed_type} ({log.production_cycle.cycle_name})', FISHERIES)
    for log in AquacultureHealthLog.objects.filter(production_cycle__fisherfolk=fisher).select_related('production_cycle'):
        yield event(log.log_date, f'Health observation ({log.production_cycle.cycle_name}): {log.observation}', FISHERIES)
    for log in FisheriesActivityLog.objects.filter(stocking_record__fisherfolk=fisher).select_related('stocking_record__species'):
        activity = log.activity_other_specify if log.activity == 'Other' and log.activity_other_specify else log.activity
        yield event(log.date_of_activity, f'{activity} on {log.stocking_record.species.species_name}', FISHERIES)
    for harvest in FisheriesHarvestRecord.objects.filter(stocking_record__fisherfolk=fisher).select_related('stocking_record__species'):
        yield event(harvest.harvest_date, f'Harvested {amount(harvest.quantity_kg)} kg of {harvest.stocking_record.species.species_name}',
                    FISHERIES)
    for cycle in cycles:
        yield event(cycle.actual_harvest_date, f'Cycle {cycle.cycle_name} harvested', FISHERIES)
    for trip in FishingTripLog.objects.filter(fisherfolk=fisher):
        caught = '' if trip.total_catch_kg is None else f': {amount(trip.total_catch_kg)} kg'
        yield event(trip.trip_date, f'Fishing trip to {trip.fishing_ground}{caught}', FISHERIES)
    reports = (FisheriesDisasterReport.objects.filter(Q(fisherfolk=fisher) | Q(stocking_record__fisherfolk=fisher))
               .select_related('stocking_record__species').distinct())
    for report in reports:
        stock = report.stocking_record
        yield from disaster_events(report, stock.species.species_name if stock else 'Fisheries')
    yield from assistance_events(FisherfolkBeneficiaryRecord.all_objects.filter(fisherfolk=fisher))
    yield from membership_events(FisherfolkOrganizationMember.objects.filter(fisherfolk=fisher).select_related('organization'))
    yield from own_officer_events(
        FisherfolkOrganizationOfficer.objects.filter(member__fisherfolk=fisher).select_related('organization'))
    yield from own_loan_events(
        FisherfolkOrganizationEquipmentLoan.objects.filter(member=fisher).select_related('equipment__organization'))
    yield from change_request_events('FISHERFOLK', fisher.id)


def cooperative_events(coop, models):
    yield event(coop.date_registered or coop.date_created, 'Cooperative registered', COOPERATIVES)
    person = models['person']
    for row in models['member'].objects.filter(organization=coop).select_related(person):
        ended = '' if row.is_active else ' (ended)'
        yield event(row.date_joined, f'{getattr(row, person).full_name} joined{ended}', COOPERATIVES)
    for officer in models['officer'].objects.filter(organization=coop):
        position = officer.get_position_display()
        yield event(officer.term_start_date, f'{officer.full_name} became {position}', COOPERATIVES)
        if not officer.is_active:
            yield event(officer.term_end_date, f'{officer.full_name} ended the term as {position}', COOPERATIVES)
    for item in models['equipment'].objects.filter(organization=coop):
        yield event(item.acquisition_date, f'Acquired {item.quantity} {equipment_name(item)}', COOPERATIVES)
    for loan in models['loan'].objects.filter(equipment__organization=coop).select_related('equipment', 'member'):
        item = f'{loan.quantity} {equipment_name(loan.equipment)}'
        yield event(loan.borrowed_at, f'Lent {item} to {loan.member.full_name}', COOPERATIVES)
        if loan.borrowed_at is not None:
            yield event(loan.returned_at, f'{loan.member.full_name} returned {item}', COOPERATIVES)
    for repair in models['repair'].objects.filter(equipment__organization=coop).select_related('equipment'):
        yield event(repair.repaired_on, f'Repaired {repair.quantity} {equipment_name(repair.equipment)}: {repair.description}',
                    COOPERATIVES)
    # one distribution is one line, however many members it reached (the default manager leaves out removed entries)
    reached = {}
    for record in models['assistance'].objects.filter(distributed_by_organization=coop).order_by('id'):
        key = (record.date_given, record.get_assistance_type_display(), record.distribution_batch)
        count, done = reached.get(key, (0, True))
        reached[key] = (count + 1, done and schedule_has_passed(record.date_given, record.distribution_time))
    for (given, kind, _), (count, done) in reached.items():
        members = f'{count:,} member{"" if count == 1 else "s"}'
        yield event(given, f'Gave {kind} to {members}' if done else f'{kind} scheduled for {members}', ASSISTANCE)


FARMERS_COOPERATIVE = dict(person='farmer', member=FarmersOrganizationMember, officer=OrganizationOfficer,
                           equipment=FarmersOrganizationEquipment, loan=FarmersOrganizationEquipmentLoan,
                           repair=FarmersOrganizationEquipmentRepair, assistance=BeneficiaryRecord)
FISHERFOLK_COOPERATIVE = dict(person='fisherfolk', member=FisherfolkOrganizationMember, officer=FisherfolkOrganizationOfficer,
                              equipment=FisherfolkOrganizationEquipment, loan=FisherfolkOrganizationEquipmentLoan,
                              repair=FisherfolkOrganizationEquipmentRepair, assistance=FisherfolkBeneficiaryRecord)


def farmer_facts(farmer):
    return [('RSBSA number', farmer.rsbsa_number), ('Barangay', farmer.barangay),
            ('Farm parcels', FarmParcel.objects.filter(farmer=farmer).count()),
            ('Machinery', FarmerMachinery.objects.filter(farmer=farmer).count())]


def fisherfolk_facts(fisher):
    return [('RSBSA number', fisher.rsbsa_number), ('Barangay', fisher.barangay),
            ('Ponds and cages', Pond.objects.filter(fisherfolk=fisher).count())]


def cooperative_facts(coop, models):
    return [('Registration number', coop.registration_number), ('Barangay', coop.barangay),
            ('Current members', models['member'].objects.filter(organization=coop, is_active=True).count()),
            ('Equipment items', models['equipment'].objects.filter(organization=coop).count())]


def _cooperative(models):
    return (lambda coop: cooperative_events(coop, models)), (lambda coop: cooperative_facts(coop, models))


KINDS = {
    'farmer': (Farmer, farmer_events, farmer_facts),
    'fisherfolk': (Fisherfolk, fisherfolk_events, fisherfolk_facts),
    'farmers-cooperative': (FarmersOrganization, *_cooperative(FARMERS_COOPERATIVE)),
    'fisherfolk-cooperative': (FisherfolkOrganization, *_cooperative(FISHERFOLK_COOPERATIVE)),
}


def history_of(kind, pk):
    """(subject, events newest first) for one person or cooperative, or None when the kind or the record does not exist."""
    if kind not in KINDS:
        return None
    model, events_of, facts_of = KINDS[kind]
    record = model.objects.filter(pk=pk).first()
    if record is None:
        return None
    found = [e for e in events_of(record) if e is not None]
    # newest first; events of the same day: what comes later in a history (an end, a return) shows first
    ordered = [e for _, e in sorted(enumerate(found), key=lambda pair: (pair[1]['date'], pair[0]), reverse=True)]
    subject = {'kind': kind, 'id': record.pk, 'name': getattr(record, 'full_name', None) or record.name,
               'facts': [{'label': label, 'value': str(value)} for label, value in facts_of(record)]}
    return subject, ordered
