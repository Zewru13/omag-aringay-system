from rest_framework import serializers

from auditlog.models import AuditLogEntry
from auditlog.system_user import SYSTEM_AUTOMATION_USER_EMAIL


STAFF_KINDS = {'ADMIN': 'Admin', 'EVALUATOR': 'Focal Person'}
CITIZEN_KINDS = {'FARMER': 'Farmer', 'FISHERFOLK': 'Fisherfolk', 'FARMERS_ORG': 'Cooperative', 'FISHERFOLK_ORG': 'Cooperative'}


def _kind_of_account(user):
    """What the account is, as shown under the name: '' when it is gone or cannot be told."""
    if user is None:
        return ''
    if user.role in STAFF_KINDS:
        return STAFF_KINDS[user.role]
    links = list(user.linked_records.all())     # prefetched by the list
    link = next((row for row in links if row.is_active), links[0] if len(links) == 1 else None)
    return CITIZEN_KINDS.get(link.record_type if link else user.linked_record_type, '')


class AuditLogEntrySerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()

    class Meta:
        model = AuditLogEntry
        fields = ['id', 'user', 'action', 'module', 'model_name', 'object_repr', 'details', 'timestamp']

    def get_user(self, obj):
        who = self._who(obj)
        return {**who, 'role': '' if who['is_system'] else _kind_of_account(obj.user)}

    def _who(self, obj):
        # The name kept on the entry is the one that did it, even after a restore removed or replaced that account.
        if obj.user_name:
            return {'full_name': obj.user_name, 'email': obj.user_email, 'is_system': obj.user_email == SYSTEM_AUTOMATION_USER_EMAIL}
        # obj.user is None only for entries predating this fallback (the
        # FK is SET_NULL) or a deleted system account — real going-forward
        # non-request saves now attribute to the system account itself
        # (matched below by its known email), not to a null user.
        if obj.user is None:
            return {'full_name': 'System', 'email': '', 'is_system': True}
        return {
            'full_name': obj.user.full_name or obj.user.email,
            'email': obj.user.email,
            'is_system': obj.user.email == SYSTEM_AUTOMATION_USER_EMAIL,
        }
