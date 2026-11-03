"""The units a type of assistance offers in the quantity box of the assistance forms. One fixed catalog of units; each assistance type
that has a quantity box offers a chosen part of it (Seeds: kg, sack, bag, bundle; never piece or set), set in Assistance Settings. A type
nobody changed offers its starting units below."""
UNITS = ['kg', 'sack', 'bag', 'piece', 'bundle', 'box', 'liter', 'set']

# Per domain, the types that have a quantity box (Cash Assistance is an amount of pesos and Training a number of days: no unit) and the
# units each offers until an Admin changes them.
STARTING_UNITS = {
    'crop': {
        'Fertilizer': ['kg', 'sack', 'bag', 'liter'],
        'Seeds': ['kg', 'sack', 'bag', 'bundle'],
        'Equipment': ['piece', 'box', 'set'],
        'Other': list(UNITS),
    },
    'fisheries': {
        'Fishing Gear': ['piece', 'bundle', 'box', 'set'],
        'Boat/Vessel': ['piece', 'set'],
        'Fingerlings/Seeds': ['kg', 'bag', 'piece'],
        'Feed': ['kg', 'sack', 'bag'],
        'Equipment': ['piece', 'box', 'set'],
        'Other': list(UNITS),
    },
}


def in_catalog_order(units):
    chosen = set(units)
    return [u for u in UNITS if u in chosen]
