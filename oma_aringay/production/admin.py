from django.contrib import admin

from .models import DisasterResponseRule


@admin.register(DisasterResponseRule)
class DisasterResponseRuleAdmin(admin.ModelAdmin):
    list_display = ['disaster_type', 'crop_type', 'priority', 'title']
    list_filter  = ['disaster_type', 'priority', 'crop_type']
    search_fields = ['title', 'action']
