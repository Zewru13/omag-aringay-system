from django.db import migrations

# Real, sourced days-to-harvest overrides for CropVariety, researched against
# credible agricultural sources (PhilRice/PSA/PCAARRD, university extension
# programs, and established commercial seed catalogs — see the per-entry
# comments below).
#
# Migration 0038's own docstring already flags that every variety name here
# except Palay (rice), Cassava, and Kamote (sweet potato) is PROVISIONAL —
# a commonly-known local/trade name OMAg still needs to confirm, not a
# verified registration. That matters for this migration specifically:
# a variety only gets a number here when it's a real, identifiably correct
# cultivar with credibly documented maturity data of its own AND that figure
# meaningfully differs from its crop type's existing days_to_harvest.
# Everything else — every generic "Native (X)" entry by definition, plus any
# named variety with no reliable distinct figure found, plus every entry
# whose real maturity turned out to already match the crop type's own
# default — is deliberately left at NULL, correctly falling back to the
# crop type's figure exactly as before this migration. Left NULL is not
# "not researched" - it's "researched, and no real distinct number stands
# up," which is different from silently guessing one.
#
# Perennial tree crops (Cacao, Coffee, Mango) are deliberately excluded
# entirely: the maturity data actually published for their varieties
# almost always measures YEARS-TO-FIRST-BEARING for a newly planted tree
# (e.g. cacao BR25/UF18 ~16-18 months to first fruit), a fundamentally
# different metric from what these crop types' own days_to_harvest already
# represents here (an established, already-bearing tree's flower-to-ripe-
# fruit cycle - Cacao's 150 days and Mango's 120 days both line up with
# that shorter cycle, not first bearing). Mixing in "years to first
# bearing" data would make the figures actively wrong, not more precise.
OVERRIDES = [
    # ── Palay (Rice) — real, PhilRice/DA-registered NSIC/PSB varieties ────
    # NSIC Rc216 (Tubigan 17): PhilRice's own variety page states 112 days
    # transplanted maturity.
    ('NSIC Rc216 (Tubigan 17)', 112),
    # NSIC Rc222: widely cited (PhilRice 3M protocol, farmer field reports)
    # at 114 days.
    ('NSIC Rc222 (Tubigan 18)', 114),
    # NSIC Rc238 (Tubigan 21): PhilRice's own "early maturing varieties"
    # release places it in the <110-day early-maturing class; no single
    # published figure found, 108 used as a defensible point within that
    # stated category.
    ('NSIC Rc238', 108),
    # NSIC Rc402 (Tubigan 36): sources split 107-114 days; 111 used as the
    # midpoint of the cited range.
    ('NSIC Rc402', 111),
    # PSB Rc10 (Rio Grande): real discrepancy found and flagged here rather
    # than silently resolved - PSB Rc10 itself is "Pagsanjan," documented at
    # 106 days. "Rio Grande" is actually a DIFFERENT registered variety,
    # PSB Rc14, at 110 days. The DB's combined name appears to conflate the
    # two. 106 (PSB Rc10/Pagsanjan's own real figure) is used here since
    # Rc10 is the primary code in the name; OMAg should confirm which
    # variety this row is actually meant to represent.
    ('PSB Rc10 (Rio Grande)', 106),
    # NSIC Rc300: only a general "Tubigan" family range (106-119 days) found,
    # no figure specific to Rc300 - left at the crop type's own 110-day
    # default (not listed here).

    # ── Cassava — real registered varieties (per migration 0038) ──────────
    # KU50 (Kasetsart 50): well-documented Thai-origin variety widely grown
    # in the Philippines, 9-11 months (270-330 days) to harvest; 300 used
    # as the midpoint.
    ('KU50', 300),
    # Rayong, Golden Yellow, Lakan 1: found only as names within the general
    # 8-12-month Philippine cassava range, no figure distinct from the crop
    # type's own 270-day default - left unlisted.

    # ── Banana (Saging) — a real per-variety harvest-timeline spread ──────
    # Cavendish: consistently documented at 6-8 months from planting;
    # 210 days used (7-month midpoint).
    ('Cavendish', 210),
    # Lakatan: 8-12 months documented; 300 days used (10-month midpoint).
    ('Lakatan', 300),
    # Saba: 15-16 months documented, the slowest of the four; 465 days used.
    ('Saba', 465),
    # Latundan: ~12 months documented, already matching the crop type's own
    # 365-day default - left unlisted.

    # ── Cabbage — real, named commercial hybrids ───────────────────────────
    ('Rareball', 75),   # 70-80 days documented; midpoint used.
    ('Scorpio', 72),    # 70-75 days after transplant documented; midpoint used.
    # Native (Cabbage): generic, no single figure by definition - left unlisted.

    # ── Corn (Mais) — a real, meaningful hybrid-type split ─────────────────
    # Sweet Corn Hybrid: sweet corn hybrids are consistently documented at
    # 65-75 days, clearly faster than grain corn's 90-day default.
    ('Sweet Corn Hybrid', 70),
    # Yellow Flint Hybrid: Philippine yellow (grain) corn hybrids are
    # documented at 100-120 days depending on hybrid/region, clearly slower
    # than the 90-day default.
    ('Yellow Flint Hybrid', 110),
    # IPB Var 6, Tiniguib (Native White): no maturity figure specific to
    # either found distinct from general Philippine white corn practice -
    # left unlisted.

    # ── Eggplant (Talong) — one real, well-documented hybrid ───────────────
    # Mistisa: documented at ~55 days from transplanting to first harvest
    # (41 days to flower + ~14 days to fruit set).
    ('Mistisa', 55),
    # Casino, Native Long Purple: no figure found distinct from the general
    # 65-80 DAT eggplant range - left unlisted.

    # ── Onion — two real, distinctly different commercial hybrids ─────────
    ('Red Creole', 110),     # consistently documented at 110 days.
    ('Yellow Granex', 95),   # documented at 90-100 days; midpoint used.
    # Native Red: generic, left unlisted.

    # ── Pechay — one real, specifically documented cultivar ────────────────
    # Black Behi: documented at 25-30 days, a genuine (if modest) refinement
    # of the crop type's 30-day default.
    ('Black Behi', 27),
    # Native Pechay: generic, left unlisted.

    # ── Tomato — one real hybrid with an independently calculable figure ──
    # Diamante Max: a real East-West Seed hybrid; a cited field record
    # (transplanted Nov 10, first harvest Jan 24) works out to 75 days.
    ('Diamante Max', 75),
    # Apollo, Native (Tomato): no figure confidently matched to the specific
    # Philippine "Apollo" hybrid this row means - left unlisted.

    # ── Watermelon — one real, distinctly faster commercial hybrid ────────
    # Sweet Beauty: a real All-America-Selections-winning "icebox" hybrid,
    # documented at 77-80 days, clearly faster than the 90-day default.
    ('Sweet Beauty', 78),
    # Jubilee: documented at 90-95 days, already matching the crop type's
    # own 90-day default - left unlisted. Native (Watermelon): generic,
    # left unlisted.

    # Every other variety in the system (Garlic, Ginger, Kamote, Sitaw,
    # Tobacco, Cacao, Coffee, Mango, and every generic "Native (X)" entry
    # anywhere) is deliberately left unlisted here - see this migration's
    # own module docstring above for why, per crop.
]


def seed_forward(apps, schema_editor):
    CropVariety = apps.get_model('production', 'CropVariety')
    for name, days in OVERRIDES:
        CropVariety.objects.filter(name=name).update(days_to_harvest=days)


def seed_reverse(apps, schema_editor):
    CropVariety = apps.get_model('production', 'CropVariety')
    names = [name for name, _ in OVERRIDES]
    CropVariety.objects.filter(name__in=names).update(days_to_harvest=None)


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0052_cropvariety_days_to_harvest'),
    ]

    operations = [
        migrations.RunPython(seed_forward, reverse_code=seed_reverse),
    ]
