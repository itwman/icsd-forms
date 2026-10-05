from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from apps.accounts.sms import lookup
from apps.billing.utils import plan_of
from apps.common.fa import to_en, valid_mobile
from .models import Membership, Workspace
from .utils import current_membership, require_role


@login_required
def team(request):
    m = current_membership(request)
    ws = m.workspace
    if request.method == "POST":
        act = request.POST.get("act")
        if act == "rename":
            require_role(m, "manage")
            name = request.POST.get("name", "").strip()[:120]
            if name:
                ws.name = name
                ws.save()
                messages.success(request, "نام فضای کاری عوض شد.")
        elif act == "invite":
            require_role(m, "manage")
            mobile = to_en(request.POST.get("mobile", "")).strip()
            role = request.POST.get("role", "editor")
            plan = plan_of(ws)
            count = ws.memberships.count()
            if role not in ("admin", "editor", "viewer"):
                role = "editor"
            if not valid_mobile(mobile):
                messages.error(request, "شماره موبایل معتبر نیست.")
            elif plan.max_members and count >= plan.max_members:
                messages.error(request, f"پلن «{plan.name}» حداکثر {plan.max_members} عضو دارد. برای افزودن عضو بیشتر پلن را ارتقا دهید.")
            else:
                from django.contrib.auth import get_user_model
                user = get_user_model().objects.filter(mobile=mobile).first()
                if user and Membership.objects.filter(workspace=ws, user=user).exists():
                    messages.info(request, "این کاربر از قبل عضو است.")
                elif not user and Membership.objects.filter(workspace=ws, mobile=mobile, user__isnull=True).exists():
                    messages.info(request, "این شماره قبلاً دعوت شده است.")
                else:
                    Membership.objects.create(workspace=ws, user=user, mobile="" if user else mobile, role=role, invited_by=request.user)
                    lookup(mobile, "invite", ws.name[:30], request.user.display_name[:30], background=True)
                    messages.success(request, "دعوت ثبت شد. وقتی با این شماره وارد سامانه شود، به تیم اضافه می‌شود.")
        elif act == "role":
            require_role(m, "manage")
            mm = get_object_or_404(Membership, pk=request.POST.get("id"), workspace=ws)
            role = request.POST.get("role")
            if mm.role != "owner" and role in ("admin", "editor", "viewer"):
                mm.role = role
                mm.save()
                messages.success(request, "نقش به‌روز شد.")
        elif act == "remove":
            mm = get_object_or_404(Membership, pk=request.POST.get("id"), workspace=ws)
            if mm.role == "owner":
                messages.error(request, "مالک فضای کاری حذف نمی‌شود.")
            elif mm.user_id == request.user.id or m.can_manage:
                mm.delete()
                messages.success(request, "عضو حذف شد.")
                if mm.user_id == request.user.id:
                    return redirect("surveys:dashboard")
        elif act == "new":
            name = request.POST.get("name", "").strip()[:120] or "فضای کاری جدید"
            nws = Workspace.objects.create(name=name, owner=request.user)
            Membership.objects.create(workspace=nws, user=request.user, role="owner")
            request.user.current_workspace = nws
            request.user.save(update_fields=["current_workspace"])
            messages.success(request, f"فضای کاری «{name}» ساخته شد.")
        return redirect("teams:team")
    members = ws.memberships.select_related("user").order_by("id")
    return render(request, "teams/team.html", {"m": m, "ws": ws, "members": members, "roles": Membership.ROLES[1:],
                                               "plan": plan_of(ws), "all": Membership.objects.filter(user=request.user).select_related("workspace")})


@login_required
@require_POST
def switch(request, pk):
    m = get_object_or_404(Membership, workspace_id=pk, user=request.user)
    request.user.current_workspace = m.workspace
    request.user.save(update_fields=["current_workspace"])
    return redirect(request.POST.get("next") or "surveys:dashboard")
