"""Single authoritative Wet/Dry season rule for aquaculture stocking.

Philippine (Aringay) fisheries convention already used across the project:
    Wet season: June 1 - November 30  (months 6-11)
    Dry season: December 1 - May 31   (months 12, 1-5)

The frontend mirror is `detectSeason` in
oma-frontend/src/pages/FisheriesRecords/stockingHelpers.js - keep both in sync.
"""

WET_MONTHS = frozenset({6, 7, 8, 9, 10, 11})


def season_for_date(d):
    """Return 'Wet' or 'Dry' (the StockingRecord.season values) for a date, or None if no date."""
    if d is None:
        return None
    return 'Wet' if d.month in WET_MONTHS else 'Dry'
