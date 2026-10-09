"""Name comparison used to keep crop types, varieties and crop records free of duplicates."""
import unicodedata


def normalize_name(value):
    """A name reduced to what makes it the same name to a person: Unicode-normalized (full-width digits become
    plain ones), case-folded, with every character that is not a letter or a digit removed. 'Rc 222', 'RC222',
    'Rc-222' and ' rc 222 ' all give 'rc222'. None or a name with no letters or digits gives ''."""
    if not value:
        return ''
    folded = unicodedata.normalize('NFKC', str(value)).casefold()
    return ''.join(ch for ch in folded if ch.isalnum())
