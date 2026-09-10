from accounts.models import User

# The real, identifiable account audit entries attribute to when a save
# happens outside a real HTTP request (a management command, a shell
# script, a one-off investigation script) — get_current_user() has no
# thread-local user to read in that case (see auditlog/middleware.py,
# which only ever populates it from inside CurrentUserMiddleware). A real
# account, not user=None, so these entries stay clearly, honestly
# attributed rather than reading as anonymous — or worse, silently not
# existing at all, which was the actual bug (see auditlog/signals.py's
# _log()). Mirrors farmers.rsbsa_import.IMPORT_SYSTEM_USER_EMAIL's
# established shape (inactive, unusable password, staff=False) — that
# account stays scoped to its own import command's Farmer/Fisherfolk
# `registered_by` field, unrelated to this audit-log mechanism; this one
# is the audit system's own general-purpose fallback, covering every
# model it logs, not just RSBSA imports.
SYSTEM_AUTOMATION_USER_EMAIL = 'system-automation@internal.local'


def get_system_user():
    """Get-or-create the shared system/automation account, and return it."""
    user, created = User.objects.get_or_create(
        email=SYSTEM_AUTOMATION_USER_EMAIL,
        defaults={
            'username': SYSTEM_AUTOMATION_USER_EMAIL,
            'full_name': 'System / Automation',
            'role': User.Roles.ADMIN,
            'is_active': False,
            'is_staff': False,
        },
    )
    if created:
        user.set_unusable_password()
        user.save(update_fields=['password'])
    return user
