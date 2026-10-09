"""New assistance waits for the recipient: a record created for today or earlier starts Awaiting Confirmation, a future one
Pending, and both models stamp when they were recorded. Removed records stay in the database but the default manager hides
them (`all_objects` shows everything)."""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from accounts.models import UserLinkedRecord
from core.models import Notification
from farmers.models import Farmer
from fisheries.models import Fisherfolk
from interventions.lifecycle import notify_assistance_recorded
from interventions.models import BeneficiaryRecord, DistributionStatus, FisherfolkBeneficiaryRecord

_N = itertools.count(1)
User = get_user_model()


def make_farmer(first='Ana'):
    n = next(_N)
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % (980000 + n), first_name=first, last_name='Status', gender='Male',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


def make_fisherfolk(first='Ben'):
    n = next(_N)
    return Fisherfolk.objects.create(
        rsbsa_number='01-033-02-019-%06d' % (981000 + n), first_name=first, last_name='Status', gender='Male',
        birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')


def make_record(domain, person, when):
    if domain == 'crop':
        return BeneficiaryRecord.objects.create(farmer=person, assistance_type='Seeds', source_agencies=['DA'], date_given=when)
    return FisherfolkBeneficiaryRecord.objects.create(
        fisherfolk=person, assistance_type='Fish Cage', source_agencies=['BFAR'], date_given=when)


def link(user, record_type, person):
    UserLinkedRecord.objects.create(user=user, record_type=record_type, record_id=person.id, is_active=True)


class CreationStatusTests(TestCase):
    def people(self):
        return {'crop': make_farmer(), 'fisheries': make_fisherfolk()}

    def test_a_record_for_today_or_earlier_awaits_confirmation_and_a_future_one_is_pending(self):
        today = timezone.localdate()
        for domain, person in self.people().items():
            for offset, expected in ((0, DistributionStatus.AWAITING_CONFIRMATION),
                                     (-1, DistributionStatus.AWAITING_CONFIRMATION),
                                     (1, DistributionStatus.PENDING)):
                record = make_record(domain, person, today + timedelta(days=offset))
                self.assertEqual(record.status, expected, (domain, offset))
                self.assertIsNotNone(record.recorded_at, (domain, offset))

    def test_the_batch_is_empty_unless_set_and_recorded_at_is_not_reset_on_update(self):
        for domain, person in self.people().items():
            record = make_record(domain, person, timezone.localdate())
            self.assertIsNone(record.distribution_batch)
            stamp = record.recorded_at
            record.remarks = 'later edit' if domain == 'crop' else ''
            record.save()
            record.refresh_from_db()
            self.assertEqual(record.recorded_at, stamp)


class RemovedRowsAreHiddenTests(TestCase):
    def test_removed_records_leave_every_default_query_but_stay_in_all_objects(self):
        farmer, fisher = make_farmer(), make_fisherfolk()
        today = timezone.localdate()
        for domain, person, model, reverse in (
            ('crop', farmer, BeneficiaryRecord, farmer.beneficiary_records),
            ('fisheries', fisher, FisherfolkBeneficiaryRecord, fisher.beneficiary_records),
        ):
            kept, gone = make_record(domain, person, today), make_record(domain, person, today)
            model.all_objects.filter(pk=gone.pk).update(status=DistributionStatus.REMOVED)
            self.assertEqual(set(model.objects.values_list('pk', flat=True)), {kept.pk})
            self.assertEqual(set(reverse.values_list('pk', flat=True)), {kept.pk})
            self.assertEqual(set(model.all_objects.values_list('pk', flat=True)), {kept.pk, gone.pk})
            self.assertFalse(model.objects.filter(pk=gone.pk).exists())


class RecordedNotificationTests(TestCase):
    def test_the_recipient_is_told_when_a_record_awaits_their_confirmation(self):
        actor = User.objects.create_user(username='nt-staff', password='pw', role='ADMIN', email='nt-staff@x.test')
        for domain, person, link_type in (('crop', make_farmer(), 'FARMER'), ('fisheries', make_fisherfolk(), 'FISHERFOLK')):
            user = User.objects.create_user(username=f'nt-{domain}', password='pw', role='CITIZEN', email=f'nt-{domain}@x.test')
            link(user, link_type, person)
            record = make_record(domain, person, timezone.localdate())
            notify_assistance_recorded(record, actor)
            notes = Notification.objects.filter(recipient=user, verb='recorded assistance for you:')
            self.assertEqual(notes.count(), 1, domain)
            self.assertIn('confirm', notes.get().detail.lower(), domain)

    def test_no_notice_for_a_pending_record_the_actor_or_a_person_without_an_account(self):
        actor = User.objects.create_user(username='nt-actor', password='pw', role='CITIZEN', email='nt-actor@x.test')
        farmer = make_farmer()
        link(actor, 'FARMER', farmer)
        pending = make_record('crop', farmer, timezone.localdate() + timedelta(days=3))
        notify_assistance_recorded(pending, None)
        self.assertEqual(Notification.objects.count(), 0)
        own = make_record('crop', farmer, timezone.localdate())
        notify_assistance_recorded(own, actor)
        self.assertEqual(Notification.objects.count(), 0)
        loner = make_record('crop', make_farmer('Loner'), timezone.localdate())
        notify_assistance_recorded(loner, actor)
        self.assertEqual(Notification.objects.count(), 0)


class HistoricalImportKeepsItsStatusTests(TestCase):
    """A spreadsheet import loads assistance that already happened, so those rows stay Confirmed (future-dated ones Pending)."""

    def post_csv(self, url, id_label, person, rows):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from rest_framework.test import APIClient
        header = f'{id_label},Assistance Type,Source Agency,Quantity,Date Given (YYYY-MM-DD),Season,Description / Remarks\n'
        body = ''.join(f'{person.rsbsa_number},{kind},DA,1 unit,{when},,\n' for kind, when in rows)
        staff = User.objects.create_user(username=f'imp-{next(_N)}', password='pw', role='ADMIN', email=f'imp{next(_N)}@x.test')
        client = APIClient()
        client.force_authenticate(staff)
        return client.post(url, {'file': SimpleUploadedFile('assistance.csv', (header + body).encode(), content_type='text/csv')},
                           format='multipart')

    def test_imported_past_rows_stay_confirmed_and_future_rows_stay_pending(self):
        today = timezone.localdate()
        farmer = make_farmer('Imp')
        res = self.post_csv('/api/interventions/beneficiaries/adhoc/import/', 'Farmer RSBSA Number', farmer,
                            [('Seeds', today - timedelta(days=40)), ('Fertilizer', today + timedelta(days=5))])
        self.assertEqual(res.status_code, 200, res.data)
        statuses = dict(BeneficiaryRecord.objects.filter(farmer=farmer).values_list('assistance_type', 'status'))
        self.assertEqual(statuses, {'Seeds': 'CONFIRMED', 'Fertilizer': 'PENDING'})

    def test_the_fisheries_import_behaves_the_same(self):
        today = timezone.localdate()
        fisher = make_fisherfolk('Imp')
        res = self.post_csv('/api/interventions/fisherfolk-beneficiaries/adhoc/import/', 'Fisherfolk RSBSA Number', fisher,
                            [('Feed', today - timedelta(days=40)), ('Equipment', today + timedelta(days=5))])
        self.assertEqual(res.status_code, 200, res.data)
        statuses = dict(FisherfolkBeneficiaryRecord.objects.filter(fisherfolk=fisher).values_list('assistance_type', 'status'))
        self.assertEqual(statuses, {'Feed': 'CONFIRMED', 'Equipment': 'PENDING'})
