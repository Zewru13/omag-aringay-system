from rest_framework import serializers

from auditlog.models import AuditLogEntry


class AuditLogEntrySerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()

    class Meta:
        model = AuditLogEntry
        fields = ['id', 'user', 'action', 'model_name', 'object_repr', 'timestamp']

    def get_user(self, obj):
        if obj.user is None:
            return {'full_name': 'System', 'email': ''}
        return {
            'full_name': obj.user.full_name or obj.user.email,
            'email': obj.user.email,
        }
