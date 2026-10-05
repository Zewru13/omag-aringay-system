"""Who may log a disaster: a fisherfolk needs something to log it against.

A disaster report describes damage to a pond, a cage or the stock in them, so a fisherfolk with no pond or cage
on record has nothing to report on. "Has a pond or cage" means ANY of: a registered Pond, a production cycle
(its ponds and cages) or a stocking record. The check is used by the create endpoint (the rule itself) and the
eligibility endpoint (so the screens can explain it before the person fills in a form)."""
from fisheries.models import Pond, StockingRecord

NO_PONDS_MESSAGE = (
    'You can only log a disaster once you have a pond or cage on record. '
    'Start a production cycle or ask OMAg to register your pond first.'
)


def fisherfolk_has_ponds(fisherfolk_id):
    from monitoring.models import AquacultureProductionCycle   # monitoring imports fisheries models
    if not fisherfolk_id:
        return False
    return (
        Pond.objects.filter(fisherfolk_id=fisherfolk_id).exists()
        or AquacultureProductionCycle.objects.filter(fisherfolk_id=fisherfolk_id).exists()
        or StockingRecord.objects.filter(fisherfolk_id=fisherfolk_id).exists()
    )
