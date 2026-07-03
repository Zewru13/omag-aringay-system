from django.db import migrations


RULES = [
    # ── Drought ───────────────────────────────────────────────────────────────
    (None, 'Drought', 'HIGH', 'Emergency Irrigation',
     'Apply supplemental irrigation immediately using available water sources (canals, wells, water pumps). Prioritize crops at critical growth stages (flowering/fruiting).'),
    (None, 'Drought', 'HIGH', 'Mulching',
     'Apply organic mulch (rice straw, dried leaves) 5–10 cm thick around plant bases to conserve soil moisture and reduce evapotranspiration.'),
    (None, 'Drought', 'MEDIUM', 'Reduce Fertilizer Application',
     'Suspend or reduce fertilizer inputs during drought stress. Nutrients cannot be absorbed without adequate water and can cause fertilizer burn.'),
    (None, 'Drought', 'MEDIUM', 'Apply Foliar Fertilizer',
     'Substitute soil application with foliar spray of complete fertilizer or seaweed extract to sustain crop nutrition without added soil moisture demand.'),
    (None, 'Drought', 'LOW', 'Monitor Soil Moisture Daily',
     'Observe plant wilting signs, check soil moisture at 10 cm depth. Log observations in the activity log for trend tracking.'),

    # ── Flood ─────────────────────────────────────────────────────────────────
    (None, 'Flood', 'HIGH', 'Drain Excess Water Immediately',
     'Open drainage canals and create furrows to remove standing water as quickly as possible. Prolonged waterlogging causes root rot and crop death within 48–72 hours.'),
    (None, 'Flood', 'HIGH', 'Remove Damaged Plant Material',
     'Uproot and remove completely submerged or dead plants. This prevents mold, disease spread, and secondary pest infestation in the field.'),
    (None, 'Flood', 'MEDIUM', 'Apply Fungicide After Draining',
     'Once water recedes, apply broad-spectrum fungicide (e.g., mancozeb) to prevent fungal diseases that thrive in post-flood wet conditions.'),
    (None, 'Flood', 'MEDIUM', 'Replanting Assessment',
     'Evaluate remaining stand density and decide whether to replant gaps or conduct total replanting if more than 50% of the crop was lost.'),
    (None, 'Flood', 'LOW', 'Submit Damage Report',
     'Document the affected area in hectares, estimated production loss, and affected barangay. Submit a Disaster Report record in the system.'),

    # ── Typhoon ───────────────────────────────────────────────────────────────
    (None, 'Typhoon', 'HIGH', 'Post-Typhoon Field Assessment',
     'Conduct immediate field assessment within 24 hours after the typhoon. Document lodging, breakage, defoliation, and flood damage per crop and barangay.'),
    (None, 'Typhoon', 'HIGH', 'Re-stake and Prop Up Lodged Plants',
     'For crops like corn and banana, re-stake or prop up lodged plants within 48 hours to allow recovery before lodging becomes permanent.'),
    (None, 'Typhoon', 'MEDIUM', 'Drain Flooded Fields',
     'Pump out or channel flood water from typhoon-induced inundation. Use temporary drainage canals if permanent ones are blocked by debris.'),
    (None, 'Typhoon', 'MEDIUM', 'Foliar Recovery Spray',
     'Apply micronutrient foliar spray (zinc, manganese) and amino acid-based biostimulants to support crop recovery from physical and stress damage.'),
    (None, 'Typhoon', 'LOW', 'Coordinate with DA / LGU for Relief Seeds',
     'Report total crop losses to the Municipal Agriculturist. Coordinate early with the Department of Agriculture for emergency seed and input assistance.'),

    # ── Strong Winds ──────────────────────────────────────────────────────────
    (None, 'Strong Winds', 'HIGH', 'Assess Wind Damage',
     'Survey the field for broken stems, uprooted plants, and defoliation. Record the percentage of plants affected per crop type.'),
    (None, 'Strong Winds', 'MEDIUM', 'Re-stake Tall Crops',
     'Re-stake or provide bamboo support to tall crops (corn, banana, eggplant) that have been toppled or tilted by strong winds.'),
    (None, 'Strong Winds', 'LOW', 'Remove Broken Material',
     'Remove snapped stems and fallen leaves from the field to reduce disease pressure from decaying organic matter.'),

    # ── Pest Outbreak ─────────────────────────────────────────────────────────
    (None, 'Pest Outbreak', 'HIGH', 'Identify the Pest',
     'Collect pest samples and identify the species accurately. Contact the Municipal Agriculturist office for identification support. Correct identification determines the right control measure.'),
    (None, 'Pest Outbreak', 'HIGH', 'Apply Targeted Pesticide',
     'Apply DA-registered pesticide specific to the identified pest. Follow label directions for dose, timing, and safety PPE. Avoid broad-spectrum pesticides that kill beneficial insects.'),
    (None, 'Pest Outbreak', 'HIGH', 'Set Up Pheromone Traps',
     'Deploy pheromone traps at 1 trap per hectare to monitor and capture adult moths (e.g., fall armyworm, corn borer, diamondback moth). Record weekly trap counts.'),
    (None, 'Pest Outbreak', 'MEDIUM', 'Border Spray Treatment',
     'Apply insecticide first along field borders where pest entry typically originates, then move inward to prevent re-infestation from neighboring fields.'),
    (None, 'Pest Outbreak', 'MEDIUM', 'Apply Biological Control',
     'Release Trichogramma parasitoids or apply Bacillus thuringiensis (Bt) for lepidopteran pests as part of integrated pest management.'),
    (None, 'Pest Outbreak', 'LOW', 'Monitor Infestation Level Weekly',
     'Survey the field weekly and count affected plants per row to track whether infestation is increasing, stable, or declining after control measures.'),
]


def seed_disaster_rules(apps, schema_editor):
    DisasterResponseRule = apps.get_model('production', 'DisasterResponseRule')

    for crop_name, disaster_type, priority, title, action in RULES:
        DisasterResponseRule.objects.get_or_create(
            disaster_type=disaster_type,
            crop_type=None,
            title=title,
            defaults={
                'action': action,
                'priority': priority,
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0026_add_disaster_response_rule'),
    ]

    operations = [
        migrations.RunPython(seed_disaster_rules, migrations.RunPython.noop),
    ]
