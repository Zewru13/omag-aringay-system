"""A refresh token works once. Using it hands back a new one and kills the old, so a copied token cannot be replayed."""
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

REFRESH = '/api/accounts/token/refresh/'


class TokenRotationTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='rot-user', password='pw', role='CITIZEN')
        self.client = APIClient()

    def refresh(self, token):
        return self.client.post(REFRESH, {'refresh': str(token)}, format='json')

    def test_refreshing_returns_a_new_refresh_token(self):
        first = RefreshToken.for_user(self.user)
        response = self.refresh(first)
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.json())
        self.assertIn('refresh', response.json())
        self.assertNotEqual(response.json()['refresh'], str(first))

    def test_the_used_refresh_token_cannot_be_used_again(self):
        first = RefreshToken.for_user(self.user)
        newer = self.refresh(first).json()['refresh']
        self.assertEqual(self.refresh(first).status_code, 401)        # a replay of the copied token
        self.assertEqual(self.refresh(newer).status_code, 200)        # the real one carries on

    def test_the_new_access_token_works(self):
        access = self.refresh(RefreshToken.for_user(self.user)).json()['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        self.assertEqual(self.client.get('/api/accounts/me/').status_code, 200)

    def test_access_tokens_are_short_lived(self):
        self.assertLessEqual(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'], timedelta(minutes=15))
        self.assertTrue(settings.SIMPLE_JWT['ROTATE_REFRESH_TOKENS'])
        self.assertTrue(settings.SIMPLE_JWT['BLACKLIST_AFTER_ROTATION'])
