"""One rule for the names of every settings list: tidy the spaces and refuse a name that is already in the list.

"Already in the list" ignores capitals, spaces and punctuation ("Rc 222", "RC222" and "rc-222" are one name), the way crop types and varieties
already compared. A list that groups its names (the varieties of one crop, the subcategories of one category, the signers of one role) sets
`unique_name_scope` to the fields that make the group, and names are only compared inside a group.

    class FeedTypeSerializer(UniqueNameMixin, serializers.ModelSerializer):
        ...                                           # unique_name_field = 'name' by default
"""
from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator, UniqueValidator

from production.naming import normalize_name


def tidy_name(value):
    """A name with its extra spaces taken out ("  Local   Seed Bank " -> "Local Seed Bank")."""
    return ' '.join(str(value or '').split())


def clashing_name(queryset, field, name):
    """The name already in `queryset` that `name` is the same as (ignoring capitals, spaces and punctuation), or None."""
    key = normalize_name(name)
    for existing in queryset.values_list(field, flat=True):
        if normalize_name(existing) == key:
            return existing
    return None


class UniqueNameMixin:
    unique_name_field = 'name'
    unique_name_scope = ()

    def get_fields(self):
        fields = super().get_fields()
        field = fields.get(self.unique_name_field)
        if field is not None:   # the database's own exact-match check would answer first with a generic message
            field.validators = [v for v in field.validators if not isinstance(v, UniqueValidator)]
        return fields

    def get_validators(self):
        return [v for v in super().get_validators() if not isinstance(v, UniqueTogetherValidator)]

    def _scope_value(self, data, scope_field):
        return data[scope_field] if scope_field in data else getattr(self.instance, scope_field, None)

    def validate(self, data):
        data = super().validate(data)
        field = self.unique_name_field
        if field not in data and self.instance is not None:
            return data
        name = tidy_name(data.get(field, ''))
        key = normalize_name(name)
        if not key:
            raise serializers.ValidationError({field: 'Enter a real name (letters or numbers).'})
        data[field] = name
        scope = {s: self._scope_value(data, s) for s in self.unique_name_scope}
        # A row can always keep (or re-capitalize) its own name, even when an older duplicate already exists.
        if self.instance is not None and normalize_name(getattr(self.instance, field)) == key \
                and all(getattr(self.instance, s, None) == v for s, v in scope.items()):
            return data
        others = self.Meta.model.objects.filter(**scope)
        if self.instance is not None:
            others = others.exclude(pk=self.instance.pk)
        for existing in others.values_list(field, flat=True):
            if normalize_name(existing) == key:
                raise serializers.ValidationError({field: f'"{existing}" is already in this list.'})
        return data
