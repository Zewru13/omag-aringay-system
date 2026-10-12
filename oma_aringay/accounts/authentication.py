from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication


class OptionalJWTAuthentication(JWTAuthentication):
    """Signs the caller in when a valid token came with the request, and treats a missing, stale or invalid token as
    "not signed in" instead of rejecting the request - for public pages that give a signed-in admin more detail (the
    login page can still send an old token left in the browser)."""

    def authenticate(self, request):
        try:
            return super().authenticate(request)
        except AuthenticationFailed:
            return None
