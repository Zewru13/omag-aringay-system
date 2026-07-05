from django.contrib.auth import get_user_model
from rest_framework import serializers


User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'full_name', 'contact_number', 'role', 'is_active', 'date_joined']


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = [
            'id',
            'email',
            'password',
            'full_name',
            'contact_number',
            'role',
            'is_active',
        ]
        read_only_fields = ['id']

    def create(self, validated_data):
        password = validated_data.pop('password')
        email = validated_data['email']
        user = User(**validated_data)
        user.username = email
        user.set_password(password)
        user.save()
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['full_name', 'contact_number', 'role', 'is_active']
        extra_kwargs = {
            'full_name': {'required': False},
            'contact_number': {'required': False},
            'role': {'required': False},
            'is_active': {'required': False},
        }


class MeUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['full_name', 'contact_number', 'email']
        extra_kwargs = {
            'full_name': {'required': False},
            'contact_number': {'required': False},
            'email': {'required': False},
        }

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
        if len(new_password) < 8:
            raise serializers.ValidationError(
                'New password must be at least 8 characters.'
            )
        return attrs
