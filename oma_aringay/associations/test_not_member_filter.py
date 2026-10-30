"""The Add Members table of the organization forms lists only people who are not already members of that organization:
?not_member_of=<organization id> on the farmers and fisherfolk lists."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from associations.test_member_import import add_member, make_org, make_person

LISTS = {'farmers': '/api/farmers/', 'fisherfolk': '/api/fisheries/fisherfolk/'}


class NotMemberFilterTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='nm-adm', password='pw', role='ADMIN', email='nm@x.test')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def ids(self, domain, **params):
        data = self.client.get(LISTS[domain], params).json()
        return {row['id'] for row in (data['results'] if isinstance(data, dict) else data)}

    def test_only_people_who_are_not_members_of_that_organization_are_listed(self):
        for domain in ('farmers', 'fisherfolk'):
            org, other = make_org(domain), make_org(domain)
            member, ex_member, in_other, nobody = (make_person(domain) for _ in range(4))
            add_member(domain, org, member)
            add_member(domain, org, ex_member, is_active=False)     # left the organization: can join again
            add_member(domain, other, in_other)                      # a member elsewhere only: still available here
            shown = self.ids(domain, not_member_of=org.id)
            self.assertNotIn(member.id, shown, domain)
            self.assertTrue({ex_member.id, in_other.id, nobody.id} <= shown, domain)
            self.assertIn(member.id, self.ids(domain), domain)       # without the filter everyone is listed

    def test_it_combines_with_the_search(self):
        org = make_org('farmers')
        member, other = make_person('farmers'), make_person('farmers')
        add_member('farmers', org, member)
        self.assertEqual(self.ids('farmers', not_member_of=org.id, search=other.first_name), {other.id})
        self.assertNotIn(member.id, self.ids('farmers', not_member_of=org.id, search=member.first_name))

    def test_a_bad_organization_id_is_ignored_not_a_crash(self):
        make_person('farmers')
        self.assertEqual(self.client.get(LISTS['farmers'], {'not_member_of': 'abc'}).status_code, 200)
