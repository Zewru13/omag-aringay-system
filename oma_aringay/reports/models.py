from django.db import models


class Signatory(models.Model):
    """One saved signer for the printed reports: the Reports pages offer these names in their Prepared / Checked / Noted / Approved by lists."""

    ROLE_CHOICES = [
        ('prepared', 'Prepared by'),
        ('checked', 'Checked by'),
        ('noted', 'Noted by'),
        ('approved', 'Approved by'),
    ]

    name = models.CharField(max_length=150)
    position = models.CharField(max_length=150, blank=True, default='')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        # The roles sort in signing order, not alphabetically, so the list view orders them itself (see signatories.py).
        ordering = ['role', 'sort_order', 'name']
        verbose_name_plural = 'signatories'

    def __str__(self):
        return f'{self.name} ({self.get_role_display()})'
