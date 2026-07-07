from core.constants import BARANGAY_CHOICES

ARINGAY_BARANGAYS = [db_value for db_value, _label in BARANGAY_CHOICES]


def barangay_code(name):
    try:
        return f'{ARINGAY_BARANGAYS.index(name) + 1:02d}'
    except ValueError:
        return '00'
