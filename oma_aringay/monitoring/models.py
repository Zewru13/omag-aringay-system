from django.conf import settings
from django.db import models

from farmers.models import Farmer


class FarmVisit(models.Model):
    farmer = models.ForeignKey(
        Farmer,
        on_delete=models.CASCADE,
        related_name='farm_visits',
    )
    visit_date = models.DateField()
    next_visit_date = models.DateField(null=True, blank=True)
    purpose = models.CharField(max_length=200)
    notes = models.TextField(blank=True)
    conducted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='conducted_farm_visits',
    )
    date_recorded = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Visit to {self.farmer} on {self.visit_date}'



