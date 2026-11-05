"""The fertilizer grades Crop Settings > Input Types starts with (the Type of Fertilizer dropdown of the crop Log Activity form and of the
Assistance forms).

They are the grades the Department of Agriculture's Fertilizer and Pesticide Authority lists in its weekly price bulletins
(https://fpa.da.gov.ph, "Weekly Fertilizer Prices"): urea, ammosul, complete, ammophos, muriate of potash and DAP. Only the product and its
grade are written down: no crop and no growth stage is attached, because when and where to use each one is for OMAg / DA staff to say
(see CropInputType); an entry with neither is never offered as a crop's recommended input."""

DESCRIPTION = 'Common grade listed in the DA Fertilizer and Pesticide Authority price bulletins.'

FERTILIZER_TYPES = (
    ('Urea (46-0-0)', DESCRIPTION),
    ('Ammosul - Ammonium Sulfate (21-0-0)', DESCRIPTION),
    ('Complete (14-14-14)', DESCRIPTION),
    ('Ammophos (16-20-0)', DESCRIPTION),
    ('Muriate of Potash (0-0-60)', DESCRIPTION),
    ('DAP - Diammonium Phosphate (18-46-0)', DESCRIPTION),
)


def fill_fertilizer_types(apps, schema_editor):
    """A Fertilizer list with nothing in it yet gets the grades above; a list the staff has already built is left as it is. (`apps` is the app
    registry, or a migration's historical one.) A name already used by another category is skipped, the name being unique."""
    CropInputType = apps.get_model('production', 'CropInputType')
    if CropInputType.objects.filter(input_type='Fertilizer').exists():
        return
    taken = set(CropInputType.objects.values_list('name', flat=True))
    CropInputType.objects.bulk_create([
        CropInputType(name=name, description=description, input_type='Fertilizer', is_active=True)
        for name, description in FERTILIZER_TYPES if name not in taken
    ])
