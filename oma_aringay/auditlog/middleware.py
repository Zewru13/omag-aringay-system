import threading

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken, TokenError

_thread_locals = threading.local()

_jwt_auth = JWTAuthentication()


class CurrentUserMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = None

        # Session-authenticated requests (browseable API, admin panel)
        if getattr(request, 'user', None) and request.user.is_authenticated:
            user = request.user
        else:
            # JWT Bearer token (React frontend) — DRF only decodes this inside
            # view processing, so we must decode it manually here so signals
            # fired during the request can read the correct user.
            try:
                result = _jwt_auth.authenticate(request)
                if result is not None:
                    user, _ = result
            except (InvalidToken, TokenError, AuthenticationFailed, Exception):
                pass

        _thread_locals.user = user
        # Imported here: both read get_current_user from this module.
        from auditlog import capture, recorder
        collector = capture.begin(request) if request.method in recorder.WRITE_METHODS else None
        try:
            try:
                response = self.get_response(request)
            finally:
                capture.end()
            # The one entry of what a staff member changed or downloaded.
            recorder.record_request(request, response, collector)
        finally:
            _thread_locals.user = None

        return response


def get_current_user():
    return getattr(_thread_locals, 'user', None)
