"""One extra rule on top of DRF's standard error handling."""
from django.db.models import ProtectedError, RestrictedError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    """A delete that the database refuses because other records still point at the row is the caller's conflict to
    sort out, not a server fault: answer 409 with what is in the way instead of a 500."""
    if isinstance(exc, (ProtectedError, RestrictedError)):
        blockers = sorted({str(obj._meta.verbose_name_plural) for obj in (getattr(exc, 'protected_objects', None) or getattr(exc, 'restricted_objects', None) or [])})
        detail = 'This record cannot be deleted because other records still depend on it'
        detail += f' ({", ".join(blockers)}). Remove or reassign those first.' if blockers else '. Remove or reassign those first.'
        return Response({'detail': detail}, status=status.HTTP_409_CONFLICT)
    return exception_handler(exc, context)
