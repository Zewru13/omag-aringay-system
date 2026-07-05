from django.db import migrations


# 3 rules per disaster type. Tuple: (disaster_type, title, action, priority)
RULES = [
    # Fish Kill
    ('Fish Kill', 'Immediate Water Aeration', 'Deploy aerators immediately to oxygenate the water. Remove dead fish within 2 hours to prevent secondary infection. Test dissolved oxygen and ammonia levels.', 'HIGH'),
    ('Fish Kill', 'Water Exchange', 'Drain 30–50% of pond water and replace with clean, oxygenated water. Flush with fresh water if possible. Halt feeding until water quality recovers.', 'HIGH'),
    ('Fish Kill', 'Post-Mortality Assessment', 'Collect samples for laboratory diagnosis. Document mortality count and biomass loss. Report to BFAR within 24 hours.', 'MEDIUM'),

    # Disease Outbreak
    ('Disease Outbreak', 'Quarantine Affected Area', 'Isolate affected pond/cage immediately. Stop movement of water or equipment between areas. Disinfect nets and tools with 200 ppm chlorine solution.', 'HIGH'),
    ('Disease Outbreak', 'Reduce Feeding Rate', 'Reduce feed by 50% or stop completely. Remove uneaten feed to reduce ammonia buildup. Monitor daily mortality.', 'HIGH'),
    ('Disease Outbreak', 'Consult BFAR Veterinarian', 'Contact the nearest BFAR office for disease identification and treatment protocol. Collect tissue samples in sterile containers.', 'MEDIUM'),

    # Flood
    ('Flood', 'Strengthen Dikes and Nets', 'Inspect and repair pond dikes before flood peak. Install additional net barriers to prevent fish escape. Anchor net cages securely.', 'HIGH'),
    ('Flood', 'Emergency Harvest if Near Maturity', 'If fish are 80% of harvest size, conduct emergency partial harvest. Prioritize fish closest to expected harvest date. Coordinate with buyers in advance.', 'HIGH'),
    ('Flood', 'Post-Flood Water Quality Testing', 'After water recedes, test salinity, pH, and dissolved oxygen. Apply lime at 200 kg/ha if pH drops below 6.5. Resume normal operations only after water stabilizes.', 'MEDIUM'),

    # Typhoon
    ('Typhoon', 'Pre-Typhoon Net Reinforcement', 'Double-secure net cage anchors 48 hours before typhoon landfall. Lower cage depth to reduce surface wave impact. Remove or secure floating equipment.', 'HIGH'),
    ('Typhoon', 'Emergency Pond Drawdown', 'Lower pond water level by 30 cm to accommodate storm surge runoff. Clear spillways to prevent overflow. Document fish count before the storm.', 'HIGH'),
    ('Typhoon', 'Post-Typhoon Damage Assessment', 'Inspect all structures within 12 hours after the typhoon. Account for fish losses. Apply emergency aeration if dissolved oxygen is below 3 ppm.', 'MEDIUM'),

    # Drought
    ('Drought', 'Water Conservation Protocol', 'Reduce pond water exchange frequency. Cover ponds with shade net to reduce evaporation. Monitor water depth daily and record.', 'HIGH'),
    ('Drought', 'Reduce Stocking Density', 'Thin out fish population by 20–30% through partial harvest. This reduces oxygen demand and ammonia accumulation.', 'MEDIUM'),
    ('Drought', 'Supplemental Water Sourcing', 'Arrange alternative water supply from wells or nearby water bodies. Coordinate with LGU for emergency water pumping support.', 'MEDIUM'),

    # Predator Attack
    ('Predator Attack', 'Install Anti-Predator Netting', 'Cover all pond surfaces and cage tops with predator-proof netting (1–2 cm mesh). Inspect and repair existing nets for gaps.', 'HIGH'),
    ('Predator Attack', 'Scare Devices and Monitoring', 'Install visual scare devices (reflective tape, windmills) around pond perimeter. Set up night watch schedule for repeated attacks.', 'MEDIUM'),
    ('Predator Attack', 'Inventory and Loss Report', 'Count and estimate remaining fish stock after attack. Document species and size of predator if identified. Report to barangay wildlife officer.', 'MEDIUM'),

    # Other
    ('Other', 'Immediate Situation Assessment', 'Conduct visual inspection of the affected area. Document all observable damage, water conditions, and fish behavior. Take photographs for records.', 'HIGH'),
    ('Other', 'Report to OMA and BFAR', 'Submit an incident report to the Municipal Agriculturist Office and BFAR within 24–48 hours. Include estimated production loss.', 'MEDIUM'),
    ('Other', 'Adjust Farm Management Plan', 'Review and revise production schedule based on the incident. Update logbook records. Plan remediation activities with technical guidance from BFAR.', 'LOW'),
]


def seed_rules(apps, schema_editor):
    FisheriesDisasterResponseRule = apps.get_model('fisheries', 'FisheriesDisasterResponseRule')

    for disaster_type, title, action, priority in RULES:
        FisheriesDisasterResponseRule.objects.get_or_create(
            disaster_type=disaster_type,
            title=title,
            defaults={
                'action':   action,
                'priority': priority,
                'species':  None,
            },
        )


def unseed_rules(apps, schema_editor):
    FisheriesDisasterResponseRule = apps.get_model('fisheries', 'FisheriesDisasterResponseRule')
    titles = [r[1] for r in RULES]
    FisheriesDisasterResponseRule.objects.filter(title__in=titles, species__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0012_seed_stages'),
    ]

    operations = [
        migrations.RunPython(seed_rules, unseed_rules),
    ]
