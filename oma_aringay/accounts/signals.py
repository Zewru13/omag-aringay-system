"""A citizen signs in with the e-mail on their record, so changing that e-mail (staff form, approved change request,
import) changes the sign-in e-mail too. Saving anything else on the record leaves the sign-in e-mail alone."""
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from associations.models import FarmersOrganization, FisherfolkOrganization
from farmers.models import Farmer
from fisheries.models import Fisherfolk

from . import login_email
from .models import User

RECORD_TYPES = {
    Farmer: User.LinkedRecordType.FARMER,
    Fisherfolk: User.LinkedRecordType.FISHERFOLK,
    FarmersOrganization: User.LinkedRecordType.FARMERS_ORG,
    FisherfolkOrganization: User.LinkedRecordType.FISHERFOLK_ORG,
}


@receiver(pre_save, sender=Farmer)
@receiver(pre_save, sender=Fisherfolk)
@receiver(pre_save, sender=FarmersOrganization)
@receiver(pre_save, sender=FisherfolkOrganization)
def remember_the_record_email(sender, instance, raw=False, update_fields=None, **kwargs):
    field = login_email.record_field(RECORD_TYPES[sender])
    instance._email_changed = False
    if raw or instance.pk is None:      # a restore loads accounts as saved; a new record has no account yet
        return
    if update_fields is not None and field not in update_fields:
        return
    before = sender._base_manager.filter(pk=instance.pk).values_list(field, flat=True).first()
    instance._email_changed = login_email.normalize(before) != login_email.normalize(getattr(instance, field))


@receiver(post_save, sender=Farmer)
@receiver(post_save, sender=Fisherfolk)
@receiver(post_save, sender=FarmersOrganization)
@receiver(post_save, sender=FisherfolkOrganization)
def keep_sign_in_email_current(sender, instance, **kwargs):
    if getattr(instance, '_email_changed', False):
        login_email.sync_from_record(RECORD_TYPES[sender], instance)
