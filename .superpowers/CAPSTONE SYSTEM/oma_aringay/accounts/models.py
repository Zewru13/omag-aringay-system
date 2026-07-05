from django.db import models  # <-- MAKE SURE THIS LINE IS PRESENT!
from django.contrib.auth.models import AbstractUser

class User(AbstractUser):
    class Roles(models.TextChoices):
        ADMIN = 'ADMIN', 'Admin'
        EVALUATOR = 'EVALUATOR', 'Evaluator'
        # Citizens are unauthenticated public viewers in your scope,
        # but can add them here if plan to give them accounts later.

    email = models.EmailField(unique=True)

    role = models.CharField(
        max_length=20,
        choices=Roles.choices,
        default=Roles.EVALUATOR
    )
    full_name = models.CharField(max_length=150, blank=True, default='')
    contact_number = models.CharField(max_length=20, blank=True)

    def __str__(self):
        return self.email