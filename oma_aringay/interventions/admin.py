from django.contrib import admin
from .models import BeneficiaryRecord

@admin.register(BeneficiaryRecord)
class BeneficiaryRecordAdmin(admin.ModelAdmin):
    # Only use 'id' to clear system checks cleanly
    list_display = ('id',)