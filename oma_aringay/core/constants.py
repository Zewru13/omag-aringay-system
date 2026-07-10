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
