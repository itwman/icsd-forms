"""ابزار مشترک ویوهای پنل: دسترسی، منوی کناری، رندر و ثبت تاریخچه."""
from functools import wraps

from django.contrib.admin.models import LogEntry
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import PermissionDenied
from django.http import Http404
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils.http import urlencode

from . import resources  # noqa: F401  (ثبت منابع)
from .registry import GROUPS, REGISTRY

SPECIAL = {
    # نام ← (عنوان، آیکن، گروه، تابع دسترسی)
    "media": ("کتابخانه‌ی رسانه", "image", "site", lambda u: u.is_staff),
    "roles": ("نقش‌ها و مجوزها", "shield", "people", lambda u: u.is_superuser),
    "activity": ("تاریخچه‌ی تغییرات", "history", "people", lambda u: u.is_superuser),
    "tools": ("ابزارها و پشتیبان", "tool", "people", lambda u: u.is_superuser),
}
SPECIAL_FIRST = {"people": ["roles"]}
SPECIAL_LAST = {"site": ["media"], "people": ["activity", "tools"]}


def staff_required(view):
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        u = request.user
        if not u.is_authenticated:
            return redirect(f"{reverse('accounts:login')}?{urlencode({'next': request.get_full_path()})}")
        if not (u.is_active and u.is_staff):
            raise PermissionDenied
        return view(request, *args, **kwargs)
    return wrapper


def special_allowed(user, name):
    return user.is_superuser or SPECIAL[name][3](user)


def get_resource(key):
    r = REGISTRY.get(key)
    if not r:
        raise Http404("بخش پیدا نشد")
    return r


def sidebar(request, active=""):
    u = request.user
    groups = []
    for gkey, gtitle in GROUPS:
        items = []

        def add_special(name):
            if special_allowed(u, name):
                t, ic, _, _ = SPECIAL[name]
                items.append({"title": t, "icon": ic, "url": reverse(f"panel:{name}"), "active": active == name, "badge": 0})

        for name in SPECIAL_FIRST.get(gkey, []):
            add_special(name)
        for r in REGISTRY.values():
            if r.group != gkey or r.hidden_in_menu or not r.can_view(u):
                continue
            try:
                badge = r.badge() if r.badge else 0
            except Exception:
                badge = 0
            items.append({"title": r.title, "icon": r.icon, "url": r.list_url(), "active": active == r.key, "badge": badge})
        for name in SPECIAL_LAST.get(gkey, []):
            add_special(name)
        if items:
            groups.append({"title": gtitle, "items": items})
    return groups


def panel_render(request, template, ctx=None, active="", status=200):
    ctx = dict(ctx or {})
    ctx["nav"] = sidebar(request, active)
    ctx["active"] = active
    return render(request, template, ctx, status=status)


def log(request, obj, flag, message=""):
    try:
        LogEntry.objects.create(user_id=request.user.pk, content_type_id=ContentType.objects.get_for_model(obj).pk,
                                object_id=str(obj.pk), object_repr=str(obj)[:200], action_flag=flag,
                                change_message=message[:1000])
    except Exception:
        pass
