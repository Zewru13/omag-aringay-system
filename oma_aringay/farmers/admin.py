from django.contrib import admin

# Register your models here.
from django.contrib import admin
from .models import Farmer  # Adjust to match your exact Farmer model class name

@admin.register(Farmer)
class FarmerAdmin(admin.ModelAdmin):
    list_display = ('id', 'first_name', 'last_name', 'rsbsa_number') # Adjust fields to match your model