"""Undo rules specific to the organizations an import created: the login the import made for the organization goes with
it, but only if nobody ever used that login. (Registered once, from AssociationsConfig.ready.)"""
from accounts.models import User, UserLinkedRecord
from core.import_undo import dependents, register_cleanup

KIND = {
    'associations.farmersorganization': User.LinkedRecordType.FARMERS_ORG,
    'associations.fisherfolkorganization': User.LinkedRecordType.FISHERFOLK_ORG,
}


def _logins(label, org):
    """The accounts linked ONLY to this organization (an account shared with another record is never touched)."""
    users = []
    for link in UserLinkedRecord.objects.filter(record_type=KIND[label], record_id=org.id).select_related('user'):
        shared = UserLinkedRecord.objects.filter(user=link.user).exclude(pk=link.pk).exists()
        if not shared:
            users.append(link.user)
    return users


def _check(label):
    def check(org):
        for login in _logins(label, org):
            if login.last_login is not None:
                return 'Its login was already used.'
            if [d for d in dependents(login) if d != 'UserLinkedRecord']:
                return 'Its login has data attached.'
        return None
    return check


def _before_delete(label):
    def before_delete(org, user):
        for login in _logins(label, org):
            login.delete()
    return before_delete


def register():
    for label in KIND:
        register_cleanup(label, check=_check(label), before_delete=_before_delete(label))
