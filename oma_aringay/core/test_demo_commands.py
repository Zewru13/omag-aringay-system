"""The demo-data commands still run against the current models (they had drifted: seed_data used fields that no longer exist, and the
fisheries demo command filtered on a removed `program` field).

Run ONLY against an isolated test database (never the shared Supabase database)."""
import os
from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from farmers.models import Farmer
from fisheries.models import Fisherfolk
from interventions.models import FisherfolkBeneficiaryRecord


def run(name, *args):
    out = StringIO()
    call_command(name, *args, stdout=out)
    return out.getvalue()


class SeedDataTests(TestCase):
    ENV = {'SEED_ADMIN_PASSWORD': 'Demo#Admin-1x', 'SEED_EVAL_PASSWORD': 'Demo#Eval-1x'}

    def test_it_creates_the_admin_and_the_evaluator_and_nothing_else(self):
        with mock.patch.dict(os.environ, self.ENV):
            run('seed_data')
        User = get_user_model()
        self.assertEqual(User.objects.get(email='admin@omaaringay.gov.ph').role, 'ADMIN')
        self.assertEqual(User.objects.get(email='evaluator@omaaringay.gov.ph').role, 'EVALUATOR')
        self.assertFalse(Farmer.objects.exists(), 'the demo records come from the seed_demo_data commands')
        self.assertFalse(Fisherfolk.objects.exists())

    def test_running_it_again_changes_nothing(self):
        with mock.patch.dict(os.environ, self.ENV):
            run('seed_data')
            second = run('seed_data')
        self.assertIn('already exists', second)
        self.assertEqual(get_user_model().objects.filter(email__in=['admin@omaaringay.gov.ph', 'evaluator@omaaringay.gov.ph']).count(), 2)

    def test_it_refuses_to_make_a_privileged_account_without_a_password_outside_debug(self):
        from django.core.management.base import CommandError
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop('SEED_ADMIN_PASSWORD', None)
            with self.assertRaises(CommandError):
                run('seed_data')


class SeedFisheriesDemoTests(TestCase):
    def test_it_seeds_the_fisheries_demo_data_and_skips_what_is_already_there(self):
        get_user_model().objects.create_user(username='demo-admin', password='pw', role='ADMIN', email='demo-admin@x.test')   # the command files things under a user
        first = run('seed_fisheries_demo_data')
        self.assertEqual(Fisherfolk.objects.filter(rsbsa_number__startswith='01-33-02-999-').count(), 15)
        self.assertEqual(FisherfolkBeneficiaryRecord.objects.count(), 3, first[-400:])
        second = run('seed_fisheries_demo_data')
        self.assertEqual(Fisherfolk.objects.filter(rsbsa_number__startswith='01-33-02-999-').count(), 15, 'not duplicated')
        self.assertEqual(FisherfolkBeneficiaryRecord.objects.count(), 3)
        self.assertIn('already', second.lower())
