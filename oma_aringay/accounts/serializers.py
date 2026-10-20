from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from core.validators import validate_contact_number


User = get_user_model()


def _validate_contact(value, instance=None):
    return validate_contact_number(value, instance)


class UserListSerializer(serializers.ModelSerializer):
    """One row of User Management: the fields that table shows and acts on. No linked-record details (those cost
    queries per row and the table never reads them); linked_record_type tells the table what kind of account it is."""
    linked_record_type = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'username', 'full_name', 'suffix', 'contact_number', 'role',
            'is_active', 'must_change_password', 'is_email_verified', 'date_joined', 'linked_record_type',
        ]


class UserSerializer(serializers.ModelSerializer):
    # Batch 10: minimal, read-only proof-of-chain data for CITIZEN accounts —
    # None for ADMIN/EVALUATOR (no linked_record_type set). Consumed by the
    # frontend's post-login citizen page (Step 6); reuses /accounts/me/
    # rather than a new endpoint since AuthContext already calls it on load.
    linked_record = serializers.SerializerMethodField()
    # Profile mockup parity: the reference draws Username as its own
    # read-only row (distinct from Email) on the Staff/Admin profile. The
    # field already exists on AbstractUser; it just was never exposed here.
    profile_picture_url = serializers.SerializerMethodField()
    # Switchable-identity feature, Phase 4: every OTHER (inactive)
    # UserLinkedRecord this account has, besides the one linked_record_type
    # above already reflects. Empty list for every single-domain citizen —
    # this is exactly what the frontend switcher gates its own visibility
    # on (render nothing when this list is empty), so it doubles as the one
    # real, server-computed answer to "does this account have more than one
    # linked record" — no separate client-side guess.
    other_linked_records = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'username', 'full_name', 'suffix', 'contact_number', 'role',
            'is_active', 'must_change_password', 'is_email_verified', 'date_joined',
            'linked_record_type', 'linked_record', 'other_linked_records', 'profile_picture_url',
        ]

    def get_profile_picture_url(self, obj):
        return obj.profile_picture.url if obj.profile_picture else None

    def get_other_linked_records(self, obj):
        return [
            {'record_type': link.record_type, 'label': User.LinkedRecordType(link.record_type).label}
            for link in obj.linked_records.exclude(is_active=True).order_by('id')
        ]

    def get_linked_record(self, obj):
        record = obj.get_linked_record()
        if record is None:
            return None
        if obj.linked_record_type in (User.LinkedRecordType.FARMER, User.LinkedRecordType.FISHERFOLK):
            # Read-only registry detail for the citizen's own "My Profile"
            # screen. Purely additive to the Batch 10 payload above — the
            # four original keys are unchanged, so every existing consumer
            # keeps working. Still strictly own-record data: get_linked_record()
            # resolves from request.user's own linked_record_id and /accounts/me/
            # only ever serialises request.user, so no widening is possible here.
            #
            # No fallback/placeholder values are substituted for blanks: the
            # profile screen's rule is to OMIT an unknown field entirely, and
            # that decision needs to see the real '' / 'Unspecified' the
            # registry actually holds rather than a prettified stand-in.
            # Organization-membership batch: a single shape for both record
            # types (always a list) so the shared citizen profile screen
            # doesn't need to branch on record type to read it. Batch
            # (Phase B): Farmer can now genuinely have several memberships
            # too, resolved the same way as Fisherfolk — from the real
            # FarmersOrganizationMember join rows (Farmer.farmers_organization
            # no longer exists).
            if obj.linked_record_type == User.LinkedRecordType.FARMER:
                organization_names = list(
                    record.farmer_organizations.filter(is_active=True)
                    .values_list('organization__name', flat=True)
                )
            else:
                organization_names = list(
                    record.fisherfolk_organizations.filter(is_active=True)
                    .values_list('organization__name', flat=True)
                )

            data = {
                'id': record.id,
                'label': record.full_name,
                'rsbsa_number': record.rsbsa_number,
                'barangay': record.barangay,
                'civil_status': record.civil_status,
                'contact_number': record.contact_number,
                'highest_education': record.highest_education,
                # Profile Reference batch: the "Reference Information" card
                # (birthdate, PWD/4Ps status) needs these three, previously
                # never exposed to the citizen's own /accounts/me/ payload.
                'birthdate': record.birthdate,
                'is_pwd': record.is_pwd,
                'is_4ps_beneficiary': record.is_4ps_beneficiary,
                'organization_names': organization_names,
            }
            if obj.linked_record_type == User.LinkedRecordType.FISHERFOLK:
                # Fisherfolk-only identifiers. Deliberately not mirrored onto
                # Farmer — Farmer has no such columns, and emitting null keys
                # for them would invite the frontend to render empty rows.
                data['fishr_number'] = record.fishr_number
                data['fisherfolk_type'] = record.fisherfolk_type
            # Batch (profile self-service): the raw name parts are needed
            # because a change request is filed per part, not against the
            # composed full_name. `label` above stays the composed display
            # value every existing consumer already reads.
            data['first_name'] = record.first_name
            data['middle_name'] = record.middle_name
            data['last_name'] = record.last_name
            data['profile_picture_url'] = (
                record.profile_picture.url if record.profile_picture else None
            )
            return data
        # FARMERS_ORG / FISHERFOLK_ORG
        return {
            'id': record.id,
            'label': record.name,
            'registration_number': record.registration_number,
            'barangay': record.barangay,
            # Batch (profile self-service): organizations edit these too.
            'name': record.name,
            'street_address': record.street_address,
            'contact_number': record.contact_number,
            'contact_person': record.contact_person,
            'logo_url': record.logo.url if record.logo else None,
            # Org parity batch: read-only registered details the
            # Impormasyon screen displays but this payload never carried —
            # dates/agency/email exist on both org models but had no
            # consumer until now.
            'date_established': record.date_established,
            'date_organized': record.date_organized,
            'date_registered': record.date_registered,
            'registration_agency': record.registration_agency,
            'email_address': record.email_address,
        }


class UserCreateSerializer(serializers.ModelSerializer):
    """
    No `password` field: the account is always created with a system-generated
    default password (see accounts.utils.generate_default_password) that is
    emailed to the user, never chosen by the admin creating the account.

    This is the ADMIN/EVALUATOR "Add User" path only — CITIZEN accounts are
    created in bulk by accounts.management.commands.create_citizen_accounts
    and never go through this serializer (Batch 10).
    """

    class Meta:
        model = User
        fields = [
            'id',
            'email',
            'full_name',
            'suffix',
            'contact_number',
            'role',
            'is_active',
        ]
        read_only_fields = ['id']

    def validate_contact_number(self, value):
        return _validate_contact(value, self.instance)

    def validate(self, attrs):
        # Batch 10: User.email is nullable at the model level (CITIZEN
        # accounts have none) — but this endpoint only ever creates
        # ADMIN/EVALUATOR accounts, for which email stays a hard
        # requirement, unchanged from before email became nullable.
        role = attrs.get('role') or User.Roles.EVALUATOR
        if role != User.Roles.CITIZEN and not (attrs.get('email') or '').strip():
            raise serializers.ValidationError({'email': 'Email is required.'})
        return attrs

    def create(self, validated_data):
        email = validated_data['email']
        user = User(**validated_data)
        user.username = email
        user.set_unusable_password()
        user.save()
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['email', 'full_name', 'suffix', 'contact_number', 'role', 'is_active']
        extra_kwargs = {
            'email': {'required': False},
            'full_name': {'required': False},
            'suffix': {'required': False},
            'contact_number': {'required': False},
            'role': {'required': False},
            'is_active': {'required': False},
        }

    def validate_contact_number(self, value):
        return _validate_contact(value, self.instance)

    def validate_email(self, value):
        value = value.strip().lower()
        qs = User.objects.filter(email__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('This email address is already in use.')
        return value

    def update(self, instance, validated_data):
        if 'email' in validated_data:
            instance.username = validated_data['email']
        return super().update(instance, validated_data)


class MeUpdateSerializer(serializers.ModelSerializer):
    # Staff self-service profile popup batch: email and username are now
    # self-editable here (previously read-only on this endpoint — Admin/
    # Focal Person could only have staff-management change them via
    # UserUpdateSerializer). Deliberately independent fields, not mirrored
    # to each other: LoginView's _resolve_login_identifier() accepts EITHER
    # as a real, separate login identifier, unlike UserUpdateSerializer's
    # admin-editing-someone-else convenience default of keeping username in
    # sync with email.
    class Meta:
        model = User
        fields = ['full_name', 'contact_number', 'email', 'username']
        extra_kwargs = {
            'full_name': {'required': False},
            'contact_number': {'required': False},
            'email': {'required': False},
            'username': {'required': False},
        }

    def validate_contact_number(self, value):
        return _validate_contact(value, self.instance)

    def validate_email(self, value):
        value = value.strip().lower()
        qs = User.objects.filter(email__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('This email address is already in use.')
        return value

    def validate_username(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Username cannot be blank.')
        qs = User.objects.filter(username__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('This username is already in use.')
        return value

    # NOTE: deliberately NO update() override mirroring username to email.
    # A pre-existing override here did exactly that (inherited from when
    # only email was self-editable and username wasn't exposed at all), and
    # it silently changed username as a side effect of an email-only edit —
    # caught live while verifying this batch: submitting just a new email
    # rewrote username to match it even though username was never touched
    # in the request. That directly contradicts these two being independent
    # fields (see the class comment above), so it's removed rather than
    # kept "for compatibility" — the old behavior was never correct once
    # username became independently visible/editable.


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    confirm_new_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        new_password = attrs.get('new_password', '')
        confirm = attrs.get('confirm_new_password', '')

        if new_password != confirm:
            raise serializers.ValidationError(
                'New password and confirmation do not match.'
            )
        try:
            validate_password(new_password, user=self.context.get('user'))
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'new_password': list(exc.messages)})
        return attrs


class VerifyEmailSerializer(serializers.Serializer):
    token = serializers.CharField()


class ResendVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField()
