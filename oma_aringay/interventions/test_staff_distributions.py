"""Staff see assistance as distributions (one row per distribution, named after the organization or "individual", expandable to its
members), and give assistance to several selected farmers / fisherfolk in one request (one distribution)."""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from interventions.models import BeneficiaryRecord, FisherfolkBeneficiaryRecord
from interventions.test_distribution_history import DOMAINS, make_citizen, make_org, make_person

User = get_user_model()
TODAY = date.today()

URLS = {
    'farmers': dict(list='/api/interventions/beneficiaries/distributions/', bulk='/api/interventions/beneficiaries/adhoc/bulk/', ids='farmer_ids'),
    'fisherfolk': dict(list='/api/interventions/fisherfolk-beneficiaries/distributions/', bulk='/api/interventions/fisherfolk-beneficiaries/adhoc/bulk/', ids='fisherfolk_ids'),
}


def shared(domain, **over):
    data = {'assistance_type': DOMAINS[domain]['type'], 'source_agencies': ['DA'], 'date_given': TODAY.isoformat(), 'quantity': '2 sacks'}
    data.update(over)
    return data


class StaffDistributionTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = User.objects.create_user(username='sd-admin', password='pw', role='ADMIN', email='sd@x.test')

    def setUp(self):
        self.client.force_authenticate(self.staff)

    def bulk(self, domain, people, **over):
        body = shared(domain, **{URLS[domain]['ids']: [p.id for p in people]}, **over)
        return self.client.post(URLS[domain]['bulk'], body, format='json')

    # ── giving assistance to several selected people at once ────────────────

    def test_several_people_get_one_distribution(self):
        for domain in DOMAINS:
            people = [make_person(domain, 'Ana'), make_person(domain, 'Ben')]
            r = self.bulk(domain, people)
            self.assertEqual(r.status_code, 200, (domain, r.content))
            self.assertEqual([x['status'] for x in r.json()['results']], ['created', 'created'], domain)
            records = DOMAINS[domain]['record'].objects.filter(**{f"{DOMAINS[domain]['person_field']}__in": people})
            self.assertEqual(records.count(), 2, domain)
            self.assertEqual(len({rec.distribution_batch for rec in records}), 1, domain)
            self.assertTrue(all(rec.distribution_batch for rec in records), domain)
            self.assertEqual({rec.recorded_by_id for rec in records}, {self.staff.id}, domain)
            row = r.json()['results'][0]
            self.assertEqual(set(['person_id', 'name', 'id_number', 'barangay', 'record_id']) - set(row), set(), domain)

    def test_a_preview_saves_nothing(self):
        for domain in DOMAINS:
            people = [make_person(domain, 'Cora')]
            r = self.bulk(domain, people, dry_run=True)
            self.assertEqual(r.status_code, 200, (domain, r.content))
            self.assertEqual([x['status'] for x in r.json()['results']], ['would_create'], domain)
            self.assertFalse(DOMAINS[domain]['record'].objects.exists(), domain)

    def test_a_bad_person_is_reported_and_the_rest_are_saved(self):
        for domain in DOMAINS:
            person = make_person(domain, 'Dan')
            body = shared(domain, **{URLS[domain]['ids']: [person.id, 99999999]})
            r = self.client.post(URLS[domain]['bulk'], body, format='json')
            self.assertEqual(r.status_code, 200, (domain, r.content))
            self.assertEqual([x['status'] for x in r.json()['results']], ['created', 'error'], domain)
            self.assertEqual(DOMAINS[domain]['record'].objects.count(), 1, domain)

    def test_the_assistance_is_checked_like_any_other_record(self):
        for domain in DOMAINS:
            person = make_person(domain, 'Eve')
            r = self.bulk(domain, [person], assistance_type='Nonsense')
            self.assertEqual(r.status_code, 400, (domain, r.content))
            r = self.bulk(domain, [person], date_given=(TODAY - timedelta(days=3)).isoformat())
            self.assertEqual(r.status_code, 400, (domain, r.content))
            self.assertFalse(DOMAINS[domain]['record'].objects.exists(), domain)

    def test_nobody_chosen_is_refused(self):
        for domain in DOMAINS:
            r = self.client.post(URLS[domain]['bulk'], shared(domain, **{URLS[domain]['ids']: []}), format='json')
            self.assertEqual(r.status_code, 400, (domain, r.content))

    def test_an_organization_gives_only_to_its_own_members(self):
        for domain, cfg in DOMAINS.items():
            org = make_org(cfg['org'], 'Own Org')
            member, outsider = make_person(domain, 'Gus'), make_person(domain, 'Hal')
            cfg['member'].objects.create(organization=org, **{cfg['person_field']: member}, date_joined=date(2022, 1, 1))
            self.client.force_authenticate(make_citizen(f'sd-org-{domain}', cfg['link'], org.id))
            r = self.bulk(domain, [member, outsider])
            self.assertEqual(r.status_code, 200, (domain, r.content))
            self.assertEqual([x['status'] for x in r.json()['results']], ['created', 'error'], domain)
            self.client.force_authenticate(self.staff)

    def test_a_farmer_account_cannot_give_assistance(self):
        citizen = User.objects.create_user(username='sd-cit', password='pw', role='CITIZEN', email='sdc@x.test')
        self.client.force_authenticate(citizen)
        person = make_person('farmers', 'Ivy')
        self.assertIn(self.bulk('farmers', [person]).status_code, (401, 403))

    # ── the table staff see ──────────────────────────────────────────────────

    def test_distributions_are_named_after_the_organization_or_have_none(self):
        for domain, cfg in DOMAINS.items():
            org = make_org(cfg['org'], 'Named Org')
            members = [make_person(domain, 'Jo'), make_person(domain, 'Kim')]
            for m in members:
                cfg['member'].objects.create(organization=org, **{cfg['person_field']: m}, date_joined=date(2022, 1, 1))
            r = self.client.post(cfg['distribute'].format(org.id), shared(domain), format='json')
            self.assertEqual(r.status_code, 200, (domain, r.content))
            self.bulk(domain, [make_person(domain, 'Lee'), make_person(domain, 'Moe'), make_person(domain, 'Ned')], assistance_type=cfg['other_type'])
            data = self.client.get(URLS[domain]['list']).json()
            self.assertEqual(data['count'], 2, domain)
            by_org = {g['organization_name']: g for g in data['results']}
            self.assertEqual(set(by_org), {org.name, None}, domain)
            self.assertEqual(by_org[org.name]['member_count'], 2, domain)
            self.assertEqual(by_org[None]['member_count'], 3, domain)
            self.assertEqual(by_org[None]['assistance_type'], cfg['other_type'], domain)
            member = by_org[org.name]['members'][0]
            self.assertEqual({'record_id', 'person_id', 'name', 'status', 'barangay'} - set(member), set(), domain)
            self.assertEqual(member['barangay'], 'Alaska', domain)
            DOMAINS[domain]['record'].objects.all().delete()

    def test_the_table_is_paged_and_newest_first(self):
        domain = 'farmers'
        for i in range(12):
            self.bulk(domain, [make_person(domain, f'Pg{i}')], date_given=(TODAY + timedelta(days=i)).isoformat())
        first = self.client.get(URLS[domain]['list']).json()
        self.assertEqual((first['count'], len(first['results'])), (12, 10))
        self.assertEqual(first['results'][0]['date_given'], (TODAY + timedelta(days=11)).isoformat())
        second = self.client.get(URLS[domain]['list'], {'page': 2}).json()
        self.assertEqual(len(second['results']), 2)

    def test_the_table_filters_by_year_barangay_and_status(self):
        domain = 'farmers'
        alaska, other = make_person(domain, 'Flt'), make_person(domain, 'Oth')
        other.barangay = 'Baracbac'
        other.save()
        self.bulk(domain, [alaska, other])
        BeneficiaryRecord.objects.filter(farmer=other).update(status='NOT_RECEIVED')
        url = URLS[domain]['list']
        self.assertEqual(self.client.get(url, {'barangay': 'Baracbac'}).json()['results'][0]['member_count'], 1)
        self.assertEqual(self.client.get(url, {'year': TODAY.year}).json()['results'][0]['member_count'], 2)
        self.assertEqual(self.client.get(url, {'year': TODAY.year - 5}).json()['count'], 0)
        followup = self.client.get(url, {'status': 'NOT_RECEIVED'}).json()
        self.assertEqual([m['name'] for g in followup['results'] for m in g['members']], [other.full_name])

    def test_only_staff_see_the_table(self):
        citizen = User.objects.create_user(username='sd-cit2', password='pw', role='CITIZEN', email='sdc2@x.test')
        self.client.force_authenticate(citizen)
        for domain in URLS:
            self.assertIn(self.client.get(URLS[domain]['list']).status_code, (401, 403))

    def test_an_organization_distribution_result_carries_the_barangay(self):
        for domain, cfg in DOMAINS.items():
            org = make_org(cfg['org'], 'Brg Org')
            member = make_person(domain, 'Pat')
            cfg['member'].objects.create(organization=org, **{cfg['person_field']: member}, date_joined=date(2022, 1, 1))
            r = self.client.post(cfg['distribute'].format(org.id), shared(domain, dry_run=True), format='json')
            self.assertEqual(r.json()['results'][0]['barangay'], 'Alaska', domain)
