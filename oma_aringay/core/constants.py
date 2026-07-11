BARANGAY_CHOICES = [
    ('Alaska',             'Alaska'),
    ('Basca',              'Basca'),
    ('Dulao',              'Dulao'),
    ('Gallano',            'Gallano'),
    ('Macabato',           'Macabato'),
    ('Manga',              'Manga'),
    ('Pangao-aoan East',   'Pangao-aoan East'),
    ('Pangao-aoan West',   'Pangao-aoan West'),
    ('Poblacion',          'Poblacion'),
    ('Samara',             'Samara'),
    ('San Antonio',        'San Antonio'),
    ('San Benito Norte',   'San Benito Norte'),
    ('San Benito Sur',     'San Benito Sur'),
    ('San Eugenio',        'San Eugenio'),
    ('San Juan East',      'San Juan East'),
    ('San Juan West',      'San Juan West'),
    ('San Simon East',     'San Simon East'),
    ('San Simon West',     'San Simon West'),
    ('Santa Cecilia',      'Santa Cecilia'),
    ('Santa Lucia',        'Santa Lucia'),
    ('Santa Rita East',    'Santa Rita East'),
    ('Santa Rita West',    'Santa Rita West'),
    ('Santo Rosario East', 'Santo Rosario East'),
    ('Santo Rosario West', 'Santo Rosario West'),
]

# PROVISIONAL mapping — barangay -> 3-digit RSBSA barangay code, assigned 001-024
# in the same alphabetical order as BARANGAY_CHOICES above. This has NOT been
# verified against the real BFAR/DA RSBSA barangay code registry and must be
# confirmed by the client before relying on it for official filings.
BARANGAY_RSBSA_CODES = {
    name: f'{i:03d}' for i, (name, _label) in enumerate(BARANGAY_CHOICES, start=1)
}

MALE_ONLY_PREFIXES = ['Mr.']
FEMALE_ONLY_PREFIXES = ['Mrs.', 'Ms.', 'Miss']
NEUTRAL_PREFIXES = ['Dr.', 'Engr.', 'Atty.', 'Hon.']


def validate_prefix_gender(prefix, gender):
    """Return an error message if prefix contradicts gender, else None."""
    if not prefix:
        return None
    if prefix in MALE_ONLY_PREFIXES and gender != 'Male':
        return f'"{prefix}" is a male-only prefix and cannot be used with gender "{gender}".'
    if prefix in FEMALE_ONLY_PREFIXES and gender != 'Female':
        return f'"{prefix}" is a female-only prefix and cannot be used with gender "{gender}".'
    return None
