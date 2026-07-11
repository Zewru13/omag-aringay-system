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
    class Meta:
        model = User
        fields = [
            'id', 'email', 'full_name', 'suffix', 'contact_number', 'role',
            'is_active', 'must_change_password', 'date_joined',
        ]


class UserCreateSerializer(serializers.ModelSerializer):
    """
    No `password` field: the account is always created with a system-generated
    default password (see accounts.utils.generate_default_password) that is
    emailed to the user, never chosen by the admin creating the account.
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
