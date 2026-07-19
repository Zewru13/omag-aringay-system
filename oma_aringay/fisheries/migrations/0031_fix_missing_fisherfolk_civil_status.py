"""
Schema-drift fix: Fisherfolk.civil_status is declared on the model and was
supposed to be added by migration 0010, which is marked applied — but the
actual column was missing from the live fisheries_fisherfolk table (confirmed
via DESCRIBE). Discovered because it breaks every StockingRecord create/update
(the fisherfolk FK lookup does a full-row SELECT, touching every column).

This is a narrow, additive AddField only — matches the model's existing
declaration exactly. No other drift found in this table during investigation.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0030_stockingrecord_culture_phase_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='fisherfolk',
            name='civil_status',
            field=models.CharField(
                max_length=20, blank=True, default='',
                choices=[
                    ('Single', 'Single'),
                    ('Married', 'Married'),
                    ('Widowed', 'Widowed'),
                    ('Separated', 'Separated'),
                ],
            ),
        ),
    ]
