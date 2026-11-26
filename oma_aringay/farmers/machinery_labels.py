"""How a machinery ownership is shown. The saved value 'Organization-Owned' keeps its older name (changing it would mean
changing stored records); people read it, and may type it in a file, as Cooperative-Owned."""

SHOWN_AS = {'Organization-Owned': 'Cooperative-Owned'}


def ownership_label(value):
    return SHOWN_AS.get(value, value)
