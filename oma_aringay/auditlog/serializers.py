from rest_framework import serializers

from auditlog.models import AuditLogEntry
from auditlog.system_user import SYSTEM_AUTOMATION_USER_EMAIL


class AuditLogEntrySerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()

    class Meta:
        model = AuditLogEntry
        fields = ['id', 'user', 'action', 'model_name', 'object_repr', 'timestamp']

    def get_user(self, obj):
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
