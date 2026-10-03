import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """Additive only: a new table for up to 10 damage photos per disaster report. No existing table,
    column, disaster report or uploaded file is read, changed or removed."""

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('fisheries', '0069_fisheriesharvestunit'),
    ]

    operations = [
        migrations.CreateModel(
            name='FisheriesDisasterReportPhoto',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('image', models.ImageField(upload_to='disaster_reports/fisheries/photos/')),
                ('date_uploaded', models.DateTimeField(auto_now_add=True)),
                ('disaster_report', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='photos', to='fisheries.fisheriesdisasterreport')),
                ('uploaded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['id'],
            },
        ),
    ]
