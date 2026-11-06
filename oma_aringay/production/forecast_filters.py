"""The status filter of Forecasting (Forecast tab): a growing crop's status the way the Forecast table's pill shows it.

The pill says "Overdue" for any growing crop whose expected harvest date has passed (whatever its stored status), otherwise the stored status
(Planted / Near Harvest). So "Planted" and "Near Harvest" here mean that status and not yet past the expected date, and "Overdue" means past it;
a crop with no expected date is never overdue. "Harvested" is a crop whose harvest was recorded (the Forecast table lists those with their actual
harvest too). Any other value is ignored (no filtering)."""
from django.db.models import Q
from django.utils import timezone

GROWING = ('Planted', 'Near Harvest')
FORECAST_STATUSES = (*GROWING, 'Overdue', 'Harvested')


def filter_forecast_status(queryset, value, today=None):
    if value not in FORECAST_STATUSES:
        return queryset
    if value == 'Harvested':
        return queryset.filter(status='Harvested')
    today = today or timezone.localdate()
    if value == 'Overdue':
        return queryset.filter(status__in=GROWING, expected_harvest_date__lt=today)
    return queryset.filter(status=value).filter(Q(expected_harvest_date__gte=today) | Q(expected_harvest_date__isnull=True))
