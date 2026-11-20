"""What the quantity box of an assistance may hold. It is free text ("10 bags", "P 5,000"), blank when the type has no quantity, but when
something is written it must contain a real amount: more than 0 and not absurdly large (a negative "-5 sacks" or "99999999999 kg" is a
typing slip)."""
import re
from decimal import Decimal, InvalidOperation

MAX_QUANTITY = Decimal('1000000')
_NUMBER = re.compile(r'-?\d[\d,]*(?:\.\d+)?|-?\.\d+')


def quantity_problem(text):
    """None when the quantity is fine, otherwise a short message for the person typing it."""
    text = (text or '').strip()
    if not text:
        return None
    found = _NUMBER.search(text)
    if not found:
        return 'Enter the quantity as a number, for example 10 or 10 bags.'
    try:
        amount = Decimal(found.group().replace(',', ''))
    except InvalidOperation:
        return 'Enter the quantity as a number, for example 10 or 10 bags.'
    if amount <= 0:
        return 'Quantity must be more than 0.'
    if amount > MAX_QUANTITY:
        return f'Quantity cannot be more than {MAX_QUANTITY:,}.'
    return None
