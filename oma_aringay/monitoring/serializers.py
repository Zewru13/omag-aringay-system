from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from rest_framework import serializers

from core.seasons import season_for_date
from core.validators import validate_not_future_date
from core.constants import BARANGAY_CHOICES
from fisheries.models import WATER_SOURCE_CHOICES, SpeciesOption, StockingRecord

from .models import (
    AquacultureFeedingLog, AquacultureFeedingLogUnit, AquacultureHealthLog, AquacultureProductionCycle,
    AquacultureProductionUnit, FarmVisit, FisheryInputLog, health_requires_force_harvest,
)


class FarmVisitSerializer(serializers.ModelSerializer):
    farmer_name = serializers.CharField(source='farmer.full_name', read_only=True)
    farmer_barangay = serializers.CharField(source='farmer.barangay', read_only=True)

    class Meta:
        model = FarmVisit
        fields = [
            'id', 'farmer', 'farmer_name', 'farmer_barangay',
            'visit_date', 'next_visit_date', 'purpose', 'notes',
            'conducted_by', 'date_recorded',
        ]
        read_only_fields = ['id', 'farmer_name', 'farmer_barangay', 'conducted_by', 'date_recorded']

    def validate_visit_date(self, value):
        validate_not_future_date(value, 'Visit date')
        return value
    # next_visit_date deliberately NOT capped — it's a planned future visit — but it cannot come before the visit.

    def validate(self, attrs):
        visit = attrs.get('visit_date', getattr(self.instance, 'visit_date', None))
        following = attrs.get('next_visit_date', getattr(self.instance, 'next_visit_date', None))
        if visit and following and following < visit:
            raise serializers.ValidationError({'next_visit_date': 'The next visit cannot be before the visit date.'})
        return attrs


# ─── Aquaculture Production Cycle (RESTORED from commit 4da000a0) ────────────

class FisheryInputLogSerializer(serializers.ModelSerializer):
    logged_by_name = serializers.SerializerMethodField()

    class Meta:
        model = FisheryInputLog
        fields = [
            'id', 'production_cycle', 'input_type', 'item_name', 'quantity', 'unit',
            'date_acquired', 'source', 'notes',
            'logged_by', 'logged_by_name', 'date_logged',
        ]
        read_only_fields = ['id', 'production_cycle', 'logged_by', 'logged_by_name', 'date_logged']

    def get_logged_by_name(self, obj):
        return obj.logged_by.full_name if obj.logged_by else None


class AquacultureFeedingLogUnitSerializer(serializers.ModelSerializer):
    unit_label = serializers.SerializerMethodField()

    class Meta:
        model = AquacultureFeedingLogUnit
        fields = ['production_unit', 'unit_label', 'quantity_kg']
        read_only_fields = ['unit_label']

    def get_unit_label(self, obj):
        return f'{obj.production_unit.get_unit_type_display()} {obj.production_unit.unit_number}'


class AquacultureFeedingLogSerializer(serializers.ModelSerializer):
    # Optional per-pond/cage breakdown. When sent, quantity_kg (the total) is always recomputed here
    # as the sum - a client-supplied total is ignored. Without it the plain single quantity_kg is used.
    unit_quantities = AquacultureFeedingLogUnitSerializer(many=True, required=False)

    class Meta:
        model = AquacultureFeedingLog
        fields = ['id', 'production_cycle', 'feeding_date', 'feed_type', 'quantity_kg', 'notes', 'unit_quantities']
        read_only_fields = ['id', 'production_cycle']
        extra_kwargs = {'quantity_kg': {'required': False}}

    def validate(self, data):
        rows = data.get('unit_quantities')
        if self.instance is not None and rows is not None:
            raise serializers.ValidationError({'unit_quantities': 'The pond/cage breakdown cannot be edited after logging.'})
        if rows:
            view = self.context.get('view')
            cycle_id = view.kwargs.get('cycle_id') if view is not None else None
            valid_ids = set(AquacultureProductionUnit.objects.filter(production_cycle_id=cycle_id).values_list('id', flat=True))
            seen = set()
            for row in rows:
                unit = row['production_unit']
                if unit.id not in valid_ids:
                    raise serializers.ValidationError({'unit_quantities': 'Each pond/cage must belong to this production cycle.'})
                if unit.id in seen:
                    raise serializers.ValidationError({'unit_quantities': 'Each pond/cage can only be listed once.'})
                seen.add(unit.id)
                if row['quantity_kg'] < 0:
                    raise serializers.ValidationError({'unit_quantities': 'Feed quantity cannot be negative.'})
            total = sum((row['quantity_kg'] for row in rows), Decimal('0'))
            if total <= 0:
                raise serializers.ValidationError({'unit_quantities': 'Enter a feed quantity for at least one pond/cage.'})
            if total > Decimal('999999.99'):
                raise serializers.ValidationError({'unit_quantities': 'Total feed quantity is too large.'})
            data['quantity_kg'] = total
        elif self.instance is None and data.get('quantity_kg') is None:
            raise serializers.ValidationError({'quantity_kg': 'This field is required.'})
        return data

    @transaction.atomic
    def create(self, validated_data):
        rows = validated_data.pop('unit_quantities', None) or []
        log = super().create(validated_data)
        AquacultureFeedingLogUnit.objects.bulk_create([
            AquacultureFeedingLogUnit(feeding_log=log, production_unit=row['production_unit'], quantity_kg=row['quantity_kg'])
            for row in rows
        ])
        return log

    def update(self, instance, validated_data):
        validated_data.pop('unit_quantities', None)
        return super().update(instance, validated_data)


class AquacultureHealthLogSerializer(serializers.ModelSerializer):
    unit_label = serializers.SerializerMethodField()

    class Meta:
        model = AquacultureHealthLog
        fields = [
            'id', 'production_cycle', 'production_unit', 'unit_label', 'log_date', 'observation',
            'mortality_count', 'treatment_applied', 'vet_consulted', 'notes', 'force_harvest',
        ]
        # force_harvest is decided here, never by the client: a submitted false (or true) is ignored.
        # It belongs to this log's own pond/cage (production_unit), not to the whole cycle.
        read_only_fields = ['id', 'production_cycle', 'unit_label', 'force_harvest']

    def get_unit_label(self, obj):
        unit = obj.production_unit
        return f'{unit.get_unit_type_display()} {unit.unit_number}' if unit else None

    def validate(self, data):
        # The affected pond/cage must be one of THIS cycle's own production units, and is required
        # whenever the cycle has any (cycles without units keep the plain behaviour - nothing is invented).
        view = self.context.get('view')
        cycle_id = view.kwargs.get('cycle_id') if view is not None else getattr(self.instance, 'production_cycle_id', None)
        unit = data.get('production_unit')
        if unit is not None and unit.production_cycle_id != cycle_id:
            raise serializers.ValidationError({'production_unit': 'Selected pond/cage does not belong to this production cycle.'})
        if self.instance is None and unit is None and AquacultureProductionUnit.objects.filter(production_cycle_id=cycle_id).exists():
            raise serializers.ValidationError({'production_unit': 'Please select the affected pond/cage.'})
        # A pond/cage that already has a Health Log in this cycle cannot be reported again (scoped to this
        # cycle only; deleting that log frees the unit). Old logs without a unit never block anything.
        if self.instance is None and unit is not None and AquacultureHealthLog.objects.filter(production_cycle_id=cycle_id, production_unit=unit).exists():
            label = f'{unit.get_unit_type_display()} {unit.unit_number}'
            raise serializers.ValidationError({'production_unit': f'{label} already has a Health Log for this cycle.'})
        # Mortality Count is required data for a Fish Mortality record (the number of fish that died).
        observation = data.get('observation', getattr(self.instance, 'observation', ''))
        if (observation or '').strip().lower() == 'fish mortality':
            count = data.get('mortality_count', getattr(self.instance, 'mortality_count', 0))
            if not count or count < 1:
                raise serializers.ValidationError({'mortality_count': 'Mortality count is required for Fish Mortality.'})
        return data

    def create(self, validated_data):
        validated_data['force_harvest'] = health_requires_force_harvest(
            validated_data.get('observation'), validated_data.get('mortality_count'),
        )
        return super().create(validated_data)

    def update(self, instance, validated_data):
        merged_observation = validated_data.get('observation', instance.observation)
        merged_mortality = validated_data.get('mortality_count', instance.mortality_count)
        validated_data['force_harvest'] = health_requires_force_harvest(merged_observation, merged_mortality)
        return super().update(instance, validated_data)


class AquacultureProductionUnitSerializer(serializers.ModelSerializer):
    MAX_AREA = Decimal('99999999.99')

    class Meta:
        model = AquacultureProductionUnit
        fields = ['id', 'unit_type', 'unit_number', 'length_m', 'width_m', 'size_sqm',
                  'fingerling_count']
        # unit_type/unit_number come from the cycle's culture system and list order; size_sqm is
        # always derived from length x width.
        read_only_fields = ['id', 'unit_type', 'unit_number', 'size_sqm']
        # length/width are nullable for legacy units but mandatory for every newly submitted unit.
        extra_kwargs = {'length_m': {'required': True, 'allow_null': False}, 'width_m': {'required': True, 'allow_null': False}}

    def validate_length_m(self, value):
        if value <= 0:
            raise serializers.ValidationError('Length must be greater than 0.')
        return value

    def validate_width_m(self, value):
        if value <= 0:
            raise serializers.ValidationError('Width must be greater than 0.')
        return value

    def validate_fingerling_count(self, value):
        if value <= 0:
            raise serializers.ValidationError('Number of fingerlings must be a positive integer.')
        return value

    def validate(self, attrs):
        area = (attrs['length_m'] * attrs['width_m']).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        if area < Decimal('0.01'):
            raise serializers.ValidationError({'length_m': 'Length x width must be at least 0.01 sq.m.'})
        if area > self.MAX_AREA:
            raise serializers.ValidationError({'length_m': 'Length x width is too large.'})
        attrs['size_sqm'] = area  # never trust a client-provided area
        return attrs

class AquacultureProductionCycleSerializer(serializers.ModelSerializer):
    fisherfolk_name = serializers.CharField(source='fisherfolk.full_name', read_only=True)
    fisherfolk_barangay = serializers.CharField(source='fisherfolk.barangay', read_only=True)
    organization_name = serializers.CharField(source='organization.name', read_only=True, default=None)
    # Read-only: the linked StockingRecord's own estimated_harvest_kg. Never accepted from the client.
    estimated_harvest_kg = serializers.SerializerMethodField()
    # Read-only: always derived from stocking_date (core.seasons); a client-sent value is ignored.
    season = serializers.SerializerMethodField()
    feeding_logs = AquacultureFeedingLogSerializer(many=True, read_only=True)
    health_logs = AquacultureHealthLogSerializer(many=True, read_only=True)
    input_logs = FisheryInputLogSerializer(many=True, read_only=True)
    # Create-only: the SpeciesOption the cycle's StockingRecord is stocked with.
    # species_farmed stays the free-text label; this picks the FK the record needs.
    species_option = serializers.PrimaryKeyRelatedField(queryset=SpeciesOption.objects.all(), write_only=True, required=False)
    # Fishpond/Fishcage only. Writable on create; read-only afterwards (PATCH ignores it).
    units = AquacultureProductionUnitSerializer(many=True, required=False)
    # Create-only, stored on the linked StockingRecord (its existing pond_location_barangay /
    # water_source fields) - not duplicated on the cycle. Choices are the backend's own lists.
    # A listed barangay, or 'Other' + pond_location_other_specify for a location outside the list. The
    # custom text is what gets stored in StockingRecord.pond_location_barangay - 'Other' itself never is.
    pond_location_barangay = serializers.ChoiceField(choices=[*BARANGAY_CHOICES, ('Other', 'Other')], write_only=True, required=False)
    pond_location_other_specify = serializers.CharField(max_length=100, write_only=True, required=False, allow_blank=True)
    # Read-only: the linked StockingRecord's pond location (barangay or the custom text).
    pond_location = serializers.SerializerMethodField()
    water_source = serializers.ChoiceField(choices=WATER_SOURCE_CHOICES, write_only=True, required=False)
    water_source_other_specify = serializers.CharField(max_length=150, write_only=True, required=False, allow_blank=True)

    class Meta:
        model = AquacultureProductionCycle
        fields = [
            'id', 'fisherfolk', 'fisherfolk_name', 'fisherfolk_barangay', 'organization', 'organization_name',
            'cycle_name', 'species_farmed', 'culture_system', 'stocking_date', 'stocking_count', 'stocking_density',
            'area_sqm', 'target_harvest_date', 'actual_harvest_date',
            'harvest_volume_kg',
            'status', 'area_cage_harvested', 'notes', 'recorded_by', 'date_recorded',
            'feeding_logs', 'health_logs', 'input_logs', 'species_option', 'units',
            'estimated_harvest_kg', 'season',
            'pond_location_barangay', 'pond_location_other_specify', 'pond_location',
            'water_source', 'water_source_other_specify',
        ]
        read_only_fields = [
            'id', 'fisherfolk_name', 'fisherfolk_barangay',
            'recorded_by', 'date_recorded', 'feeding_logs', 'health_logs', 'input_logs',
        ]

    # StockingRecord.culture_type only knows Pond/Cage/Pen.
    CULTURE_TYPE_BY_SYSTEM = {'Fishpond': 'Pond', 'Fishcage': 'Cage', 'Fishpen': 'Pen'}
    UNIT_TYPE_BY_SYSTEM = {'Fishpond': 'pond', 'Fishcage': 'cage'}
    MAX_UNITS = 50
    # Start Production Cycle (aquaculture) creates Fishpond / Fishcage cycles only. The model's other
    # choices stay so older cycles keep their recorded value and remain readable/editable.
    CREATABLE_CULTURE_SYSTEMS = ('Fishpond', 'Fishcage')

    def validate_culture_system(self, value):
        current = getattr(self.instance, 'culture_system', None)
        if value not in self.CREATABLE_CULTURE_SYSTEMS and value != current:
            raise serializers.ValidationError('Culture system must be Fishpond or Fishcage.')
        return value

    def get_pond_location(self, obj):
        for record in obj.stocking_records.all():
            if record.pond_location_barangay:
                return record.pond_location_barangay
        return None

    def get_season(self, obj):
        return season_for_date(obj.stocking_date)

    def get_estimated_harvest_kg(self, obj):
        # Sum over the linked stocking record(s) - normally exactly one; None for legacy cycles without one.
        values = [r.estimated_harvest_kg for r in obj.stocking_records.all() if r.estimated_harvest_kg is not None]
        return str(sum(values, Decimal('0'))) if values else None

    def validate(self, data):
        # The species duration only supplies the default estimate, so any date on/after stocking is accepted.
        stocking = data.get('stocking_date', getattr(self.instance, 'stocking_date', None))
        target = data.get('target_harvest_date', getattr(self.instance, 'target_harvest_date', None))
        if stocking and target and target < stocking:
            raise serializers.ValidationError({'target_harvest_date': 'Target harvest date cannot be earlier than the stocking date.'})
        organization = data.get('organization')
        if organization is not None:
            fisherfolk = data.get('fisherfolk', getattr(self.instance, 'fisherfolk', None))
            if not organization.members.filter(fisherfolk=fisherfolk, is_active=True).exists():
                raise serializers.ValidationError({'organization': 'Selected organization is not registered to this fisherfolk.'})
        if self.instance is not None:
            return data
        units = data.get('units') or []
        unit_type = self.UNIT_TYPE_BY_SYSTEM.get(data.get('culture_system'))
        if unit_type:
            label = 'pond' if unit_type == 'pond' else 'cage'
            if not units:
                raise serializers.ValidationError({'units': f'At least one {label} is required.'})
            if len(units) > self.MAX_UNITS:
                raise serializers.ValidationError({'units': f'At most {self.MAX_UNITS} {label}s are allowed.'})
        elif units:
            raise serializers.ValidationError({'units': 'Pond/cage details apply only to Fishpond and Fishcage cycles.'})
        if data.get('species_option'):
            # With units the count is derived from them, so it is only required otherwise.
            if not units and not data.get('stocking_count'):
                raise serializers.ValidationError({'stocking_count': 'Stocking count is required to record the stocking.'})
            validate_not_future_date(data['stocking_date'], 'Stocking date')
            # Both are recorded on the StockingRecord this creates, so both are mandatory here.
            for field, label in (('pond_location_barangay', 'Pond location'), ('water_source', 'Water source')):
                if not data.get(field):
                    raise serializers.ValidationError({field: f'{label} is required.'})
            if data['pond_location_barangay'] == 'Other' and not (data.get('pond_location_other_specify') or '').strip():
                raise serializers.ValidationError({'pond_location_other_specify': 'Please specify the pond location.'})
            if data['water_source'] == 'Other' and not (data.get('water_source_other_specify') or '').strip():
                raise serializers.ValidationError({'water_source_other_specify': 'Please specify the water source.'})
        return data
    @transaction.atomic
    def create(self, validated_data):
        species = validated_data.pop('species_option', None)
        pond_location = validated_data.pop('pond_location_barangay', '')
        pond_location_other = validated_data.pop('pond_location_other_specify', '')
        if pond_location == 'Other':
            pond_location = pond_location_other.strip()
        water_source = validated_data.pop('water_source', '')
        water_source_other = validated_data.pop('water_source_other_specify', '')
        units = validated_data.pop('units', None) or []
        if units:
            # Totals are always derived from the units — any client-sent values are overridden.
            validated_data['stocking_count'] = sum(u['fingerling_count'] for u in units)
            validated_data['area_sqm'] = sum((u['size_sqm'] for u in units), Decimal('0'))
        cycle = super().create(validated_data)
        unit_type = self.UNIT_TYPE_BY_SYSTEM.get(cycle.culture_system)
        AquacultureProductionUnit.objects.bulk_create([
            AquacultureProductionUnit(
                production_cycle=cycle, unit_type=unit_type, unit_number=n,
                length_m=u['length_m'], width_m=u['width_m'], size_sqm=u['size_sqm'],
                fingerling_count=u['fingerling_count'],
            )
            for n, u in enumerate(units, start=1)
        ])
        if species is not None:
            # Same transaction: if this fails the cycle and its units are rolled back too.
            date_stocked = cycle.stocking_date
            StockingRecord.objects.create(
                fisherfolk=cycle.fisherfolk,
                production_cycle=cycle,
                species=species,
                culture_type=self.CULTURE_TYPE_BY_SYSTEM.get(cycle.culture_system, 'Pond'),
                date_stocked=date_stocked,
                number_of_fingerlings=cycle.stocking_count,
                number_of_units=len(units) or None,
                area_hectares=(cycle.area_sqm / Decimal('10000')).quantize(Decimal('0.0001')) if cycle.area_sqm else None,
                pond_location_barangay=pond_location,
                water_source=water_source,
                water_source_other_specify=water_source_other.strip() if water_source == 'Other' else '',
                season=season_for_date(date_stocked),
                year=date_stocked.year,
                notes=cycle.notes,
                recorded_by=cycle.recorded_by,
            )
        return cycle
    def update(self, instance, validated_data):
        validated_data.pop('species_option', None)
        validated_data.pop('units', None)
        for field in ('pond_location_barangay', 'pond_location_other_specify', 'water_source', 'water_source_other_specify'):
            validated_data.pop(field, None)
        return super().update(instance, validated_data)
