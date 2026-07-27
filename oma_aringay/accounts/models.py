from django.db import models  # <-- MAKE SURE THIS LINE IS PRESENT!
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    class Roles(models.TextChoices):
        ADMIN = 'ADMIN', 'Admin'
        EVALUATOR = 'EVALUATOR', 'Evaluator'
        # Batch 10: self-service Farmer/Fisherfolk/Organization accounts.
        # Named CITIZEN to match the terminology this file's own comment
        # already used before this role existed.
        CITIZEN = 'CITIZEN', 'Citizen'

    class LinkedRecordType(models.TextChoices):
        FARMER = 'FARMER', 'Farmer'
        FISHERFOLK = 'FISHERFOLK', 'Fisherfolk'
        FARMERS_ORG = 'FARMERS_ORG', 'Farmers Organization'
        FISHERFOLK_ORG = 'FISHERFOLK_ORG', 'Fisherfolk Organization'

    # Batch 10: nullable because CITIZEN accounts genuinely have no email —
    # they're identified by RSBSA number / organization registration number
    # instead (see LoginView). unique=True + null=True is safe here: MySQL
    # (like Django's other supported backends) treats every NULL as distinct
    # for uniqueness purposes, so multiple emailless citizen accounts don't
    # collide — the same NULL-uniqueness semantics already relied on
    # elsewhere in this codebase (interventions.BeneficiaryRecord's
    # program=null ad-hoc rows, Batch 6/7). Still required at the
    # serializer level for ADMIN/EVALUATOR creation — see
    # UserCreateSerializer.validate().
    email = models.EmailField(unique=True, null=True, blank=True)

    role = models.CharField(
        max_length=20,
        choices=Roles.choices,
        default=Roles.EVALUATOR
    )
    full_name = models.CharField(max_length=150, blank=True, default='')
    suffix = models.CharField(max_length=10, blank=True, default='')
    contact_number = models.CharField(max_length=20, blank=True)
    must_change_password = models.BooleanField(
        default=False,
        help_text='Forces the user to a change-password screen on next login.',
    )

    is_email_verified = models.BooleanField(default=False)
    email_verification_token = models.CharField(max_length=64, null=True, blank=True)
    email_verification_sent_at = models.DateTimeField(null=True, blank=True)

    # Batch 10: polymorphic reference to the Farmer/Fisherfolk/
    # FarmersOrganization/FisherfolkOrganization this CITIZEN account
    # belongs to. Mirrors core.models.RecordLock/Notification's
    # (record_type, record_id) shape rather than Django's ContentType +
    # GenericForeignKey — same justification: a small, fixed set of target
    # models, no extra join/lookup machinery needed for it.
    linked_record_type = models.CharField(
        max_length=20, choices=LinkedRecordType.choices, null=True, blank=True,
    )
    linked_record_id = models.PositiveIntegerField(null=True, blank=True)

    def get_linked_record(self):
        """Resolve linked_record_type/linked_record_id to the actual
        Farmer/Fisherfolk/FarmersOrganization/FisherfolkOrganization
        instance, or None if unset/unresolvable."""
        if not self.linked_record_type or not self.linked_record_id:
            return None
        from associations.models import FarmersOrganization, FisherfolkOrganization
        from farmers.models import Farmer
        from fisheries.models import Fisherfolk

        model_by_type = {
            self.LinkedRecordType.FARMER: Farmer,
            self.LinkedRecordType.FISHERFOLK: Fisherfolk,
            self.LinkedRecordType.FARMERS_ORG: FarmersOrganization,
            self.LinkedRecordType.FISHERFOLK_ORG: FisherfolkOrganization,
        }
        model = model_by_type.get(self.linked_record_type)
        if model is None:
            return None
        return model.objects.filter(pk=self.linked_record_id).first()

    def __str__(self):
        return self.email or f'{self.get_role_display()} ({self.full_name or self.username})'