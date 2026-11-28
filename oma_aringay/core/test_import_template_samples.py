"""Every import template shows a labelled sample fill-up at its top, and that sample is never taken for a record.

Row 1 says it is a sample, row 2 how to fill the file in, row 3 holds the column headings, row 4 is the sample (yellow, with an Excel
comment) and the person types from row 5. A file made with the old templates (headings on row 1, sample on row 2, the note on row 4)
still imports as before."""
import csv
import io

import openpyxl
from django.core.files.uploadedfile import SimpleUploadedFile

from core.exports import SafeWorkbook
from farmers.rsbsa_import import EXPECTED_HEADERS_V1, EXPECTED_HEADERS_V2

from .test_import_templates import TemplateSetup

XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
BANNER_START = 'SAMPLE FILL-UP ONLY'
COMMENT_START = 'Sample fill-up only.'
# what each preview answers its records under; a row it refuses is also listed in `errors`
RESULT_KEYS = ('rows', 'crops', 'machinery')


def upload(book_or_bytes, name='file.xlsx'):
    if isinstance(book_or_bytes, bytes):
        return SimpleUploadedFile(name, book_or_bytes, content_type=XLSX)
    stream = io.BytesIO()
    book_or_bytes.save(stream)
    return SimpleUploadedFile(name, stream.getvalue(), content_type=XLSX)


def book_of(rows):
    book = SafeWorkbook()
    for row in rows:
        book.active.append(row)
    return book


def values(sheet, number):
    return [c.value for c in sheet[number]]


def trimmed(cells):
    """A row without the empty cells a merged note leaves at its end."""
    cells = list(cells)
    while cells and cells[-1] in (None, ''):
        cells.pop()
    return cells


def records(response):
    """Every record a preview saw: the ones it lists and the ones it refused."""
    data = response.json()
    listed = next((data[k] for k in RESULT_KEYS if k in data), [])
    return list(listed) + ([e for e in data.get('errors', [])] if 'rows' not in data else [])


class SampleFillUpTests(TemplateSetup):
    def pairs(self):
        o = self.farmers_org.id
        return {
            **super().pairs(),
            'farm parcels of many farmers': ('/api/farmers/parcels/bulk-import/template/', '/api/farmers/parcels/bulk-import/'),
            'crops planted on a parcel': ('/api/farmers/parcel-crop-records/template/', '/api/farmers/parcel-crop-records/parse/'),
            'machinery': ('/api/farmers/parcel-machinery/template/', '/api/farmers/parcel-machinery/parse/'),
        }

    def layout_only(self):
        """The registration form's templates (the cooperative does not exist yet): the same files, no importer of their own."""
        return {
            f'{domain} registration {what}': f'/api/organizations/{domain}/{what}/import/template/'
            for domain in ('farmers', 'fisherfolk') for what in ('members', 'equipment')
        }

    def sheet(self, url):
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200, f'{url}: {res.status_code}')
        return openpyxl.load_workbook(io.BytesIO(res.content)).worksheets[0], res.content

    def post(self, url, file):
        return self.client.post(url, {'file': file, 'dry_run': 'true'}, format='multipart')

    def test_every_template_shows_a_labelled_sample_at_its_top(self):
        templates = {**{name: pair[0] for name, pair in self.pairs().items()}, **self.layout_only()}
        for name, url in templates.items():
            with self.subTest(name):
                sheet, _ = self.sheet(url)
                self.assertTrue(str(sheet['A1'].value or '').startswith(BANNER_START), sheet['A1'].value)
                note = str(sheet['A2'].value or '')
                self.assertGreater(len(note), 20, 'row 2 says how to fill the file in')
                self.assertNotIn('Delete the sample row', note)
                headings = trimmed(values(sheet, 3))
                self.assertTrue(headings and all(headings), f'row 3 holds the headings: {headings}')
                self.assertTrue(any(v not in (None, '') for v in values(sheet, 4)), 'row 4 is the sample')
                for column in range(1, len(headings) + 1):
                    self.assertTrue(sheet.cell(row=4, column=column).fill.start_color.rgb.endswith('FFF2CC'), f'column {column} is yellow')
                    self.assertTrue(sheet.cell(row=3, column=column).fill.start_color.rgb.endswith('1E4620'), f'column {column} heading')
                comment = sheet['A4'].comment
                self.assertTrue(comment and comment.text.startswith(COMMENT_START), 'the sample carries an Excel comment')
                self.assertEqual(sheet.max_row, 4, 'nothing below the sample: the person types from row 5')

    def test_a_file_made_with_the_old_layout_still_adds_nothing_extra(self):
        for name, (template_url, import_url) in self.pairs().items():
            with self.subTest(name):
                sheet, _ = self.sheet(template_url)
                headings = trimmed(values(sheet, 3))
                sample = values(sheet, 4)[:len(headings)]
                old = book_of([headings, sample, [], [sheet['A2'].value]])
                res = self.post(import_url, upload(old))
                self.assertEqual(res.status_code, 200, f'{name}: {res.content[:300]}')
                self.assertEqual(records(res), [], name)

    def changed_copy(self, template_url, target_row):
        """The template with the sample, one cell different, written on `target_row`."""
        res = self.client.get(template_url)
        book = openpyxl.load_workbook(io.BytesIO(res.content))
        sheet = book.worksheets[0]
        headings = trimmed(values(sheet, 3))
        row = [sheet.cell(row=4, column=c).value for c in range(1, len(headings) + 1)]
        last = max(i for i, v in enumerate(row) if v not in (None, ''))
        row[last] = f'{row[last]} changed'
        for column, value in enumerate(row, 1):
            sheet.cell(row=target_row, column=column, value=value)
        return upload(book)

    def test_a_sample_row_typed_over_is_read_as_a_record(self):
        for name, (template_url, import_url) in self.pairs().items():
            with self.subTest(name):
                res = self.post(import_url, self.changed_copy(template_url, 4))
                self.assertIn(res.status_code, (200, 400), res.content[:300])
                self.assertEqual(len(records(res)), 1, f'{name}: {res.content[:300]}')

    def test_a_record_typed_under_the_sample_is_read_as_row_5(self):
        for name, (template_url, import_url) in self.pairs().items():
            with self.subTest(name):
                res = self.post(import_url, self.changed_copy(template_url, 5))
                self.assertIn(res.status_code, (200, 400), res.content[:300])
                found = records(res)
                self.assertEqual(len(found), 1, f'{name}: {res.content[:300]}')
                if 'row' in found[0]:
                    self.assertEqual(found[0]['row'], 5, name)


class RegistrySampleTests(TemplateSetup):
    """The RSBSA registry import: the same layout, and the office's raw export (headings on row 1) keeps working."""
    URL = '/api/farmers/rsbsa-import/template/'
    PREVIEW = '/api/farmers/rsbsa-import/preview/'

    def template(self):
        res = self.client.get(self.URL)
        self.assertEqual(res.status_code, 200)
        return openpyxl.load_workbook(io.BytesIO(res.content))

    def person(self, headers=EXPECTED_HEADERS_V2):
        row = {h: '' for h in headers}
        row.update({'rsbsa_no': '01-033-02-019-961111', 'first_name': 'Pedro', 'last_name': 'Reyes', 'farmer_address_bgy': 'Alaska',
                    'birthday': '1975-05-05', 'gender': 'Male', 'farmer': 'YES', 'farmworker': 'NO', 'fisherfolk': 'NO'})
        return [row[h] for h in headers]

    def preview(self, file):
        return self.client.post(self.PREVIEW, {'file': file}, format='multipart')

    def one_row(self, res, number):
        self.assertEqual(res.status_code, 200, res.content[:300])
        rows = res.json()['rows']
        self.assertEqual([(r['row_number'], r['rsbsa_number']) for r in rows], [(number, '01-033-02-019-961111')])

    def test_it_shows_a_labelled_sample_at_its_top(self):
        sheet = self.template().worksheets[0]
        self.assertTrue(str(sheet['A1'].value).startswith(BANNER_START))
        self.assertGreater(len(str(sheet['A2'].value or '')), 20)
        self.assertEqual(trimmed(values(sheet, 3)), EXPECTED_HEADERS_V2)
        self.assertTrue(sheet['A4'].comment and sheet['A4'].comment.text.startswith(COMMENT_START))
        self.assertTrue(sheet['A4'].fill.start_color.rgb.endswith('FFF2CC'))
        self.assertEqual(sheet.max_row, 4)

    def test_the_untouched_template_holds_nothing_to_import(self):
        res = self.preview(upload(self.template()))
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn('valid header row but no data rows', res.json()['detail'])

    def test_a_row_typed_under_the_sample_is_read_as_row_5(self):
        book = self.template()
        sheet = book.worksheets[0]
        for column, value in enumerate(self.person(), 1):
            sheet.cell(row=5, column=column, value=value)
        self.one_row(self.preview(upload(book)), 5)

    def test_the_same_file_saved_as_csv_is_read(self):
        sheet = self.template().worksheets[0]
        width = len(EXPECTED_HEADERS_V2)
        text = io.StringIO()
        writer = csv.writer(text)
        for number in range(1, 5):
            writer.writerow(['' if sheet.cell(row=number, column=c).value is None else sheet.cell(row=number, column=c).value
                             for c in range(1, width + 1)])
        writer.writerow(self.person())
        self.one_row(self.preview(SimpleUploadedFile('file.csv', text.getvalue().encode(), content_type='text/csv')), 5)

    def test_the_offices_raw_export_with_headings_on_row_1_still_reads(self):
        for headers in (EXPECTED_HEADERS_V2, EXPECTED_HEADERS_V1):
            with self.subTest(len(headers)):
                self.one_row(self.preview(upload(book_of([headers, self.person(headers)]))), 2)
        text = io.StringIO()
        csv.writer(text).writerows([EXPECTED_HEADERS_V2, self.person()])
        self.one_row(self.preview(SimpleUploadedFile('export.csv', text.getvalue().encode(), content_type='text/csv')), 2)

    def test_other_headings_are_still_refused(self):
        res = self.preview(upload(book_of([['name', 'barangay'], ['Pedro', 'Alaska']])))
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn('do not match', res.json()['detail'])

