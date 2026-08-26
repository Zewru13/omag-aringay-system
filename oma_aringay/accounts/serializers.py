from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers


User = get_user_model()


def _validate_contact(value):
    if value and value.strip():
        digits = ''.join(filter(str.isdigit, value.strip()))
        if len(digits) != 11 or not digits.startswith('09'):
            raise serializers.ValidationError(
                'Contact number must be exactly 11 digits and start with 09.'
            )
    return value


class UserSerializer(serializers.ModelSerializer):
    # Batch 10: minimal, read-only proof-of-chain data for CITIZEN accounts —
    # None for ADMIN/EVALUATOR (no linked_record_type set). Consumed by the
    # frontend's post-login citizen page (Step 6); reuses /accounts/me/
    # rather than a new endpoint since AuthContext already calls it on load.
    linked_record = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'full_name', 'suffix', 'contact_number', 'role',
            'is_active', 'must_change_password', 'is_email_verified', 'date_joined',
            'linked_record_type', 'linked_record',
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
            data = {
                'id': record.id,
                'label': record.full_name,
                'rsbsa_number': record.rsbsa_number,
                'barangay': record.barangay,
                'civil_status': record.civil_status,
                'contact_number': record.contact_number,
                'highest_education': record.highest_education,
            }
            if obj.linked_record_type == User.LinkedRecordType.FISHERFOLK:
                # Fisherfolk-only identifiers. Deliberately not mirrored onto
                # Farmer — Farmer has no such columns, and emitting null keys
                # for them would invite the frontend to render empty rows.
                data['fishr_number'] = record.fishr_number
                data['lgu_registration_number'] = record.lgu_registration_number
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
        return _validate_contact(value)

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
        return _validate_contact(value)

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
    class Meta:
        model = User
        fields = ['full_name', 'contact_number', 'email']
        extra_kwargs = {
            'full_name': {'required': False},
            'contact_number': {'required': False},
            'email': {'required': False},
        }

    def validate_contact_number(self, value):
        return _validate_contact(value)

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
