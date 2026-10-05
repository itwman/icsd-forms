from django.core.exceptions import PermissionDenied

from .models import Membership


def current_membership(request):
    """عضویت کاربر در فضای کاری فعلی؛ اگر نبود، اولین فضای کاری‌اش."""
    user = request.user
    m = None
    if user.current_workspace_id:
        m = Membership.objects.filter(user=user, workspace_id=user.current_workspace_id).select_related("workspace").first()
    if m is None:
        m = Membership.objects.filter(user=user).select_related("workspace").first()
        if m:
            user.current_workspace = m.workspace
            user.save(update_fields=["current_workspace"])
    if m is None:
        from .signals import ensure_workspace
        ensure_workspace(user)
        m = Membership.objects.filter(user=user).select_related("workspace").first()
    return m


def require_role(membership, need="edit"):
    ok = {"view": True, "edit": membership.can_edit, "manage": membership.can_manage, "owner": membership.role == "owner"}[need]
    if not ok:
        raise PermissionDenied("نقش شما در این فضای کاری اجازه‌ی این کار را نمی‌دهد.")
