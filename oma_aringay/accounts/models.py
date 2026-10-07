from django.conf import settings
from django.db import models  # <-- MAKE SURE THIS LINE IS PRESENT!
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    class Roles(models.TextChoices):
        ADMIN = 'ADMIN', 'Admin'
        EVALUATOR = 'EVALUATOR', 'Focal Person'
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
    # Staff/Admin profile photo -- the citizen-facing records (Farmer/
    # Fisherfolk/*Organization) already have their own profile_picture/logo
    # field; ADMIN/EVALUATOR accounts had none until the profile page's
    # rebuild against the reference mockup, which draws a real photo-upload
    # affordance for this account type too.
    profile_picture = models.ImageField(upload_to='profile_pictures/staff/', null=True, blank=True)
    must_change_password = models.BooleanField(
        default=False,
        help_text='Forces the user to a change-password screen on next login.',
    )

    temp_password_expires_at = models.DateTimeField(
        null=True, blank=True,
        help_text='When the system-issued temporary password stops working. Empty for every other password.',
    )

    is_email_verified = models.BooleanField(default=False)
    email_verification_token = models.CharField(max_length=64, null=True, blank=True)
    email_verification_sent_at = models.DateTimeField(null=True, blank=True)

    # Switchable-identity feature, Phase 3: linked_record_type/
    # linked_record_id used to be real columns here (Batch 10). They are
    # now READ-ONLY PROPERTIES resolving through UserLinkedRecord's
    # currently-ACTIVE row instead — this is the per-request source-of-
    # truth cutover the whole feature exists for. Deliberately a Python
    # property, not a DB column: it's what lets every one of the ~39
    # attribute-read call sites across permission classes, ownership
    # hooks, and helper methods (get_linked_record/get_linked_farmer_id/
    # get_linked_fisherfolk_id below, unchanged) keep calling
    # user.linked_record_type/id exactly as before, with ZERO code change
    # at those call sites, while now transparently reflecting whichever
    # domain is currently active for a dual-linked citizen. The 8 places
    # that query the User table BY these fields at the database level
    # (Phase 2) already had to be rewritten regardless — a Python property
    # can never be queried in a QuerySet.filter(), no matter when the
    # cutover happened.
    #
    # No setter: nothing should ever "set the active domain" by assigning
    # here — that's what UserLinkedRecord.is_active flips are for (a
    # later phase's switch action). The one caller that used to construct
    # a brand-new User with these as constructor kwargs
    # (accounts.utils.create_inactive_citizen_shell) was updated in Phase
    # 2 to create the UserLinkedRecord row directly instead — confirmed
    # there is no other write site anywhere in the codebase (checked
    # every `.linked_record_type =` / `.linked_record_id =` assignment
    # and every User(...)/User.objects.create(...) constructor call).
    #
    # Real, one-time performance note, not fixed here: reading both
    # properties on the same instance costs two separate queries against
    # UserLinkedRecord (once per property), since neither is cached on
    # `self`. Deliberately left this way rather than adding an
    # instance-level cache: a cached value could go stale within a single
    # long-lived request if something flipped the active flag mid-request
    # (unlikely today, but a correctness footgun not worth trading away
    # for a second query on what is, in practice, an indexed one-row
    # lookup on a small table).
    @property
    def linked_record_type(self):
        active = self.get_active_link()
        return active.record_type if active else None

    @property
    def linked_record_id(self):
        active = self.get_active_link()
        return active.record_id if active else None

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

    def get_linked_farmer_id(self):
        """linked_record_id iff linked_record_type is FARMER, else None.
        Batch 12: guards against a lurking bug pattern found across every
        Batch 11 citizen-scoping call site — comparing linked_record_id
        directly against a farmer_id/fisherfolk_id column without first
        confirming linked_record_type actually matches. Since
        linked_record_id is just a bare int shared across four unrelated
        tables (Farmer/Fisherfolk/FarmersOrganization/FisherfolkOrganization),
        an ORGANIZATION-linked citizen could otherwise accidentally match a
        farmer/fisherfolk row whose id happens to equal their org's id.

        Phase 3 update: linked_record_type/id are no longer bare instance
        attributes — they're properties resolving through the currently-
        active UserLinkedRecord row (see their own definitions above), so
        this DOES cost a query now, same as any other reader of them."""
        return self.linked_record_id if self.linked_record_type == self.LinkedRecordType.FARMER else None

    def get_linked_fisherfolk_id(self):
        """Fisherfolk counterpart of get_linked_farmer_id() — see its docstring."""
        return self.linked_record_id if self.linked_record_type == self.LinkedRecordType.FISHERFOLK else None

    def get_active_link(self):
        """The currently-active UserLinkedRecord row for this user, or None.

        Built inert in Phase 1 (nothing called it yet); as of Phase 3 this
        is the real, single source of truth every attribute-read caller of
        linked_record_type/linked_record_id goes through — see those
        properties' own definitions above for the full cutover story.
        """
        return self.linked_records.filter(is_active=True).first()

    def __str__(self):
        return self.email or f'{self.get_role_display()} ({self.full_name or self.username})'


class UserLinkedRecord(models.Model):
    """
    Switchable-identity feature, Phase 1 (investigation: "one account, two
    identities, switchable"). A CITIZEN account's single linked_record_type/
    linked_record_id pair on User above cannot represent "this person has
    real, legitimate access to two different domain records" — the exact
    situation the RSBSA dual-registration fix created for 3 real people
    (Edmar Picar, Christopher Villanueva, Venerando Obra: each has both a
    Farmer and a Fisherfolk record sharing one RSBSA number, but only ever
    one citizen shell). This table is the join/through structure that can
    hold more than one link per user, with `is_active` marking which one a
    request currently resolves against.

    Deliberately NOT a second ad hoc field pair bolted onto User — a real
    table lets one user have zero, one, or several linked records without
    redefining what the existing fields mean out from under every reader of
    them. Whether/when linked_record_type/linked_record_id themselves start
    reading from this table (rather than their own DB columns) is a LATER
    phase's decision, not this one — Phase 1 only builds and backfills this
    structure; nothing reads from it yet except the new get_active_link()
    helper above, which nothing else calls yet either.

    One user can never claim the same physical record as another user
    (`record_type`, `record_id` is unique) — the same guarantee
    linked_record_id already had implicitly as a bare int per user, made
    explicit and DB-enforced here across potentially many rows.

    "At most one is_active=True row per user" is NOT a database constraint:
    Django's conditional UniqueConstraint requires partial-index support,
    which this project's MySQL backend does not have (confirmed — MySQL,
    unlike PostgreSQL/SQLite, cannot express a unique index with a WHERE
    clause). This is enforced in the application layer wherever a link is
    activated (a later phase's concern — Phase 1 backfills every row as the
    ONLY link for its user, so this can never be violated yet regardless).
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='linked_records',
    )
    record_type = models.CharField(max_length=20, choices=User.LinkedRecordType.choices)
    record_id = models.PositiveIntegerField()
    is_active = models.BooleanField(
        default=False,
        help_text='Whether this is the record a request currently resolves against for this '
                   'user. Enforced as at most one True per user in the application layer, not '
                   'a DB constraint — see this model\'s own docstring for why.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['record_type', 'record_id'], name='one_user_per_record'),
        ]
        indexes = [
            models.Index(fields=['user', 'is_active']),
        ]

    def __str__(self):
        return f'{self.user} -> {self.record_type}#{self.record_id}{" (active)" if self.is_active else ""}'