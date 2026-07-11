from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            'id', 'actor', 'actor_name', 'verb', 'record_type', 'record_id',
            'record_label', 'detail', 'is_read', 'created_at',
        ]

    def get_actor_name(self, obj):
        if obj.actor:
            return obj.actor.full_name or obj.actor.email
        return 'System'
