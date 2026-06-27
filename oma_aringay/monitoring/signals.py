import datetime

from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender='monitoring.AquacultureProductionCycle')
def generate_fish_activity_schedules(sender, instance, created, **kwargs):
    if not created:
        return
    if not instance.stocking_date:
        return

    species = (instance.species_farmed or '').strip()
    if not species:
        return

    from .models import FishActivityTemplate, FishActivitySchedule

    templates = FishActivityTemplate.objects.filter(species_name__iexact=species)
    if not templates.exists():
        first_word = species.split()[0]
        templates = FishActivityTemplate.objects.filter(species_name__icontains=first_word)

    if not templates.exists():
        return

    schedules = [
        FishActivitySchedule(
            production_cycle=instance,
            template=tpl,
            activity_name=tpl.activity_name,
            scheduled_date=instance.stocking_date + datetime.timedelta(days=tpl.days_from_stocking),
        )
        for tpl in templates
    ]
    FishActivitySchedule.objects.bulk_create(schedules, ignore_conflicts=True)
