"""Which names are valid assistance types: the built-in ones of each domain plus the ones added in Assistance Settings > Add Assistance."""
from .models import AssistanceCustomType, BeneficiaryRecord, FisherfolkBeneficiaryRecord

BUILT_IN = {
    'crop': tuple(BeneficiaryRecord.AssistanceType.values),
    'fisheries': tuple(FisherfolkBeneficiaryRecord.AssistanceType.values),
}
DOMAINS = tuple(BUILT_IN)


def domain_of(record_model):
    """'crop' for the farmers' assistance records, 'fisheries' for the fisherfolk's."""
    return 'crop' if record_model is BeneficiaryRecord else 'fisheries'


def custom_names(domain):
    return sorted(AssistanceCustomType.objects.filter(domain=domain).values_list('name', flat=True), key=str.lower)


def valid_type_names(domain):
    return [*BUILT_IN[domain], *custom_names(domain)]


def built_in_clash(name):
    """True when `name` is a built-in type of either domain (any capitals): a custom type may not reuse one."""
    wanted = name.casefold()
    return any(built.casefold() == wanted for names in BUILT_IN.values() for built in names)
