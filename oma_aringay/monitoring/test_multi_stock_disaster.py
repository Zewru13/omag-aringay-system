"""Multi-stock Fisheries Disaster logs: POST /fisheries/disaster-reports/stocks/ - one report, several stocks,
fingerlings lost and Total Loss per stock and pond/cage; plus the details document, the PDF and the list.

Run ONLY against an isolated test database (never the shared Supabase database)."""
import io
import json
import shutil
import tempfile
import itertools
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from core.models import Notification
from fisheries.models import (
    FisheriesDisasterReport, FisheriesDisasterReportPhoto, FisheriesDisasterStockLoss, FisheriesHarvestRecord,
    Fisherfolk, Pond, SpeciesCategory, SpeciesOption, StockingRecord,
)
from monitoring.models import AquacultureProductionCycle, AquacultureProductionUnit

URL = '/api/fisheries/disaster-reports/stocks/'
_MEDIA = tempfile.mkdtemp(prefix='oma_test_media_multistock_')


def _png(name='damage.png'):
    from PIL import Image
    buf = io.BytesIO()
    Image.new('RGB', (4, 4), (200, 30, 30)).save(buf, format='PNG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/png')


_RSBSA = itertools.count(990000)


def _rsbsa():
    """A unique, well-formed RSBSA number: every fisherfolk needs one."""
    return '01-033-02-019-%06d' % next(_RSBSA)


@override_settings(MEDIA_ROOT=_MEDIA)
class MultiStockDisasterTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='adm_ms', password='pw', role='ADMIN', email='adm_ms@x.test')
        make = lambda n: Fisherfolk.objects.create(
            first_name=n, last_name='Test', gender='Male', birthdate=timezone.localdate().replace(year=1990),
            barangay='Poblacion', fisherfolk_type='Aquaculture', rsbsa_number=_rsbsa(),   # required for every fisherfolk
        )
        cls.ff_a, cls.ff_b = make('Ann'), make('Ben')
        cls.user_a = User.objects.create_user(username='ann_ms', password='pw', role='CITIZEN', email='ann_ms@x.test')
        UserLinkedRecord.objects.create(user=cls.user_a, record_type=User.LinkedRecordType.FISHERFOLK, record_id=cls.ff_a.id, is_active=True)
        cat, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        sp = lambda n: SpeciesOption.objects.create(
            species_name=n, category=cat, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=Decimal('80'), default_avg_body_weight_kg=Decimal('0.25'),
        )
        cls.tilapia, cls.dalag = sp('MS Tilapia'), sp('MS Dalag')

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(_MEDIA, ignore_errors=True)

    def setUp(self):
        self.client.force_authenticate(self.user_a)

    # --- fixtures -----------------------------------------------------------------------------------------
    def stock(self, ff, species, unit_counts=(), fingerlings=500, status='Stocked'):
        cycle = None
        if unit_counts:
            cycle = AquacultureProductionCycle.objects.create(
                fisherfolk=ff, cycle_name='Grow-out', species_farmed=species.species_name, culture_system='Fishpond',
                stocking_date=timezone.localdate() - timedelta(days=20),
            )
            for n, c in enumerate(unit_counts, start=1):
                AquacultureProductionUnit.objects.create(
                    production_cycle=cycle, unit_type='pond', unit_number=n, length_m=Decimal('4'), width_m=Decimal('2'),
                    size_sqm=Decimal('8'), fingerling_count=c,
                )
        rec = StockingRecord.objects.create(
            fisherfolk=ff, production_cycle=cycle, species=species, culture_type='Pond',
            date_stocked=timezone.localdate() - timedelta(days=20), number_of_fingerlings=sum(unit_counts) or fingerlings,
            season='Dry', year=timezone.localdate().year,
        )
        StockingRecord.objects.filter(pk=rec.pk).update(status=status)
        rec.refresh_from_db()
        units = list(AquacultureProductionUnit.objects.filter(production_cycle=cycle).order_by('unit_number')) if cycle else []
        return rec, units

    def body(self, rows, **extra):
        data = {'disaster_type': 'Typhoon', 'date_of_occurrence': str(timezone.localdate()),
                'estimated_damage': 'Dikes overtopped', 'equipment_damaged': 'Fishpond Dike', 'stock_losses': rows}
        data.update(extra)
        return data

    def post(self, rows, fmt='json', **extra):
        data = self.body(rows, **extra)
        if fmt == 'multipart':
            data['stock_losses'] = json.dumps(rows)
        return self.client.post(URL, data, format=fmt)

    def row(self, rec, unit=None, lost=None, total=False):
        return {'stocking_record': rec.id, 'production_unit': unit.id if unit else None,
                'fingerlings_lost': lost, 'is_total_loss': total}

    def nothing_saved(self):
        self.assertEqual(FisheriesDisasterReport.objects.count(), 0)
        self.assertEqual(FisheriesDisasterStockLoss.objects.count(), 0)

    # --- saving ---------------------------------------------------------------------------------------------
    def test_fisherfolk_logs_several_stocks_with_per_unit_losses(self):
        tilapia, (p1, p2) = self.stock(self.ff_a, self.tilapia, (300, 200))
        dalag, _ = self.stock(self.ff_a, self.dalag, fingerlings=150)          # no pond/cage breakdown
        r = self.post([self.row(tilapia, p1, 40), self.row(tilapia, p2, 0), self.row(dalag, None, 25)])
        self.assertEqual(r.status_code, 201, r.data)
        report = FisheriesDisasterReport.objects.get(pk=r.data['id'])
        self.assertEqual(report.stocking_record_id, tilapia.id)                 # first stock = the report's stock
        self.assertEqual(report.submission_status, 'SUBMITTED')                 # Log Disaster IS the submission
        self.assertIsNone(report.area_affected_ha)                              # no longer asked
        saved = {(x.stocking_record_id, x.production_unit_id): (x.fingerlings_lost, x.is_total_loss)
                 for x in FisheriesDisasterStockLoss.objects.filter(disaster_report=report)}
        self.assertEqual(saved, {(tilapia.id, p1.id): (40, False), (tilapia.id, p2.id): (0, False), (dalag.id, None): (25, False)})
        self.assertTrue(Notification.objects.filter(recipient=self.admin).exists())   # Admin notified as before
        doc = self.client.get(f'/api/fisheries/disaster-reports/{report.id}/').data
        self.assertEqual([(g['label'].split(' ·')[0], g['total_lost'], [r['unit_label'] for r in g['rows']]) for g in doc['fingerling_losses']],
                         [('MS Tilapia', 40, ['Pond 1', 'Pond 2']), ('MS Dalag', 25, ['Whole stock'])])
        self.assertEqual(doc['fingerlings_lost_total'], 65)                     # computed by the backend
        self.assertEqual(doc['fingerling_losses'][0]['rows'][0]['fingerlings_stocked'], 300)
        listed = {x['id']: x for x in self.client.get('/api/fisheries/disaster-reports/').data}
        self.assertTrue(listed[report.id]['affected_stock'].endswith('+1 more stock'))
        self.assertEqual(self.client.get('/api/fisheries/disaster-reports/', {'search': 'Dalag'}).data[0]['id'], report.id)

    def test_frontend_totals_and_client_total_loss_flag_are_not_trusted(self):
        tilapia, (p1, p2) = self.stock(self.ff_a, self.tilapia, (300, 200))
        r = self.post([self.row(tilapia, p1, 10), self.row(tilapia, p2, 5)], is_total_loss=True,
                      fingerlings_lost_total=999, area_affected_ha='-4')
        self.assertEqual(r.status_code, 201, r.data)
        report = FisheriesDisasterReport.objects.get(pk=r.data['id'])
        self.assertFalse(report.is_total_loss)                                  # no row was Total Loss
        tilapia.refresh_from_db()
        self.assertEqual(tilapia.status, 'Stocked')
        self.assertEqual(self.client.get(f'/api/fisheries/disaster-reports/{report.id}/').data['fingerlings_lost_total'], 15)

    def test_photos_are_saved_with_the_multi_stock_log(self):
        tilapia, (p1,) = self.stock(self.ff_a, self.tilapia, (300,))
        data = self.body([self.row(tilapia, p1, 12)])
        data['stock_losses'] = json.dumps(data['stock_losses'])
        data['photos'] = [_png('a.png'), _png('b.png')]
        r = self.client.post(URL, data, format='multipart')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(FisheriesDisasterReportPhoto.objects.filter(disaster_report_id=r.data['id']).count(), 2)
        self.assertEqual(FisheriesDisasterStockLoss.objects.get(disaster_report_id=r.data['id']).fingerlings_lost, 12)

    def test_a_double_click_saves_one_log(self):
        tilapia, (p1,) = self.stock(self.ff_a, self.tilapia, (300,))
        first = self.post([self.row(tilapia, p1, 5)])
        again = self.post([self.row(tilapia, p1, 5)])
        self.assertEqual((first.status_code, again.status_code, again.data['id']), (201, 200, first.data['id']))
        self.assertEqual(FisheriesDisasterReport.objects.count(), 1)
        self.assertEqual(FisheriesDisasterStockLoss.objects.count(), 1)

    # --- Total Loss per stock / pond --------------------------------------------------------------------------
    def test_total_loss_of_one_pond_does_not_close_the_stock_or_others(self):
        tilapia, (p1, p2) = self.stock(self.ff_a, self.tilapia, (300, 200))
        dalag, _ = self.stock(self.ff_a, self.dalag, fingerlings=150)
        r = self.post([self.row(tilapia, p1, 300, total=True), self.row(tilapia, p2, 10), self.row(dalag, None, 5)])
        self.assertEqual(r.status_code, 201, r.data)
        tilapia.refresh_from_db(); dalag.refresh_from_db()
        self.assertEqual((tilapia.status, dalag.status), ('Stocked', 'Stocked'))
        self.assertTrue(FisheriesDisasterStockLoss.objects.get(production_unit=p1).is_total_loss)
        self.assertFalse(FisheriesDisasterReport.objects.get(pk=r.data['id']).is_total_loss)

    def test_every_pond_destroyed_closes_only_that_stock(self):
        tilapia, (p1, p2) = self.stock(self.ff_a, self.tilapia, (300, 200))
        dalag, _ = self.stock(self.ff_a, self.dalag, fingerlings=150)
        r = self.post([self.row(tilapia, p1, 300, True), self.row(tilapia, p2, 200, True), self.row(dalag, None, 5)])
        self.assertEqual(r.status_code, 201, r.data)
        tilapia.refresh_from_db(); dalag.refresh_from_db()
        self.assertEqual((tilapia.status, dalag.status), ('Total Loss', 'Stocked'))
        report = FisheriesDisasterReport.objects.get(pk=r.data['id'])
        self.assertFalse(report.is_total_loss)                                  # not every stock destroyed
        # Deleting the log reopens the stock it closed.
        self.client.force_authenticate(self.admin)
        report.delete()
        tilapia.refresh_from_db()
        self.assertNotEqual(tilapia.status, 'Total Loss')

    def test_all_stocks_destroyed_marks_the_report_total_loss(self):
        tilapia, (p1,) = self.stock(self.ff_a, self.tilapia, (300,))
        dalag, _ = self.stock(self.ff_a, self.dalag, fingerlings=150)
        r = self.post([self.row(tilapia, p1, 300, True), self.row(dalag, None, 150, True)])
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(FisheriesDisasterReport.objects.get(pk=r.data['id']).is_total_loss)
        self.assertEqual(set(StockingRecord.objects.filter(pk__in=[tilapia.id, dalag.id]).values_list('status', flat=True)), {'Total Loss'})

    def test_harvested_ponds_do_not_block_closing_the_rest(self):
        tilapia, (p1, p2) = self.stock(self.ff_a, self.tilapia, (300, 200))
        h = FisheriesHarvestRecord.objects.create(stocking_record=tilapia, harvest_date=timezone.localdate(), quantity_kg='20')
        h.production_units.set([p1])
        bad = self.post([self.row(tilapia, p1, 5)])                              # harvested pond cannot lose fingerlings
        self.assertEqual(bad.status_code, 400)
        self.assertIn('already harvested', str(bad.data['stock_losses']))
        r = self.post([self.row(tilapia, p2, 200, True)])                         # the only pond still stocked
        self.assertEqual(r.status_code, 201, r.data)
        tilapia.refresh_from_db()
        self.assertEqual(tilapia.status, 'Total Loss')

    def test_total_loss_uses_the_full_stocked_count(self):
        tilapia, (p1, p2) = self.stock(self.ff_a, self.tilapia, (300, 200))
        # No count typed: the server records the pond's full stocked count.
        r = self.post([self.row(tilapia, p1, None, True), self.row(tilapia, p2, 15)])
        self.assertEqual(r.status_code, 201, r.data)
        saved = {x.production_unit_id: (x.fingerlings_lost, x.is_total_loss) for x in FisheriesDisasterStockLoss.objects.all()}
        self.assertEqual(saved, {p1.id: (300, True), p2.id: (15, False)})
        doc = self.client.get(f'/api/fisheries/disaster-reports/{r.data["id"]}/').data
        self.assertEqual((doc['fingerling_losses'][0]['total_lost'], doc['fingerlings_lost_total']), (315, 315))
        tilapia.refresh_from_db()
        self.assertEqual(tilapia.status, 'Stocked')                               # one pond of two: stock stays open

    def test_total_loss_count_must_be_the_stocked_count(self):
        tilapia, (p1,) = self.stock(self.ff_a, self.tilapia, (300,))
        r = self.post([self.row(tilapia, p1, 120, True)])
        self.assertEqual(r.status_code, 400)
        self.assertIn('all 300 stocked fingerlings were lost', str(r.data['stock_losses']))
        self.nothing_saved()

    def test_whole_stock_total_loss_uses_the_stock_count(self):
        dalag, _ = self.stock(self.ff_a, self.dalag, fingerlings=150)            # no pond/cage breakdown
        r = self.post([self.row(dalag, None, None, True)])
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(FisheriesDisasterStockLoss.objects.get().fingerlings_lost, 150)
        dalag.refresh_from_db()
        self.assertEqual(dalag.status, 'Total Loss')

    # --- validation / ownership / atomicity -------------------------------------------------------------------
    def test_another_fisherfolks_stock_is_rejected(self):
        mine, (p1,) = self.stock(self.ff_a, self.tilapia, (300,))
        theirs, (q1,) = self.stock(self.ff_b, self.tilapia, (300,))
        r = self.post([self.row(mine, p1, 5), self.row(theirs, q1, 5)])
        self.assertEqual(r.status_code, 400)
        self.assertIn("is not one of this fisherfolk's stocks", str(r.data['stock_losses']))
        self.nothing_saved()
        # A fisherfolk cannot redirect the owner by sending `fisherfolk`.
        r = self.post([self.row(theirs, q1, 5)], fisherfolk=self.ff_b.id)
        self.assertEqual(r.status_code, 400)
        self.nothing_saved()

    def test_a_unit_of_another_stock_is_rejected(self):
        tilapia, (p1,) = self.stock(self.ff_a, self.tilapia, (300,))
        dalag, (q1,) = self.stock(self.ff_a, self.dalag, (100,))
        r = self.post([self.row(tilapia, q1, 5)])
        self.assertEqual(r.status_code, 400)
        self.assertIn('does not belong to', str(r.data['stock_losses']))
        r = self.post([self.row(tilapia, None, 5)])                               # a pond is required when it has ponds
        self.assertEqual(r.status_code, 400)
        self.nothing_saved()

    def test_invalid_counts_duplicates_and_limits_are_rejected(self):
        tilapia, (p1, p2) = self.stock(self.ff_a, self.tilapia, (300, 200))
        for bad in (-1, 1.5, '2.5', 'abc', True, '-3'):
            with self.subTest(value=bad):
                r = self.post([self.row(tilapia, p1, bad)])
                self.assertEqual(r.status_code, 400, r.data)
        over = self.post([self.row(tilapia, p2, 201)])
        self.assertEqual(over.status_code, 400)
        self.assertIn('cannot exceed the 200 stocked', str(over.data['stock_losses']))
        dup = self.post([self.row(tilapia, p1, 1), self.row(tilapia, p1, 2)])
        self.assertEqual(dup.status_code, 400)
        self.assertIn('listed twice', str(dup.data['stock_losses']))
        self.assertEqual(self.post([]).status_code, 400)                            # at least one stock
        self.assertEqual(self.post([self.row(tilapia, p1, '7')]).status_code, 201)  # "7" from a form is fine
        self.assertEqual(self.post([self.row(tilapia, p2, '')], estimated_damage='Other').status_code, 201)   # blank = not recorded

    def test_inactive_stock_is_rejected(self):
        done, _ = self.stock(self.ff_a, self.tilapia, fingerlings=100, status='Harvested')
        r = self.post([self.row(done, None, 5)])
        self.assertEqual(r.status_code, 400)
        self.nothing_saved()

    def test_one_invalid_row_saves_nothing_and_a_failing_save_rolls_back(self):
        tilapia, (p1, p2) = self.stock(self.ff_a, self.tilapia, (300, 200))
        r = self.post([self.row(tilapia, p1, 10), self.row(tilapia, p2, -1)])
        self.assertEqual(r.status_code, 400)
        self.nothing_saved()
        # A failure AFTER the report row was written (while saving the loss rows) rolls everything back.
        with mock.patch('fisheries.disaster_reports.save_stock_losses', side_effect=RuntimeError('boom')):
            with self.assertRaises(RuntimeError):
                self.post([self.row(tilapia, p1, 300, True), self.row(tilapia, p2, 200, True)])
        self.nothing_saved()
        tilapia.refresh_from_db()
        self.assertEqual(tilapia.status, 'Stocked')
        self.assertEqual(FisheriesDisasterReportPhoto.objects.count(), 0)

    # --- Admin / Evaluator on behalf of a fisherfolk ----------------------------------------------------------
    def test_admin_logs_for_a_chosen_fisherfolk_with_the_same_rules(self):
        self.client.force_authenticate(self.admin)
        tilapia, (p1,) = self.stock(self.ff_a, self.tilapia, (300,))
        other, (q1,) = self.stock(self.ff_b, self.dalag, (100,))
        self.assertEqual(self.post([self.row(tilapia, p1, 5)]).status_code, 400)            # fisherfolk required
        mixed = self.post([self.row(tilapia, p1, 5), self.row(other, q1, 5)], fisherfolk=self.ff_a.id)
        self.assertEqual(mixed.status_code, 400)                                             # never mixed owners
        self.nothing_saved()
        r = self.post([self.row(tilapia, p1, 5)], fisherfolk=self.ff_a.id)
        self.assertEqual(r.status_code, 201, r.data)
        report = FisheriesDisasterReport.objects.get(pk=r.data['id'])
        self.assertEqual((report.reported_by_id, report.submission_status), (self.admin.id, ''))   # staff log, as before
        self.assertTrue(Notification.objects.filter(recipient=self.user_a).exists())              # owner told

    # --- stock list, older logs, PDF, single-stock endpoint ----------------------------------------------------
    def test_the_stock_list_gives_every_eligible_stock_across_pages(self):
        for i in range(12):
            self.stock(self.ff_a, self.tilapia if i % 2 else self.dalag, fingerlings=100 + i)
        self.stock(self.ff_a, self.tilapia, fingerlings=100, status='Harvested')               # not eligible
        self.stock(self.ff_b, self.tilapia, fingerlings=100)                                     # not theirs
        ids, page = [], 1
        while True:
            r = self.client.get('/api/fisheries/stocking/', {'status': 'Stocked,Near Harvest', 'page': page})
            self.assertEqual(r.status_code, 200)
            ids += [x['id'] for x in r.data['results']]
            if not r.data.get('next'):
                break
            page += 1
        self.assertEqual(len(ids), 12)
        self.assertEqual(set(StockingRecord.objects.filter(pk__in=ids).values_list('fisherfolk_id', flat=True)), {self.ff_a.id})

    def test_older_single_stock_log_without_loss_rows_still_opens_and_prints(self):
        tilapia, _ = self.stock(self.ff_a, self.tilapia, fingerlings=100)
        old = FisheriesDisasterReport.objects.create(
            stocking_record=tilapia, disaster_type='Typhoon', date_of_occurrence=timezone.localdate(),
            area_affected_ha=Decimal('0.5'), estimated_damage='old log',
        )
        doc = self.client.get(f'/api/fisheries/disaster-reports/{old.id}/').data
        self.assertEqual((doc['fingerling_losses'], doc['fingerlings_lost_total'], str(doc['area_affected_ha'])), ([], None, '0.5000'))
        self.assertEqual(doc['affected_stock']['id'], tilapia.id)
        pdf = self.client.get(f'/api/fisheries/disaster-reports/{old.id}/pdf/')
        self.assertEqual(pdf.status_code, 200)
        self.assertTrue(pdf.content.startswith(b'%PDF'))

    def test_multi_stock_pdf_renders(self):
        tilapia, (p1, p2) = self.stock(self.ff_a, self.tilapia, (300, 200))
        dalag, _ = self.stock(self.ff_a, self.dalag, fingerlings=150)
        rid = self.post([self.row(tilapia, p1, 300, True), self.row(tilapia, p2, None), self.row(dalag, None, 25)]).data['id']
        pdf = self.client.get(f'/api/fisheries/disaster-reports/{rid}/pdf/')
        self.assertEqual(pdf.status_code, 200)
        self.assertTrue(pdf.content.startswith(b'%PDF'))

    def test_single_stock_endpoint_no_longer_requires_area(self):
        tilapia, _ = self.stock(self.ff_a, self.tilapia, fingerlings=100)
        r = self.client.post(f'/api/fisheries/stocking/{tilapia.id}/disasters/', {
            'disaster_type': 'Typhoon', 'date_of_occurrence': str(timezone.localdate()), 'estimated_damage': 'x'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        r = self.client.post(f'/api/fisheries/stocking/{tilapia.id}/disasters/', {
            'disaster_type': 'Flood', 'date_of_occurrence': str(timezone.localdate()), 'estimated_damage': 'y',
            'area_affected_ha': '-1'}, format='json')
        self.assertEqual(r.status_code, 400)                                               # a sent value is still checked

    # --- optional Description of Damage ---------------------------------------------------------------------
    def test_blank_description_is_accepted_and_shown_as_not_provided(self):
        tilapia, (p1,) = self.stock(self.ff_a, self.tilapia, (300,))
        for i, blank in enumerate(('', '   ')):
            with self.subTest(blank=repr(blank)):
                r = self.post([self.row(tilapia, p1, i + 1)], estimated_damage=blank)
                self.assertEqual(r.status_code, 201, r.data)
                self.assertEqual(FisheriesDisasterReport.objects.get(pk=r.data['id']).estimated_damage, '')
        no_field = self.body([self.row(tilapia, p1, 9)])
        no_field.pop('estimated_damage')
        r = self.client.post(URL, no_field, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        doc = self.client.get(f'/api/fisheries/disaster-reports/{r.data["id"]}/').data
        self.assertEqual(doc['description'], '')
        pdf = self.client.get(f'/api/fisheries/disaster-reports/{r.data["id"]}/pdf/')
        self.assertTrue(pdf.content.startswith(b'%PDF'))
        # The "not linked to a stock" log accepts a blank description too.
        r = self.client.post('/api/monitoring/fisherfolk-disasters/', {
            'fisherfolk': self.ff_a.id, 'disaster_type': 'Typhoon', 'date_of_occurrence': str(timezone.localdate()),
            'estimated_damage': '  ', 'equipment_damaged': 'Water Pump'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)

    def test_a_provided_description_is_kept(self):
        tilapia, (p1,) = self.stock(self.ff_a, self.tilapia, (300,))
        r = self.post([self.row(tilapia, p1, 3)], estimated_damage='Dike breached at the north side')
        self.assertEqual(self.client.get(f'/api/fisheries/disaster-reports/{r.data["id"]}/').data['description'],
                         'Dike breached at the north side')

    # --- saved photos in the PDF ------------------------------------------------------------------------------
    @staticmethod
    def _images(pdf):
        import re
        return len(re.findall(rb'/Subtype\s*/Image', pdf))

    @staticmethod
    def _pages(pdf):
        import re
        return len(re.findall(rb'/Type\s*/Page(?!s)', pdf))

    def _photo(self, fmt, i):
        from PIL import Image
        buf = io.BytesIO()
        Image.new('RGB', (1600, 1200), (20 * i % 255, 90, 160)).save(buf, format=fmt)
        ext = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp'}[fmt]
        return SimpleUploadedFile(f'damage{i}.{ext}', buf.getvalue(), content_type=f'image/{"jpeg" if ext == "jpg" else ext}')

    def _log_with_photos(self, n):
        tilapia, (p1,) = self.stock(self.ff_a, self.tilapia, (300,))
        data = self.body([self.row(tilapia, p1, 5)], estimated_damage=f'with {n} photos')
        data['stock_losses'] = json.dumps(data['stock_losses'])
        if n:
            data['photos'] = [self._photo(('JPEG', 'PNG', 'WEBP')[i % 3], i) for i in range(n)]
        r = self.client.post(URL, data, format='multipart')
        self.assertEqual(r.status_code, 201, r.data)
        return r.data['id']

    def test_saved_photos_are_embedded_in_the_pdf_on_extra_pages(self):
        plain = self.client.get(f'/api/fisheries/disaster-reports/{self._log_with_photos(0)}/pdf/').content
        self.assertTrue(plain.startswith(b'%PDF'))                                 # no photos: still downloads
        rid = self._log_with_photos(10)                                           # the maximum
        self.assertEqual(len(self.client.get(f'/api/fisheries/disaster-reports/{rid}/').data['photos']), 10)
        pdf = self.client.get(f'/api/fisheries/disaster-reports/{rid}/pdf/').content
        self.assertEqual(self._images(pdf) - self._images(plain), 10)            # every saved photo is in the PDF
        self.assertGreater(self._pages(pdf), self._pages(plain))                  # continued on further pages
        self.assertIn(b'/MediaBox [ 0 0 595.2756 841.8898 ]', pdf)                # A4
        # Reopened later (a fresh request, read from storage again): same photos.
        again = self.client.get(f'/api/fisheries/disaster-reports/{rid}/pdf/').content
        self.assertEqual(self._images(again), self._images(pdf))

    def test_farmer_pdf_layout_defaults_are_unchanged(self):
        from reports.disaster_log_pdf import build_disaster_log_pdf
        pdf = build_disaster_log_pdf(title='FARMER DISASTER REPORT', header_rows=[('Reference No.', 'X')],
                                     sections=[{'title': 'FARMER', 'rows': [('Name', 'Juan')]}],
                                     photo_paths=[], reference='X', pdf_title='X')
        self.assertIn(b'/MediaBox [ 0 0 612 792 ]', pdf)                          # still US Letter

    def test_unlinked_equipment_log_is_unchanged(self):
        # A disaster can only be logged by a fisherfolk with a pond or cage on record (our eligibility rule).
        Pond.objects.create(fisherfolk=self.ff_a, name='Pond 1')
        r = self.client.post('/api/monitoring/fisherfolk-disasters/', {
            'fisherfolk': self.ff_a.id, 'disaster_type': 'Typhoon', 'date_of_occurrence': str(timezone.localdate()),
            'estimated_damage': 'Pump lost', 'equipment_damaged': 'Water Pump'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        report = FisheriesDisasterReport.objects.get(pk=r.data['id'])
        self.assertIsNone(report.stocking_record_id)
        self.assertFalse(report.stock_losses.exists())
        self.assertEqual(self.client.get(f'/api/fisheries/disaster-reports/{report.id}/').data['fingerling_losses'], [])
