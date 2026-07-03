from django.db import migrations

# Lookup key: (crop_type, day_after_planting, stage_name) — handles crops with
# multiple Fertilizer Application stages at different days (e.g. Palay, Corn).
# Activity names match the Add Log dropdown exactly.

STAGES = {
    # ── PALAY (RICE) — 110 days ──────────────────────────────────────────────
    'Palay (Rice)': [
        (0,   'Land Preparation',      'HIGH',   'Plow and harrow the field. Prepare drainage.'),
        (1,   'Seed Soaking',          'HIGH',   'Soak certified seeds 24-48 hours.'),
        (7,   'Planting',              'HIGH',   'Transplant seedlings at proper spacing.'),
        (10,  'Fertilizer Application','HIGH',   'Apply 14-14-14 NPK basal, 1-2 bags/ha.'),
        (20,  'Weeding',               'MEDIUM', 'First weeding to reduce competition.'),
        (30,  'Fertilizer Application','HIGH',   'Urea top dressing for vegetative growth.'),
        (45,  'Pest Control',          'HIGH',   'Check for brown planthopper and stem borer.'),
        (60,  'Disease Control',       'HIGH',   'Monitor for blast and bacterial blight.'),
        (100, 'Field Monitoring',      'MEDIUM', 'Drain field 1-2 weeks before harvest.'),
        (110, 'Harvesting',            'HIGH',   'Harvest when 80-85% of grains are golden.'),
    ],

    # ── CORN (MAIS) — 90 days ────────────────────────────────────────────────
    'Corn (Mais)': [
        (0,  'Land Preparation',       'HIGH',   'Plow, harrow, prepare furrows.'),
        (1,  'Planting',               'HIGH',   '2-3 seeds per hill at proper spacing.'),
        (5,  'Fertilizer Application', 'HIGH',   'Basal 14-14-14, 2-3 bags/ha.'),
        (14, 'Weeding',                'MEDIUM', 'Thin to 1-2 plants per hill, remove weeds.'),
        (30, 'Fertilizer Application', 'HIGH',   'Side dress urea, hill up soil.'),
        (50, 'Pest Control',           'HIGH',   'Check for corn borer and armyworm.'),
        (65, 'Field Monitoring',       'MEDIUM', 'Ensure moisture during silking.'),
        (90, 'Harvesting',             'HIGH',   'Harvest when husks are dry.'),
    ],

    # ── KAMOTE — 90 days ─────────────────────────────────────────────────────
    'Kamote': [
        (0,  'Land Preparation',       'HIGH',   'Deep plow and ridge soil for good tuber development.'),
        (1,  'Planting',               'HIGH',   'Plant vine cuttings 20-30cm long; press firmly into ridges.'),
        (7,  'Fertilizer Application', 'HIGH',   'Apply 14-14-14 NPK basal, 1 bag/ha along furrows.'),
        (20, 'Weeding',                'MEDIUM', 'Remove weeds and hill up soil around vines.'),
        (45, 'Irrigation / Watering',  'MEDIUM', 'Water if rainfall is insufficient; avoid waterlogging.'),
        (70, 'Field Monitoring',       'MEDIUM', 'Check tuber size by probing soil; monitor for pests.'),
        (85, 'Pre-Harvest Inspection', 'MEDIUM', 'Check vine color and leaf drop as harvest indicators.'),
        (90, 'Harvesting',             'HIGH',   'Harvest tubers carefully to avoid bruising; cure before storage.'),
    ],

    # ── CASSAVA — 270 days ───────────────────────────────────────────────────
    'Cassava': [
        (0,   'Land Preparation',       'HIGH',   'Plow to 30cm depth; prepare ridges or mounds.'),
        (1,   'Planting',               'HIGH',   'Plant 20-25cm stake cuttings at 45° angle; 1m x 1m spacing.'),
        (14,  'Fertilizer Application', 'HIGH',   'Apply 14-14-14 NPK basal, 2-3 bags/ha.'),
        (30,  'Weeding',                'MEDIUM', 'First weeding; hill up soil around base.'),
        (90,  'Fertilizer Application', 'HIGH',   'Side dress urea for continued growth.'),
        (120, 'Disease Control',        'MEDIUM', 'Monitor for cassava mosaic disease and brown leaf spot.'),
        (180, 'Field Monitoring',       'MEDIUM', 'Check crop canopy and stem thickness as yield indicators.'),
        (250, 'Pre-Harvest Inspection', 'MEDIUM', 'Check tuber size; stems should be browning at base.'),
        (270, 'Harvesting',             'HIGH',   'Harvest by cutting stems and pulling tubers; process promptly.'),
    ],

    # ── WATERMELON — 90 days ─────────────────────────────────────────────────
    'Watermelon': [
        (0,  'Land Preparation',        'HIGH',   'Plow, harrow, prepare planting holes.'),
        (1,  'Planting',                'HIGH',   'Plant seeds, water immediately.'),
        (5,  'Fertilizer Application',  'HIGH',   'Basal 14-14-14 near root zone.'),
        (14, 'Weeding',                 'MEDIUM', 'Remove weeds around plants.'),
        (30, 'Irrigation / Watering',   'HIGH',   'Consistent moisture + urea top dressing.'),
        (45, 'Pest Control',            'LOW',    'Monitor for aphids and fruit borers.'),
        (60, 'Field Monitoring',        'MEDIUM', 'Check fruit development, remove misshapen fruits.'),
        (75, 'Pre-Harvest Inspection',  'MEDIUM', 'Tap test — dull sound means ripe.'),
        (90, 'Harvesting',              'HIGH',   'Harvest mature fruits, handle carefully.'),
    ],

    # ── MANGO — 120 days ─────────────────────────────────────────────────────
    'Mango': [
        (0,   'Land Preparation',       'HIGH',   'Prepare planting holes 60x60x60cm; enrich with compost.'),
        (1,   'Planting',               'HIGH',   'Plant grafted seedlings; stake to protect from wind.'),
        (7,   'Fertilizer Application', 'HIGH',   'Apply 14-14-14 NPK basal around drip line.'),
        (20,  'Irrigation / Watering',  'HIGH',   'Water twice weekly; critical during flowering.'),
        (40,  'Disease Control',        'MEDIUM', 'Spray fungicide against anthracnose and powdery mildew.'),
        (60,  'Pest Control',           'HIGH',   'Monitor for mango fruit fly; use pheromone traps.'),
        (90,  'Field Monitoring',       'MEDIUM', 'Check fruit set and size; thin if overcrowded.'),
        (110, 'Pre-Harvest Inspection', 'MEDIUM', 'Check skin color change and fruit firmness.'),
        (120, 'Harvesting',             'HIGH',   'Harvest at mature green stage; handle gently to avoid bruising.'),
    ],

    # ── BANANA (SAGING) — 365 days ───────────────────────────────────────────
    'Banana (Saging)': [
        (0,   'Land Preparation',       'HIGH',   'Dig planting holes 60x60x60cm; mix compost into soil.'),
        (1,   'Planting',               'HIGH',   'Plant suckers or tissue-cultured seedlings; water well.'),
        (14,  'Fertilizer Application', 'HIGH',   'Apply 14-14-14 NPK, 200g per hill.'),
        (30,  'Irrigation / Watering',  'MEDIUM', 'Maintain consistent moisture; banana needs high water.'),
        (60,  'Weeding',                'MEDIUM', 'Remove weeds and unwanted suckers; leave only one ratoon.'),
        (90,  'Pest Control',           'HIGH',   'Check for banana weevil and nematodes; apply systemic treatment.'),
        (180, 'Disease Control',        'HIGH',   'Monitor for Panama wilt and Black Sigatoka; remove infected leaves.'),
        (270, 'Field Monitoring',       'MEDIUM', 'Check bunch emergence; bag developing bunch to protect fruit.'),
        (350, 'Pre-Harvest Inspection', 'MEDIUM', 'Check finger fullness and bunch weight as harvest indicators.'),
        (365, 'Harvesting',             'HIGH',   'Cut bunch when fingers are round and full; handle carefully.'),
    ],

    # ── AMPALAYA — 55 days ───────────────────────────────────────────────────
    'Ampalaya': [
        (0,  'Land Preparation',        'HIGH',   'Prepare raised beds; incorporate organic matter.'),
        (1,  'Planting',                'HIGH',   'Plant 2-3 seeds per hill; thin to one after emergence.'),
        (7,  'Fertilizer Application',  'HIGH',   'Apply 14-14-14 NPK basal, 1-2 bags/ha.'),
        (14, 'Weeding',                 'MEDIUM', 'Remove weeds; install trellis for vine support.'),
        (30, 'Pest Control',            'HIGH',   'Check for fruit fly and aphids; use yellow sticky traps.'),
        (45, 'Field Monitoring',        'MEDIUM', 'Monitor fruit development and pollination.'),
        (55, 'Harvesting',              'HIGH',   'Harvest fruits at young-mature stage. Log individual picks as activity entries; record final harvest when production ends.'),
    ],

    # ── CABBAGE — 80 days ────────────────────────────────────────────────────
    'Cabbage': [
        (0,  'Land Preparation',        'HIGH',   'Prepare raised beds; apply lime if pH is below 6.0.'),
        (1,  'Planting',                'HIGH',   'Transplant 25-day seedlings; firm soil around roots.'),
        (7,  'Fertilizer Application',  'HIGH',   'Apply 14-14-14 NPK basal, 2-3 bags/ha.'),
        (20, 'Weeding',                 'MEDIUM', 'Remove weeds and cultivate between rows.'),
        (40, 'Disease Control',         'HIGH',   'Monitor for clubroot and black rot; spray copper fungicide.'),
        (55, 'Fertilizer Application',  'MEDIUM', 'Apply urea side dress for head development.'),
        (70, 'Field Monitoring',        'MEDIUM', 'Check head firmness and size.'),
        (75, 'Pre-Harvest Inspection',  'MEDIUM', 'Heads should be firm and compact.'),
        (80, 'Harvesting',              'HIGH',   'Harvest firm, compact heads; cut at base with clean knife.'),
    ],

    # ── EGGPLANT (TALONG) — 75 days ──────────────────────────────────────────
    'Eggplant (Talong)': [
        (0,  'Land Preparation',        'HIGH',   'Deep plow and prepare raised beds; add compost.'),
        (1,  'Planting',                'HIGH',   'Transplant 30-day seedlings; water immediately after.'),
        (7,  'Fertilizer Application',  'HIGH',   'Apply 14-14-14 NPK basal, 2 bags/ha.'),
        (14, 'Weeding',                 'MEDIUM', 'Remove weeds; stake plants for support.'),
        (30, 'Fertilizer Application',  'HIGH',   'Apply urea side dress when flowering begins.'),
        (45, 'Pest Control',            'HIGH',   'Check for fruit and shoot borer; spray as needed.'),
        (60, 'Field Monitoring',        'MEDIUM', 'Monitor fruit set and size; remove damaged fruits.'),
        (75, 'Harvesting',              'HIGH',   'Harvest fruits while skin is still shiny. Log individual picks as activity entries; record final harvest when production ends.'),
    ],

    # ── GARLIC — 90 days ─────────────────────────────────────────────────────
    'Garlic': [
        (0,  'Land Preparation',        'HIGH',   'Deep plow and prepare raised beds; ensure good drainage.'),
        (1,  'Planting',                'HIGH',   'Plant individual cloves 5cm deep, pointed end up.'),
        (7,  'Fertilizer Application',  'HIGH',   'Apply 14-14-14 NPK basal at 2-3 bags/ha.'),
        (21, 'Weeding',                 'MEDIUM', 'Hand-weed carefully to avoid disturbing shallow bulbs.'),
        (45, 'Fertilizer Application',  'HIGH',   'Apply potassium-rich fertilizer for bulb development.'),
        (60, 'Disease Control',         'HIGH',   'Monitor for purple blotch and downy mildew; spray fungicide.'),
        (75, 'Field Monitoring',        'MEDIUM', 'Check leaf yellowing as indicator of bulb maturity.'),
        (85, 'Pre-Harvest Inspection',  'MEDIUM', '50-60% of leaves should be yellowed and falling over.'),
        (90, 'Harvesting',              'HIGH',   'Harvest when leaves are mostly yellow; cure bulbs in shade.'),
    ],

    # ── ONION — 100 days ─────────────────────────────────────────────────────
    'Onion': [
        (0,   'Land Preparation',       'HIGH',   'Prepare raised beds; incorporate organic matter well.'),
        (1,   'Planting',               'HIGH',   'Sow seeds in seedbed or transplant seedlings at 10x10cm.'),
        (7,   'Fertilizer Application', 'HIGH',   'Apply 14-14-14 NPK basal at 2 bags/ha.'),
        (20,  'Weeding',                'MEDIUM', 'Hand-weed carefully; onions are sensitive to competition.'),
        (40,  'Fertilizer Application', 'HIGH',   'Apply urea for bulb bulking stage.'),
        (60,  'Disease Control',        'HIGH',   'Monitor for purple blotch and fusarium basal rot.'),
        (80,  'Field Monitoring',       'MEDIUM', 'Withhold irrigation to trigger bulb maturity.'),
        (90,  'Pre-Harvest Inspection', 'MEDIUM', 'Tops should be falling over; necks should be tight.'),
        (100, 'Harvesting',             'HIGH',   'Harvest when 75% of tops have fallen; cure before storage.'),
    ],

    # ── PECHAY — 30 days ─────────────────────────────────────────────────────
    'Pechay': [
        (0,  'Land Preparation',        'HIGH',   'Prepare raised beds with compost.'),
        (1,  'Planting',                'HIGH',   'Direct seed or transplant seedlings.'),
        (7,  'Fertilizer Application',  'MEDIUM', 'Light urea side dress.'),
        (14, 'Pest Control',            'MEDIUM', 'Check for flea beetles and worms.'),
        (30, 'Harvesting',              'HIGH',   'Harvest whole plants.'),
    ],

    # ── RABONG — 21 days ─────────────────────────────────────────────────────
    'Rabong': [
        (0,  'Field Monitoring',        'HIGH',   'Identify emerging bamboo shoots.'),
        (7,  'Field Monitoring',        'MEDIUM', 'Monitor shoot growth, keep base covered with soil to blanch.'),
        (21, 'Harvesting',              'HIGH',   'Cut shoots at base before they harden; process immediately.'),
    ],

    # ── SITAW — 60 days ──────────────────────────────────────────────────────
    'Sitaw': [
        (0,  'Land Preparation',        'HIGH',   'Prepare raised beds; ensure well-draining soil.'),
        (1,  'Planting',                'HIGH',   'Plant 2-3 seeds per hill; install trellis before vines emerge.'),
        (7,  'Fertilizer Application',  'HIGH',   'Apply 14-14-14 NPK basal, 1 bag/ha.'),
        (14, 'Weeding',                 'MEDIUM', 'Remove weeds; direct vines onto trellis.'),
        (30, 'Pest Control',            'HIGH',   'Check for pod borers and aphids; spray as needed.'),
        (45, 'Field Monitoring',        'MEDIUM', 'Monitor pod development; maintain adequate moisture.'),
        (60, 'Harvesting',              'HIGH',   'Harvest pods while still tender. Log individual picks as activity entries; record final harvest when production ends.'),
    ],

    # ── CACAO — 180 days ─────────────────────────────────────────────────────
    'Cacao': [
        (0,   'Land Preparation',       'HIGH',   'Prepare holes 60x60x60cm; provide shade trees if needed.'),
        (1,   'Planting',               'HIGH',   'Plant grafted or seeded seedlings; mulch around base.'),
        (14,  'Fertilizer Application', 'HIGH',   'Apply 14-14-14 NPK basal at planting.'),
        (30,  'Irrigation / Watering',  'HIGH',   'Water regularly; cacao is sensitive to drought.'),
        (60,  'Weeding',                'MEDIUM', 'Remove weeds and prune lower branches for airflow.'),
        (90,  'Disease Control',        'HIGH',   'Monitor for black pod disease; remove infected pods.'),
        (120, 'Pest Control',           'HIGH',   'Check for cocoa pod borer; spray insecticide if needed.'),
        (150, 'Field Monitoring',       'MEDIUM', 'Monitor pod color change from green to yellow/red.'),
        (170, 'Pre-Harvest Inspection', 'MEDIUM', 'Pods should be fully colored and sound hollow when tapped.'),
        (180, 'Harvesting',             'HIGH',   'Harvest ripe pods; ferment and dry beans properly.'),
    ],

    # ── COFFEE (KAPE) — 365 days ─────────────────────────────────────────────
    'Coffee (Kape)': [
        (0,   'Land Preparation',       'HIGH',   'Prepare planting holes; establish shade trees 6 months prior.'),
        (1,   'Planting',               'HIGH',   'Plant seedlings in holes; mulch generously around base.'),
        (14,  'Fertilizer Application', 'HIGH',   'Apply 14-14-14 NPK basal at planting.'),
        (60,  'Irrigation / Watering',  'HIGH',   'Water twice weekly during dry season.'),
        (90,  'Weeding',                'MEDIUM', 'Clear weeds; maintain mulch layer around root zone.'),
        (150, 'Disease Control',        'HIGH',   'Monitor for coffee leaf rust; spray copper fungicide.'),
        (180, 'Pest Control',           'HIGH',   'Check for coffee berry borer; apply biological control.'),
        (270, 'Field Monitoring',       'MEDIUM', 'Monitor berry color — green to yellow/red indicates ripeness.'),
        (350, 'Pre-Harvest Inspection', 'MEDIUM', 'Spot-check cherry ripeness across the canopy.'),
        (365, 'Harvesting',             'HIGH',   'Selectively hand-pick ripe red cherries; process by wet or dry method.'),
    ],

    # ── GINGER — 180 days ────────────────────────────────────────────────────
    'Ginger': [
        (0,   'Land Preparation',       'HIGH',   'Deep plow to 30cm; incorporate organic matter generously.'),
        (1,   'Planting',               'HIGH',   'Plant seed rhizomes 5-8cm deep; 25g per hill.'),
        (14,  'Fertilizer Application', 'HIGH',   'Apply 14-14-14 NPK basal, 2 bags/ha.'),
        (30,  'Weeding',                'MEDIUM', 'Hand-weed and hill up soil; mulch between rows.'),
        (60,  'Irrigation / Watering',  'HIGH',   'Maintain consistent moisture; ginger needs high humidity.'),
        (90,  'Fertilizer Application', 'MEDIUM', 'Apply urea side dress for continued rhizome development.'),
        (120, 'Disease Control',        'HIGH',   'Monitor for bacterial wilt and rhizome rot; improve drainage.'),
        (150, 'Field Monitoring',       'MEDIUM', 'Check rhizome size by probing soil.'),
        (165, 'Pre-Harvest Inspection', 'MEDIUM', 'Leaves should be yellowing and stems falling.'),
        (180, 'Harvesting',             'HIGH',   'Harvest rhizomes carefully; wash, dry, and store in cool area.'),
    ],

    # ── TOBACCO — 90 days ────────────────────────────────────────────────────
    'Tobacco': [
        (0,  'Land Preparation',        'HIGH',   'Plow to fine tilth; prepare raised seedbed.'),
        (1,  'Planting',                'HIGH',   'Transplant 30-35 day old seedlings at 1m x 0.5m spacing.'),
        (7,  'Fertilizer Application',  'HIGH',   'Apply 14-14-14 NPK basal at transplanting.'),
        (21, 'Weeding',                 'MEDIUM', 'Remove weeds and hill up soil around base.'),
        (40, 'Pest Control',            'HIGH',   'Monitor for aphids and hornworms; spray as needed.'),
        (55, 'Disease Control',         'HIGH',   'Check for blue mold and mosaic virus; remove infected plants.'),
        (65, 'Field Monitoring',        'MEDIUM', 'Top plants (remove flower bud) to redirect energy to leaves.'),
        (80, 'Pre-Harvest Inspection',  'MEDIUM', 'Leaves should be yellowing from bottom up.'),
        (90, 'Harvesting',              'HIGH',   'Harvest leaves from bottom to top as they mature; cure properly.'),
    ],
}


def seed_activity_stages(apps, schema_editor):
    CropType = apps.get_model('production', 'CropType')
    CropActivityStage = apps.get_model('production', 'CropActivityStage')

    for crop_name, stages in STAGES.items():
        try:
            crop = CropType.objects.get(name=crop_name)
        except CropType.DoesNotExist:
            continue
        for day, stage_name, priority, recommendation in stages:
            CropActivityStage.objects.get_or_create(
                crop_type=crop,
                day_after_planting=day,
                stage_name=stage_name,
                defaults={
                    'priority':       priority,
                    'recommendation': recommendation,
                    'window_days':    3,
                },
            )


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0022_seed_aringay_crops'),
    ]

    operations = [
        migrations.RunPython(seed_activity_stages, migrations.RunPython.noop),
    ]
