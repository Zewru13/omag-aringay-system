"""One fisheries disaster event logged for SEVERAL fisherfolk in one request (Admin > Fisheries Disaster > Log Disaster):
POST /fisheries/disaster-reports/multi/ saves one log per fisherfolk - the shared event fields once, and per fisherfolk their own stocks and
ponds/cages with the fingerlings lost (or "not linked to a stock"), equipment damaged and volume lost - each with its own photos, recovery
and notifications, all or nothing, and never twice for the same request.

Run ONLY against an isolated test database (never the shared Supabase database)."""
import io
import itertools
import json
import shutil
import tempfile
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from core.models import Notification
from fisheries.models import (
    FisheriesDisasterReport, FisheriesDisasterReportPhoto, FisheriesDisasterStockLoss, Fisherfolk, SpeciesCategory, SpeciesOption, StockingRecord,
)
from monitoring.models import AquacultureProductionCycle, AquacultureProductionUnit

URL = '/api/fisheries/disaster-reports/multi/'
_MEDIA = tempfile.mkdtemp(prefix='oma_test_media_multi_ff_')
_RSBSA = itertools.count(986000)


def _png(name='damage.png'):
    from PIL import Image
    buf = io.BytesIO()
    Image.new('RGB', (4, 4), (200, 30, 30)).save(buf, format='PNG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/png')


@override_settings(MEDIA_ROOT=_MEDIA)
class MultiFisherfolkDisasterTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='adm_mf', password='pw', role='ADMIN', email='adm_mf@x.test')
        make = lambda n: Fisherfolk.objects.create(
            first_name=n, last_name='Multi', gender='Male', birthdate=timezone.localdate().replace(year=1990), barangay='Poblacion',
            fisherfolk_type='Aquaculture', rsbsa_number='01-033-02-019-%06d' % next(_RSBSA))
        cls.ann, cls.ben, cls.cy, cls.dee = make('Ann'), make('Ben'), make('Cy'), make('Dee')   # Dee has no pond or cage
        cls.citizen = User.objects.create_user(username='ann_mf', password='pw', role='CITIZEN', email='ann_mf@x.test')
        UserLinkedRecord.objects.create(user=cls.citizen, record_type=User.LinkedRecordType.FISHERFOLK, record_id=cls.ann.id, is_active=True)
        cat, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        cls.tilapia = SpeciesOption.objects.create(
            species_name='MF Tilapia', category=cat, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=Decimal('80'), default_avg_body_weight_kg=Decimal('0.25'))

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(_MEDIA, ignore_errors=True)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def stock(self, ff, unit_counts=(300, 200)):
        cycle = AquacultureProductionCycle.objects.create(
            fisherfolk=ff, cycle_name='Grow-out', species_farmed='MF Tilapia', culture_system='Fishpond', stocking_date=timezone.localdate() - timedelta(days=20))
        for n, c in enumerate(unit_counts, start=1):
            AquacultureProductionUnit.objects.create(
                production_cycle=cycle, unit_type='pond', unit_number=n, length_m=Decimal('4'), width_m=Decimal('2'), size_sqm=Decimal('8'), fingerling_count=c)
        rec = StockingRecord.objects.create(
            fisherfolk=ff, production_cycle=cycle, species=self.tilapia, culture_type='Pond', date_stocked=timezone.localdate() - timedelta(days=20),
            number_of_fingerlings=sum(unit_counts), season='Dry', year=timezone.localdate().year)
        StockingRecord.objects.filter(pk=rec.pk).update(status='Stocked')
        rec.refresh_from_db()
        return rec, list(AquacultureProductionUnit.objects.filter(production_cycle=cycle).order_by('unit_number'))

    @staticmethod
    def row(rec, unit, lost=None, total=False):
        return {'stocking_record': rec.id, 'production_unit': unit.id if unit else None, 'fingerlings_lost': lost, 'is_total_loss': total}

    def post(self, groups, fmt='json', **extra):
        data = {'disaster_type': 'Typhoon', 'date_of_occurrence': str(timezone.localdate()), 'estimated_damage': 'Dikes overtopped',
                'fisherfolk_groups': groups}
        data.update(extra)
        if fmt == 'multipart':
            data['fisherfolk_groups'] = json.dumps(groups)
        return self.client.post(URL, data, format=fmt)

    def nothing_saved(self):
        self.assertEqual(FisheriesDisasterReport.objects.count(), 0)
        self.assertEqual(FisheriesDisasterStockLoss.objects.count(), 0)

    # ── one event, several fisherfolk
    def test_staff_logs_one_event_for_the_stocks_of_several_fisherfolk(self):
        a, (a1, a2) = self.stock(self.ann)
        b, (b1,) = self.stock(self.ben, (400,))
        r = self.post([
            {'fisherfolk': self.ann.id, 'stock_losses': [self.row(a, a1, 40), self.row(a, a2, 0)], 'volume_lost_kg': '12.50', 'equipment_damaged': 'Nets'},
            {'fisherfolk': self.ben.id, 'stock_losses': [self.row(b, b1, 400, True)]},
        ])
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(len(r.data), 2)
        reports = FisheriesDisasterReport.objects.order_by('id')
        self.assertEqual([x.stocking_record_id for x in reports], [a.id, b.id])           # one log per fisherfolk, on their own stock
        self.assertEqual([x.stocking_record.fisherfolk_id for x in reports], [self.ann.id, self.ben.id])   # each log belongs to its own fisherfolk
        self.assertEqual([x.disaster_type for x in reports], ['Typhoon', 'Typhoon'])      # the shared event fields on each
        self.assertEqual([x.estimated_damage for x in reports], ['Dikes overtopped'] * 2)
        self.assertEqual([x.is_total_loss for x in reports], [False, True])               # recovery / total loss stay per log
        self.assertEqual([x.volume_lost_kg for x in reports], [Decimal('12.50'), None])   # volume and equipment are each fisherfolk's own
        self.assertEqual([x.equipment_damaged for x in reports], ['Nets', ''])
        saved = {(x.disaster_report_id, x.production_unit_id): x.fingerlings_lost for x in FisheriesDisasterStockLoss.objects.all()}
        self.assertEqual(saved, {(reports[0].id, a1.id): 40, (reports[0].id, a2.id): 0, (reports[1].id, b1.id): 400})
        self.assertEqual([x['id'] for x in r.data], [reports[0].id, reports[1].id])
        self.assertEqual([(x['fisherfolk_name'], x['report_number']) for x in r.data], [('Ann Multi', reports[0].report_number), ('Ben Multi', reports[1].report_number)])

    def test_a_fisherfolk_not_linked_to_a_stock_gets_a_general_log(self):
        a, (a1, _a2) = self.stock(self.ann)
        self.stock(self.cy)   # Cy has a cycle (so ponds) but this event only damaged equipment
        r = self.post([
            {'fisherfolk': self.ann.id, 'stock_losses': [self.row(a, a1, 5)]},
            {'fisherfolk': self.cy.id, 'stock_losses': [], 'equipment_damaged': 'Aerator', 'volume_lost_kg': '3'},
        ])
        self.assertEqual(r.status_code, 201, r.content)
        linked, general = FisheriesDisasterReport.objects.order_by('id')
        self.assertEqual((linked.stocking_record_id, linked.stocking_record.fisherfolk_id), (a.id, self.ann.id))
        self.assertEqual((general.stocking_record_id, general.fisherfolk_id), (None, self.cy.id))
        self.assertEqual((general.equipment_damaged, general.volume_lost_kg, general.disaster_type), ('Aerator', Decimal('3'), 'Typhoon'))
        self.assertEqual(FisheriesDisasterStockLoss.objects.filter(disaster_report=general).count(), 0)

    def test_a_fisherfolk_with_no_pond_or_cage_cannot_be_logged(self):
        a, (a1, _a2) = self.stock(self.ann)
        r = self.post([
            {'fisherfolk': self.ann.id, 'stock_losses': [self.row(a, a1, 5)]},
            {'fisherfolk': self.dee.id, 'stock_losses': [], 'equipment_damaged': 'Nets'},
        ])
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('Dee Multi', json.dumps(r.data))
        self.nothing_saved()   # Ann's good group is not saved either

    def test_all_or_nothing_when_one_fisherfolk_is_wrong(self):
        a, (a1, a2) = self.stock(self.ann)
        b, (b1,) = self.stock(self.ben, (400,))
        # Ben's group names Ann's stock: refused, and Ann's good group saves nothing either
        r = self.post([
            {'fisherfolk': self.ann.id, 'stock_losses': [self.row(a, a1, 10)]},
            {'fisherfolk': self.ben.id, 'stock_losses': [self.row(a, a2, 10)]},
        ])
        self.assertEqual(r.status_code, 400, r.content)
        self.nothing_saved()

    def test_the_shared_event_is_checked_like_a_single_log(self):
        a, (a1, _a2) = self.stock(self.ann)
        group = [{'fisherfolk': self.ann.id, 'stock_losses': [self.row(a, a1, 5)]}]
        tomorrow = str(timezone.localdate() + timedelta(days=1))
        self.assertEqual(self.post(group, date_of_occurrence=tomorrow).status_code, 400)            # not in the future
        self.assertEqual(self.post(group, disaster_type='Other').status_code, 400)                 # Other needs its words
        self.assertEqual(self.post(group, disaster_type='Meteor').status_code, 400)                # a known type
        self.assertEqual(self.post([{**group[0], 'volume_lost_kg': '-1'}]).status_code, 400)       # no negative volume
        self.nothing_saved()

    # ── photos, notifications, duplicates, permissions
    def test_the_photos_are_copied_to_every_log_linked_or_not(self):
        a, (a1, _a2) = self.stock(self.ann)
        self.stock(self.cy)
        r = self.post([
            {'fisherfolk': self.ann.id, 'stock_losses': [self.row(a, a1, 5)]},
            {'fisherfolk': self.cy.id, 'stock_losses': []},
        ], fmt='multipart', photos=[_png('one.png'), _png('two.png')])
        self.assertEqual(r.status_code, 201, r.content)
        for report in FisheriesDisasterReport.objects.all():
            self.assertEqual(FisheriesDisasterReportPhoto.objects.filter(disaster_report=report).count(), 2)

    def test_each_fisherfolk_is_notified_once(self):
        a, (a1, _a2) = self.stock(self.ann)
        b, (b1,) = self.stock(self.ben, (400,))
        before = Notification.objects.filter(recipient=self.citizen).count()
        r = self.post([
            {'fisherfolk': self.ann.id, 'stock_losses': [self.row(a, a1, 5)]},
            {'fisherfolk': self.ben.id, 'stock_losses': [self.row(b, b1, 5)]},
        ])
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Notification.objects.filter(recipient=self.citizen).count(), before + 1)   # Ann's own account hears about hers only

    def test_sending_the_same_event_twice_saves_it_once(self):
        a, (a1, _a2) = self.stock(self.ann)
        b, (b1,) = self.stock(self.ben, (400,))
        groups = [
            {'fisherfolk': self.ann.id, 'stock_losses': [self.row(a, a1, 5)]},
            {'fisherfolk': self.ben.id, 'stock_losses': [self.row(b, b1, 5)]},
        ]
        first = self.post(groups)
        notified = Notification.objects.count()
        second = self.post(groups)                      # a double click / retry
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(second.status_code, 200, second.content)
        self.assertEqual([x['id'] for x in second.data], [x['id'] for x in first.data])
        self.assertEqual(FisheriesDisasterReport.objects.count(), 2)
        self.assertEqual(Notification.objects.count(), notified)

    def test_only_staff_can_log_an_event_for_other_fisherfolk(self):
        a, (a1, _a2) = self.stock(self.ann)
        self.client.force_authenticate(self.citizen)
        r = self.post([{'fisherfolk': self.ann.id, 'stock_losses': [self.row(a, a1, 5)]}])
        self.assertEqual(r.status_code, 403, r.content)
        self.nothing_saved()

    def test_a_bad_list_of_fisherfolk_is_a_400(self):
        a, (a1, _a2) = self.stock(self.ann)
        good = {'fisherfolk': self.ann.id, 'stock_losses': [self.row(a, a1, 5)]}
        for groups in ([], 'x', [good, good], [{'fisherfolk': 999999, 'stock_losses': [self.row(a, a1, 5)]}], [{'stock_losses': []}]):
            self.assertEqual(self.post(groups).status_code, 400, groups)
        self.nothing_saved()
