from django.core.exceptions import PermissionDenied
from django.http import Http404

from apps.teams.models import Membership
from .models import Survey


def get_survey(request, pk, need="view"):
    """فرم را فقط برای اعضای فضای کاری‌اش برمی‌گرداند. need: view | edit"""
    try:
        s = Survey.objects.select_related("workspace").get(pk=pk, is_deleted=False)
    except Survey.DoesNotExist:
        raise Http404
    m = Membership.objects.filter(workspace=s.workspace, user=request.user).first()
    if not m and not request.user.is_superuser:
        raise Http404
    if need == "edit" and m and not m.can_edit:
        raise PermissionDenied("نقش شما فقط مشاهده‌ی نتایج است.")
    return s, m
