ARINGAY_BARANGAYS = [
    'Alaska', 'Basca', 'Dinaoyan', 'Dulatre', 'Gallano',
    'Imelda', 'Lydia', 'Macabato', 'Manga', 'Pangao-Aoan West',
    'Poblacion', 'San Agustin Norte', 'San Agustin Sur', 'San Antonio',
    'San Eugenio', 'San Isidro Norte', 'San Isidro Sur', 'San Juan',
    'San Julian Norte', 'San Julian Sur', 'San Pedro', 'San Vicente',
    'Santa Cecilia', 'Santiago Norte',
]


def barangay_code(name):
    try:
        return f'{ARINGAY_BARANGAYS.index(name) + 1:02d}'
    except ValueError:
        return '00'
