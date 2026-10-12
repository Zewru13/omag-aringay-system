"""Equipment actions of an organization: change condition, repair, history (and, in later parts, loans)."""
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsOrgCitizenOrStaff, IsOwnOrgOrStaff
from core.utils import build_name_search_q
from core.validators import validate_not_future_date

from . import equipment_ops
from .models import FarmersOrganizationEquipment
from .serializers import FarmersOrganizationEquipmentSerializer, FisherfolkOrganizationEquipmentSerializer

LINE_SERIALIZERS = {
    'farmers': FarmersOrganizationEquipmentSerializer,
    'fisherfolk': FisherfolkOrganizationEquipmentSerializer,
}
CONDITIONS = FarmersOrganizationEquipment.Condition.values  # the fisherfolk model has the same five


class ConditionRequestSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1)
    condition = serializers.ChoiceField(choices=CONDITIONS)


class RepairRequestSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1)
    repaired_on = serializers.DateField()
    description = serializers.CharField(max_length=255)  # trimmed, may not be blank
    cost = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0, required=False, allow_null=True)

    def validate_repaired_on(self, value):
        validate_not_future_date(value, 'Repair date')
        return value


class _LineView(APIView):
    """Base for views addressed by an equipment line id. An organization account reaches only its own lines (any other id
    is a 404); staff reach any."""
    permission_classes = [IsAuthenticated, IsOrgCitizenOrStaff]
    domain_key = None

    @property
    def org_linked_record_type(self):
        return equipment_ops.equipment_domain(self.domain_key).linked_type

    def domain(self):
        return equipment_ops.equipment_domain(self.domain_key)

    def scoped_line(self, request, equip_id):
        qs = self.domain().line_model.objects.all()
        if request.user.role == 'CITIZEN':
            qs = qs.filter(organization_id=request.user.linked_record_id)
        return get_object_or_404(qs, pk=equip_id)

    def line_data(self, line):
        line.refresh_from_db()
        return LINE_SERIALIZERS[self.domain_key](self.domain().line_model.objects.prefetch_related('loans__member').get(pk=line.pk)).data


class EquipmentConditionView(_LineView):
    """POST {quantity, condition}: move that many units of the line to another condition."""

    def post(self, request, equip_id):
        line = self.scoped_line(request, equip_id)
        s = ConditionRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        source, target = equipment_ops.change_condition(self.domain(), line.pk, s.validated_data['quantity'], s.validated_data['condition'])
        return Response({'from': self.line_data(source), 'to': self.line_data(target)})


class EquipmentRepairView(_LineView):
    """POST {quantity, repaired_on, description, cost?}: repaired units go back to Good and the repair is logged."""

    def post(self, request, equip_id):
        line = self.scoped_line(request, equip_id)
        s = RepairRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = dict(s.validated_data)
        data['description'] = data['description'].strip()
        if not data['description']:
            raise serializers.ValidationError({'description': 'Say what was done.'})
        row = equipment_ops.repair(
            self.domain(), request.user, line.pk, data['quantity'], data['repaired_on'], data['description'], data.get('cost'))
        return Response({'repair': equipment_ops.repair_data(row), 'line': self.line_data(line)})


class EquipmentHistoryView(_LineView):
    """GET: the repairs and loans of this equipment, newest first. Units move between condition lines (a repaired unit
    leaves the Broken line for the Good one), so the history covers every line of the same equipment in the organization."""

    def get(self, request, equip_id):
        line = self.scoped_line(request, equip_id)
        domain = self.domain()
        same = domain.line_model.objects.filter(
            organization_id=line.organization_id, equipment_name=line.equipment_name, equipment_name_other=line.equipment_name_other)
        repairs = domain.repair_model.objects.filter(equipment__in=same).select_related('recorded_by')
        loans = domain.loan_model.objects.filter(equipment__in=same).select_related('member', 'equipment')
        return Response({
            'repairs': [equipment_ops.repair_data(r) for r in repairs],
            'loans': [equipment_ops.loan_data(l) for l in loans],
        })


class LendRequestSerializer(serializers.Serializer):
    member = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1)
    due_date = serializers.DateField(required=False, allow_null=True)


class EquipmentLendView(_LineView):
    """POST {member, quantity, due_date?}: lend Good units to an active member (BORROWED at once)."""

    def post(self, request, equip_id):
        line = self.scoped_line(request, equip_id)
        s = LendRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        loan = equipment_ops.lend(self.domain(), request.user, line.pk, d['member'], d['quantity'], d.get('due_date'))
        return Response(equipment_ops.loan_data(loan), status=status.HTTP_201_CREATED)


class _LoanView(APIView):
    """Base for views addressed by a loan id; an organization account reaches only its own organization's loans."""
    permission_classes = [IsAuthenticated, IsOrgCitizenOrStaff]
    domain_key = None

    @property
    def org_linked_record_type(self):
        return equipment_ops.equipment_domain(self.domain_key).linked_type

    def domain(self):
        return equipment_ops.equipment_domain(self.domain_key)

    def scoped_loan(self, request, loan_id):
        qs = self.domain().loan_model.objects.all()
        if request.user.role == 'CITIZEN':
            qs = qs.filter(equipment__organization_id=request.user.linked_record_id)
        return get_object_or_404(qs, pk=loan_id)


class EquipmentLoanApproveView(_LoanView):
    def post(self, request, loan_id):
        loan = self.scoped_loan(request, loan_id)
        loan = equipment_ops.approve(self.domain(), request.user, loan.pk)
        equipment_ops.loan_notify(self.domain(), loan, 'approved', actor=request.user)
        return Response(equipment_ops.loan_data(loan))


class EquipmentLoanRejectView(_LoanView):
    def post(self, request, loan_id):
        loan = self.scoped_loan(request, loan_id)
        loan = equipment_ops.reject(self.domain(), request.user, loan.pk, request.data.get('reason', ''))
        equipment_ops.loan_notify(self.domain(), loan, 'rejected', actor=request.user)
        return Response(equipment_ops.loan_data(loan))


class EquipmentLoanReturnView(_LoanView):
    """POST {breakdown?: [{condition, quantity}]}: the organization confirms what came back (default: all Good)."""

    def post(self, request, loan_id):
        loan = self.scoped_loan(request, loan_id)
        loan = equipment_ops.return_loan(self.domain(), request.user, loan.pk, request.data.get('breakdown'))
        equipment_ops.loan_notify(self.domain(), loan, 'returned', actor=request.user)
        return Response(equipment_ops.loan_data(loan))


class EquipmentLoanListView(APIView):
    """GET: the organization's loans. Filters: status, member (name), equipment (name), overdue=1."""
    permission_classes = [IsAuthenticated, IsOwnOrgOrStaff]
    domain_key = None

    @property
    def org_linked_record_type(self):
        return equipment_ops.equipment_domain(self.domain_key).linked_type

    def get(self, request, pk):
        domain = equipment_ops.equipment_domain(self.domain_key)
        loans = domain.loan_model.objects.filter(equipment__organization_id=pk).select_related('equipment', 'member')
        params = request.query_params
        if params.get('status'):
            loans = loans.filter(status=params['status'].upper())
        member = (params.get('member') or '').strip()
        if member:
            loans = loans.filter(build_name_search_q(member, ['member__first_name', 'member__middle_name', 'member__last_name']))
        equipment = (params.get('equipment') or '').strip()
        if equipment:
            loans = loans.filter(Q(equipment__equipment_name__icontains=equipment) | Q(equipment__equipment_name_other__icontains=equipment))
        if params.get('overdue') in ('1', 'true'):
            loans = loans.filter(status__in=equipment_ops.OUT_STATUSES, due_date__lt=timezone.localdate())
        today = timezone.localdate()
        return Response([equipment_ops.loan_data(loan, today) for loan in loans])


class MemberRequestSerializer(serializers.Serializer):
    equipment = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1)
    due_date = serializers.DateField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, max_length=500)


class _MemberView(APIView):
    """Farmer and fisherfolk accounts only (an organization account or staff gets 403)."""
    permission_classes = [IsAuthenticated]

    def context(self, request):
        ctx = equipment_ops.member_context(request.user) if request.user.role == 'CITIZEN' else None
        if ctx is None:
            raise PermissionDenied('Only farmer and fisherfolk accounts can borrow equipment.')
        return ctx


class MyEquipmentView(_MemberView):
    """GET: for each organization the person actively belongs to, what can be borrowed and the person's own loans."""

    def get(self, request):
        domain, person_id = self.context(request)
        today = timezone.localdate()
        groups = []
        for membership in equipment_ops.member_organizations(domain, person_id):
            org = membership.organization
            lines = domain.line_model.objects.filter(organization=org, quantity__gt=0, condition=equipment_ops.GOOD) \
                .prefetch_related('loans__member').order_by('equipment_name', 'id')
            lendable = [
                {'id': line.id, 'equipment_name': equipment_ops.equipment_label(line), 'available': equipment_ops.available(line),
                 'remarks': line.remarks}
                for line in lines if equipment_ops.available(line) > 0
            ]
            loans = domain.loan_model.objects.filter(member_id=person_id, equipment__organization=org) \
                .select_related('equipment', 'member')
            groups.append({'organization': {'id': org.id, 'name': org.name}, 'equipment': lendable,
                           'loans': [equipment_ops.loan_data(loan, today) for loan in loans]})
        return Response(groups)


class MyEquipmentRequestView(_MemberView):
    def post(self, request):
        domain, person_id = self.context(request)
        s = MemberRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        loan = equipment_ops.member_request(domain, request.user, person_id, d['equipment'], d['quantity'], d.get('due_date'), d.get('note', ''))
        equipment_ops.loan_notify(domain, loan, 'request', actor=request.user)
        return Response(equipment_ops.loan_data(loan), status=status.HTTP_201_CREATED)


class MyEquipmentCancelView(_MemberView):
    def post(self, request, loan_id):
        domain, person_id = self.context(request)
        loan = equipment_ops.member_cancel(domain, person_id, loan_id)
        return Response(equipment_ops.loan_data(domain.loan_model.objects.select_related('equipment', 'member').get(pk=loan.pk)))


class MyEquipmentReturnView(_MemberView):
    def post(self, request, loan_id):
        domain, person_id = self.context(request)
        loan = equipment_ops.member_return(domain, person_id, loan_id)
        loan = domain.loan_model.objects.select_related('equipment', 'member').get(pk=loan.pk)
        equipment_ops.loan_notify(domain, loan, 'return_requested', actor=request.user)
        return Response(equipment_ops.loan_data(loan))


class EquipmentRemoveGuard:
    """For the Remove views: a line with any loan or repair row is never deleted (its history would go with it)."""

    def destroy(self, request, *args, **kwargs):
        line = self.get_object()
        if line.loans.exists() or line.repairs.exists():
            return Response(
                {'detail': 'This equipment has loan or repair history and cannot be removed. Mark it Lost or Broken instead.'},
                status=status.HTTP_409_CONFLICT)
        return super().destroy(request, *args, **kwargs)


def _make(base, key):
    return type(f'{base.__name__}{key.title()}', (base,), {'domain_key': key})


FarmersEquipmentConditionView = _make(EquipmentConditionView, 'farmers')
FisherfolkEquipmentConditionView = _make(EquipmentConditionView, 'fisherfolk')
FarmersEquipmentRepairView = _make(EquipmentRepairView, 'farmers')
FisherfolkEquipmentRepairView = _make(EquipmentRepairView, 'fisherfolk')
FarmersEquipmentHistoryView = _make(EquipmentHistoryView, 'farmers')
FisherfolkEquipmentHistoryView = _make(EquipmentHistoryView, 'fisherfolk')
FarmersEquipmentLendView = _make(EquipmentLendView, 'farmers')
FisherfolkEquipmentLendView = _make(EquipmentLendView, 'fisherfolk')
FarmersEquipmentLoanApproveView = _make(EquipmentLoanApproveView, 'farmers')
FisherfolkEquipmentLoanApproveView = _make(EquipmentLoanApproveView, 'fisherfolk')
FarmersEquipmentLoanRejectView = _make(EquipmentLoanRejectView, 'farmers')
FisherfolkEquipmentLoanRejectView = _make(EquipmentLoanRejectView, 'fisherfolk')
FarmersEquipmentLoanReturnView = _make(EquipmentLoanReturnView, 'farmers')
FisherfolkEquipmentLoanReturnView = _make(EquipmentLoanReturnView, 'fisherfolk')
FarmersEquipmentLoanListView = _make(EquipmentLoanListView, 'farmers')
FisherfolkEquipmentLoanListView = _make(EquipmentLoanListView, 'fisherfolk')
