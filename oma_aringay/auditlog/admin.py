from django.contrib import admin

from auditlog.models import AuditLogEntry


@admin.register(AuditLogEntry)
class AuditLogEntryAdmin(admin.ModelAdmin):
    list_display = ['timestamp', 'user', 'action', 'model_name', 'object_repr']
    list_filter = ['action', 'model_name']
    search_fields = ['object_repr', 'user__email']
    readonly_fields = ['user', 'action', 'model_name', 'object_repr', 'timestamp']
