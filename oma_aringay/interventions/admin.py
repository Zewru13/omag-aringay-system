from django.contrib import admin
from .models import InterventionProgram, BeneficiaryRecord

@admin.register(InterventionProgram)
class InterventionProgramAdmin(admin.ModelAdmin):
    # Only use 'id' to avoid schema property mismatch issues
    list_display = ('id',) 

@admin.register(BeneficiaryRecord)
class BeneficiaryRecordAdmin(admin.ModelAdmin):
    # Only use 'id' to clear system checks cleanly
    list_display = ('id',)