from django.db import migrations

BANGUS_ACTIVITIES = [
    (1,  'Pond Preparation',       'Pond Prep',    True,  'Drain, dry, and lime the pond (1-2 t/ha); repair dikes and screens.',    'Agricultural lime (CaO), pump'),
    (5,  'Water Filling',          'Water Mgmt',   False, 'Fill pond with filtered water to 60-80 cm depth.',                       'Water pump, fine mesh screen'),
    (7,  'Fertilization',          'Nutrition',    True,  'Apply organic fertilizer to grow natural food (lab-lab).',                'Chicken manure 500 kg/ha'),
    (14, 'Lab-lab Assessment',     'Nutrition',    False, 'Check lab-lab growth; re-fertilize if coverage is insufficient.',         ''),
    (21, 'Stocking',               'Stocking',     True,  'Stock fingerlings at 3-5 pcs/m2; acclimatize before release.',           'Bangus fingerlings, aeration'),
    (28, 'Feeding Monitoring',     'Feeding',      True,  'Observe feeding response; adjust feed rate to 3-5% BW.',                 'Commercial pellets (28-32% protein)'),
    (35, 'Water Quality Check',    'Water Mgmt',   True,  'Monitor pH (7-8.5), DO, turbidity, and temperature.',                   'pH meter, DO meter'),
    (45, 'Growth Sampling',        'Monitoring',   True,  'Sample 30 fish; measure and weigh to compute ABW and ADG.',              'Seine net, weighing scale'),
    (55, 'Feed Adjustment',        'Feeding',      False, 'Adjust feeding rate based on updated ABW; switch to grower pellets.',    'Grower pellets'),
    (65, 'Pest & Disease Check',   'Health',       True,  'Inspect for parasites, ulcers, or unusual behavior; apply if needed.',  'Formalin, salt'),
    (90, 'Pre-harvest Sampling',   'Monitoring',   True,  'Final sampling to confirm target size (300-500 g/pc).',                  'Seine net'),
    (95, 'Harvest',                'Harvest',      True,  'Harvest at 120 days or target weight; use seine nets or drain harvest.', 'Seine net, ice box, harvest baskets'),
]

TILAPIA_ACTIVITIES = [
    (1,  'Pond Preparation',           'Pond Prep',    True,  'Drain, dry, and lime pond (1 t/ha CaO); repair dikes.',                  'Agricultural lime (CaO)'),
    (5,  'Water Filling & Fertilization', 'Water Mgmt', True, 'Fill to 80 cm; apply organic fertilizer (200 kg/ha chicken manure).',    'Chicken manure 200 kg/ha'),
    (10, 'Plankton Bloom Check',       'Water Mgmt',   False, 'Verify green water (Secchi disk 30-40 cm); re-fertilize if needed.',     'Secchi disk'),
    (14, 'Stocking',                   'Stocking',     True,  'Stock all-male tilapia at 2-4 pcs/m2; sex-reverse or certified.',       'All-male tilapia fingerlings'),
    (21, 'Feeding Start',              'Feeding',      True,  'Begin supplemental feeding at 5% BW; use 28-32% protein starter feed.', 'Tilapia starter feed (28-32% protein)'),
    (35, 'First Growth Sampling',      'Monitoring',   True,  'Sample 30 fish; compute ABW, survival rate, and FCR.',                  'Seine net, weighing scale'),
    (49, 'Feed Rate Adjustment',       'Feeding',      False, 'Adjust to 3-4% BW; switch to grower pellets (25-28% protein).',        'Grower pellets'),
    (60, 'Water Quality Monitoring',   'Water Mgmt',   True,  'Check ammonia, nitrite, pH, and DO; do partial water exchange if needed.', 'pH meter, ammonia test kit'),
    (70, 'Second Growth Sampling',     'Monitoring',   True,  'Evaluate market readiness; check for target size (200-250 g/pc).',      'Seine net'),
    (85, 'Pre-harvest Management',     'Harvest',      False, 'Stop feeding 24 hours before harvest; do partial drain.',               ''),
    (90, 'Harvest',                    'Harvest',      True,  'Harvest at 90 days or upon reaching market size.',                      'Net, ice box, harvest baskets'),
]


def seed_fish_templates(apps, schema_editor):
    FishActivityTemplate = apps.get_model('monitoring', 'FishActivityTemplate')
    records = []
    for days, name, cat, critical, desc, mats in BANGUS_ACTIVITIES:
        records.append(FishActivityTemplate(
            species_name='Bangus', activity_name=name, days_from_stocking=days,
            category=cat, description=desc, materials_needed=mats, is_critical=critical,
        ))
    for days, name, cat, critical, desc, mats in TILAPIA_ACTIVITIES:
        records.append(FishActivityTemplate(
            species_name='Tilapia', activity_name=name, days_from_stocking=days,
            category=cat, description=desc, materials_needed=mats, is_critical=critical,
        ))
    FishActivityTemplate.objects.bulk_create(records)


def unseed_fish_templates(apps, schema_editor):
    FishActivityTemplate = apps.get_model('monitoring', 'FishActivityTemplate')
    FishActivityTemplate.objects.filter(species_name__in=['Bangus', 'Tilapia']).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('monitoring', '0006_fish_activity_models'),
    ]

    operations = [
        migrations.RunPython(seed_fish_templates, reverse_code=unseed_fish_templates),
    ]
