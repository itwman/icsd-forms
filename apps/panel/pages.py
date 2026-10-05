"""صفحه‌های ویژه‌ی پنل: داشبورد، صفحه‌ساز، منو، رسانه، مرکز سئو، آمار، نقش‌ها، تاریخچه، ابزارها و جستجو."""
import json
import os
import platform
import re
import time
from datetime import timedelta
from functools import reduce
from io import StringIO
from operator import or_

import django
import jdatetime
from django.conf import settings
from django.contrib import messages
from django.contrib.admin.models import LogEntry
from django.contrib.auth.models import Group, Permission
from django.core.cache import cache
from django.core.exceptions import PermissionDenied
from django.core.files.storage import default_storage
from django.core.management import call_command
from django.core.paginator import Paginator
from django.db import connection
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.http import Http404, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from django.utils.text import get_valid_filename
from django.views.decorators.http import require_POST

from .base import panel_render, special_allowed, staff_required
from .cells import fa, jdt
from .registry import GROUPS, REGISTRY


def _need_special(request, name):
    if not special_allowed(request.user, name):
        raise PermissionDenied


def _num(n):
    return fa(f"{n:,}".replace(",", "٬"))


# ═══════════════════ کتابخانه‌ی رسانه ═══════════════════
MEDIA_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".pdf", ".zip", ".epub", ".docx", ".xlsx", ".pptx",
             ".mp4", ".webm", ".mp3", ".txt", ".csv"}
IMG = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"}
SVG_BAD = re.compile(rb"<\s*script|<\s*foreignObject|\son[a-z]+\s*=|javascript:|<!ENTITY", re.I)


def _safe_rel(rel):
    root = os.path.realpath(settings.MEDIA_ROOT)
    full = os.path.realpath(os.path.join(root, (rel or "").lstrip("/")))
    if full != root and not full.startswith(root + os.sep):
        raise PermissionDenied
    return root, full


def _human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def _media_items(folder, q="", kind=""):
    root, full = _safe_rel(folder)
    dirs, files = [], []
    if q:
        for base, ds, fs in os.walk(full):
            ds[:] = [d for d in ds if not d.startswith(".")]
            for f in fs:
                if q.lower() in f.lower():
                    files.append(os.path.join(base, f))
            if len(files) > 600:
                break
    elif os.path.isdir(full):
        for e in sorted(os.scandir(full), key=lambda e: (not e.is_dir(), e.name.lower())):
            if e.name.startswith("."):
                continue
            (dirs if e.is_dir() else files).append(e.path)
    out = []
    for p in files:
        ext = os.path.splitext(p)[1].lower()
        if kind == "image" and ext not in IMG or kind == "doc" and ext in IMG:
            continue
        try:
            st = os.stat(p)
        except OSError:
            continue
        rel = os.path.relpath(p, root).replace(os.sep, "/")
        out.append({"name": os.path.basename(p), "rel": rel, "url": settings.MEDIA_URL + rel, "ext": ext.lstrip("."),
                    "img": ext in IMG, "size": _human(st.st_size), "mtime": st.st_mtime,
                    "date": jdt(timezone.datetime.fromtimestamp(st.st_mtime, tz=timezone.get_current_timezone()))})
    if q:
        out.sort(key=lambda x: -x["mtime"])
    return [{"name": os.path.basename(d), "rel": os.path.relpath(d, root).replace(os.sep, "/")} for d in dirs], out


@staff_required
def media(request):
    _need_special(request, "media")
    folder = request.GET.get("dir", "").strip("/")
    q = request.GET.get("q", "").strip()
    kind = request.GET.get("kind", "")
    dirs, files = _media_items(folder, q, kind)
    page = Paginator(files, 60).get_page(request.GET.get("page"))
    crumbs, acc = [], ""
    for part in [p for p in folder.split("/") if p]:
        acc = f"{acc}/{part}".strip("/")
        crumbs.append((part, acc))
    if request.GET.get("format") == "json":
        return JsonResponse({"dirs": dirs, "files": [{k: v for k, v in f.items() if k != "mtime"} for f in page.object_list],
                             "pages": page.paginator.num_pages, "page": page.number, "dir": folder})
    return panel_render(request, "panel/media.html", {"dirs": dirs, "page": page, "folder": folder, "crumbs": crumbs, "q": q,
                                                      "kind": kind, "can_delete": request.user.is_superuser}, active="media")


@staff_required
@require_POST
def media_upload(request):
    _need_special(request, "media")
    folder = request.POST.get("dir", "").strip("/") or timezone.localdate().strftime("uploads/%Y/%m")
    _safe_rel(folder)
    saved, errors = [], []
    for f in request.FILES.getlist("files"):
        ext = os.path.splitext(f.name)[1].lower()
        if ext not in MEDIA_EXT:
            errors.append(f"{f.name}: این نوع فایل مجاز نیست")
            continue
        if f.size > 50 * 1024 * 1024:
            errors.append(f"{f.name}: بیشتر از ۵۰ مگابایت")
            continue
        if ext == ".svg":
            head = f.read()
            f.seek(0)
            if SVG_BAD.search(head):
                errors.append(f"{f.name}: SVG دارای اسکریپت است")
                continue
        name = default_storage.save(f"{folder}/{get_valid_filename(f.name)}", f)
        saved.append({"rel": name, "url": default_storage.url(name), "name": os.path.basename(name), "img": ext in IMG})
    if request.headers.get("x-requested-with") == "fetch":
        return JsonResponse({"saved": saved, "errors": errors})
    for e in errors:
        messages.error(request, e)
    if saved:
        messages.success(request, f"{len(saved)} فایل آپلود شد.")
    return redirect(f"{request.path.replace('upload/', '')}?dir={folder}")


@staff_required
@require_POST
def media_delete(request):
    if not request.user.is_superuser:
        raise PermissionDenied
    rel = request.POST.get("rel", "")
    root, full = _safe_rel(rel)
    if os.path.isfile(full):
        os.remove(full)
        messages.success(request, "فایل حذف شد.")
    elif os.path.isdir(full) and full != root and not os.listdir(full):
        os.rmdir(full)
        messages.success(request, "پوشه‌ی خالی حذف شد.")
    else:
        messages.error(request, "فقط فایل یا پوشه‌ی خالی را می‌توان حذف کرد.")
    return redirect(request.POST.get("back") or "panel:media")


@staff_required
@require_POST
def media_mkdir(request):
    _need_special(request, "media")
    parent = request.POST.get("dir", "").strip("/")
    name = get_valid_filename(request.POST.get("name", "").strip())
    if not name:
        return redirect("panel:media")
    _, full = _safe_rel(f"{parent}/{name}".strip("/"))
    os.makedirs(full, exist_ok=True)
    return redirect(f"/panel/media/?dir={parent + '/' if parent else ''}{name}")


# ═══════════════════ نقش‌ها و مجوزها ═══════════════════
ACTIONS = [("view", "دیدن"), ("add", "افزودن"), ("change", "ویرایش"), ("delete", "حذف")]


@staff_required
def roles(request):
    _need_special(request, "roles")
    groups = Group.objects.annotate(users=Count("user"), perms=Count("permissions")).order_by("name")
    return panel_render(request, "panel/roles.html", {"groups": groups}, active="roles")


@staff_required
def role_edit(request, pk=None):
    _need_special(request, "roles")
    group = get_object_or_404(Group, pk=pk) if pk else Group()
    matrix = []
    for gkey, gtitle in GROUPS:
        rows = []
        for r in REGISTRY.values():
            if r.group != gkey or r.singleton and r.key != "settings":
                continue
            perms = {p.codename: p for p in Permission.objects.filter(content_type__app_label=r.app_label,
                                                                        content_type__model=r.model_name)}
            cells = [(a, perms.get(f"{a}_{r.model_name}")) for a, _ in ACTIONS]
            rows.append({"r": r, "cells": cells})
        if rows:
            matrix.append({"title": gtitle, "rows": rows})
    current = set(group.permissions.values_list("pk", flat=True)) if group.pk else set()
    if request.method == "POST":
        name = request.POST.get("name", "").strip()
        if request.POST.get("act") == "delete" and group.pk:
            group.delete()
            messages.success(request, "نقش حذف شد.")
            return redirect("panel:roles")
        if not name:
            messages.error(request, "نام نقش را وارد کنید.")
        elif Group.objects.exclude(pk=group.pk).filter(name=name).exists():
            messages.error(request, "نقشی با این نام وجود دارد.")
        else:
            group.name = name
            group.save()
            ids = [int(x) for x in request.POST.getlist("perms") if x.isdigit()]
            group.permissions.set(Permission.objects.filter(pk__in=ids))
            messages.success(request, f"نقش «{name}» ذخیره شد ({fa(len(ids))} مجوز).")
            return redirect("panel:role_edit", pk=group.pk)
    members = group.user_set.all()[:50] if group.pk else []
    return panel_render(request, "panel/role_edit.html", {"group": group, "matrix": matrix, "current": current,
                                                          "actions": ACTIONS, "members": members,
                                                          "users_url": REGISTRY["accounts-user"].list_url()}, active="roles")


# ═══════════════════ تاریخچه ═══════════════════
@staff_required
def activity(request):
    _need_special(request, "activity")
    qs = LogEntry.objects.select_related("user", "content_type").order_by("-action_time")
    if request.GET.get("user"):
        qs = qs.filter(user_id=request.GET["user"])
    page = Paginator(qs, 50).get_page(request.GET.get("page"))
    for e in page.object_list:
        r = REGISTRY.get(f"{e.content_type.app_label}-{e.content_type.model}") if e.content_type else None
        r = r or next((x for x in REGISTRY.values() if e.content_type and x.app_label == e.content_type.app_label
                       and x.model_name == e.content_type.model), None)
        e.panel_url = (r.url("edit", e.object_id) if r and not r.singleton and e.action_flag != 3 else
                       (r.list_url() if r else ""))
        e.res_title = r.title_single if r else (e.content_type.name if e.content_type else "")
    return panel_render(request, "panel/activity.html", {"page": page}, active="activity")


# ═══════════════════ ابزارها ═══════════════════
def _dir_size(path):
    total, n = 0, 0
    for base, _, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(base, f))
                n += 1
            except OSError:
                pass
    return total, n


BACKUP_APPS = ["core", "accounts", "teams", "billing", "surveys", "auth.group"]


@staff_required
def tools(request):
    _need_special(request, "tools")
    if request.method == "POST":
        act = request.POST.get("act")
        if act == "cache":
            cache.clear()
            messages.success(request, "حافظه‌ی موقت (کش) پاک شد.")
        elif act == "backup":
            buf = StringIO()
            call_command("dumpdata", *BACKUP_APPS, natural_foreign=True, indent=1, stdout=buf,
                         exclude=["accounts.otp"])
            resp = HttpResponse(buf.getvalue(), content_type="application/json; charset=utf-8")
            stamp = jdatetime.datetime.now().strftime("%Y-%m-%d-%H%M")
            resp["Content-Disposition"] = f'attachment; filename="icsd-backup-{stamp}.json"'
            return resp
        elif act == "cleanup":
            from apps.accounts.models import OTP
            from apps.surveys.models import Response, ResponseFile
            n1 = OTP.objects.filter(created_at__lt=timezone.now() - timedelta(days=2)).delete()[0]
            n2 = Response.objects.filter(completed_at__isnull=True, started_at__lt=timezone.now() - timedelta(days=60)).delete()[0]
            n3 = ResponseFile.objects.filter(response__isnull=True, created_at__lt=timezone.now() - timedelta(days=2)).delete()[0]
            messages.success(request, f"پاک‌سازی انجام شد: {fa(n1)} کد پیامکی، {fa(n2)} پاسخ نیمه‌کاره‌ی قدیمی، {fa(n3)} فایل بی‌صاحب.")
        return redirect("panel:tools")
    size, files = _dir_size(settings.MEDIA_ROOT)
    db = connection.vendor
    info = [("نسخه‌ی جنگو", django.get_version()), ("پایتون", platform.python_version()), ("پایگاه داده", db),
            ("حجم رسانه‌ها", f"{_human(size)} ({fa(files)} فایل)"), ("حالت DEBUG", "روشن ⚠" if settings.DEBUG else "خاموش"),
            ("منطقه‌ی زمانی", settings.TIME_ZONE)]
    return panel_render(request, "panel/tools.html", {"info": info}, active="tools")


# ═══════════════════ جستجوی سراسری ═══════════════════
@staff_required
def search(request):
    q = request.GET.get("q", "").strip()
    results = []
    if len(q) >= 2:
        for r in REGISTRY.values():
            if not r.search or not r.can_view(request.user) or r.view_perm_only:
                continue
            qs = r.queryset(request).filter(reduce(or_, [Q(**{f"{f}__icontains": q}) for f in r.search]))[:6]
            items = [(o, r.edit_url(o)) for o in qs]
            if items:
                results.append({"r": r, "items": items})
    if request.GET.get("format") == "json":
        return JsonResponse({"results": [{"group": g["r"].title, "items": [{"text": str(o)[:80], "url": u} for o, u in g["items"]]}
                                         for g in results]})
    return panel_render(request, "panel/search.html", {"q": q, "results": results})


# ═══════════════════ داشبورد سوپرادمین ═══════════════════
def _series(qs, field, days=30):
    today = timezone.localdate()
    start = today - timedelta(days=days - 1)
    rows = dict(qs.filter(**{f"{field}__date__gte": start}).annotate(d=TruncDate(field)).values_list("d").annotate(n=Count("id")))
    out = [{"label": fa(jdatetime.date.fromgregorian(date=start + timedelta(days=i)).strftime("%m/%d")),
            "v": rows.get(start + timedelta(days=i), 0)} for i in range(days)]
    peak = max([p["v"] for p in out] + [1])
    for p in out:
        p["h"] = round(p["v"] * 100 / peak, 1)
    return out, peak


@staff_required
def dashboard(request):
    from apps.accounts.models import User
    from apps.billing.models import Payment, Subscription
    from apps.surveys.models import Response, Survey
    from apps.teams.models import Workspace
    from apps.common.fa import jdate
    now = timezone.now()
    d30 = now - timedelta(days=30)
    done = Response.objects.filter(completed_at__isnull=False, is_test=False)
    series, peak = _series(done, "completed_at")
    paid = Payment.objects.filter(status="paid")
    kpis = [
        {"t": "کاربران", "v": _num(User.objects.count()), "i": "users", "c": "sabz", "url": REGISTRY["accounts-user"].list_url()},
        {"t": "کاربر جدید (۳۰ روز)", "v": _num(User.objects.filter(date_joined__gte=d30).count()), "i": "user", "c": "firoozeh"},
        {"t": "فرم‌ها", "v": _num(Survey.objects.filter(is_deleted=False).count()), "i": "doc", "c": "zaferan", "url": REGISTRY["surveys"].list_url()},
        {"t": "فرم منتشرشده", "v": _num(Survey.objects.filter(status="published", is_deleted=False).count()), "i": "send", "c": "sabz"},
        {"t": "پاسخ (۳۰ روز)", "v": _num(done.filter(completed_at__gte=d30).count()), "i": "inbox", "c": "firoozeh"},
        {"t": "کل پاسخ‌ها", "v": _num(done.count()), "i": "bars", "c": "zaferan"},
        {"t": "اشتراک پولی فعال", "v": _num(Subscription.objects.filter(plan__price_monthly__gt=0, expires_at__gt=now).count()), "i": "award", "c": "golab"},
        {"t": "درآمد ۳۰ روز (تومان)", "v": _num(sum(paid.filter(paid_at__gte=d30).values_list("amount", flat=True))), "i": "cart", "c": "golab",
         "url": REGISTRY["payments"].list_url()},
    ]
    top = Survey.objects.filter(is_deleted=False).order_by("-response_count").select_related("workspace")[:8]
    return panel_render(request, "panel/dashboard.html", {
        "kpis": kpis, "series": series, "peak": _num(peak), "top": top,
        "new_users": User.objects.order_by("-date_joined")[:8], "payments": paid.select_related("workspace", "plan")[:8],
        "today": jdate(timezone.localdate(), "%A %d %B %Y"), "workspaces": _num(Workspace.objects.count()),
    }, active="dashboard")
