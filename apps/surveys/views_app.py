"""پیشخوان کاربر: فهرست فرم‌ها، ساخت از صفر یا قالب، پوشه‌ها، فرم‌ساز و اشتراک‌گذاری."""
import copy
import json

import segno
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import Count, Max, Q
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_POST

from apps.billing.utils import can_create_survey, plan_of, usage
from apps.common.fa import parse_jalali_dt
from apps.teams.utils import current_membership, require_role
from . import engine
from .access import get_survey
from .models import Folder, Response, Survey, Template

SORTS = {"updated": "-updated_at", "created": "-created_at", "title": "title", "responses": "-response_count"}


@login_required
def dashboard(request):
    m = current_membership(request)
    ws = m.workspace
    qs = Survey.objects.filter(workspace=ws, is_deleted=False).select_related("folder")
    folder = request.GET.get("folder", "")
    q = request.GET.get("q", "").strip()
    status = request.GET.get("status", "")
    if folder == "none":
        qs = qs.filter(folder__isnull=True)
    elif folder.isdigit():
        qs = qs.filter(folder_id=folder)
    if q:
        qs = qs.filter(title__icontains=q)
    if status in dict(Survey.STATUS):
        qs = qs.filter(status=status)
    sort = request.GET.get("sort", "updated")
    qs = qs.order_by(SORTS.get(sort, "-updated_at"))
    surveys = list(qs[:300])
    last = dict(Response.objects.filter(survey__in=surveys, completed_at__isnull=False, is_test=False)
                .values_list("survey").annotate(m=Max("completed_at")))
    for s in surveys:
        s.last_response = last.get(s.pk)
    plan = plan_of(ws)
    return render(request, "surveys/dashboard.html", {
        "m": m, "ws": ws, "surveys": surveys, "folders": Folder.objects.filter(workspace=ws).annotate(n=Count("surveys", filter=Q(surveys__is_deleted=False))),
        "folder": folder, "q": q, "status": status, "sort": sort, "plan": plan, "usage": usage(ws),
        "templates": Template.objects.filter(is_active=True, is_featured=True)[:6],
        "workspaces": request.user.memberships.select_related("workspace"),
    })


@login_required
def new(request):
    m = current_membership(request)
    require_role(m, "edit")
    ok, plan = can_create_survey(m.workspace)
    if request.method == "POST":
        if not ok:
            messages.error(request, f"پلن «{plan.name}» حداکثر {plan.max_surveys} فرم دارد. برای فرم بیشتر پلن را ارتقا دهید.")
            return redirect("billing:billing")
        tpl = Template.objects.filter(slug=request.POST.get("template", ""), is_active=True).first()
        title = request.POST.get("title", "").strip()[:200]
        schema = engine.clean_schema(copy.deepcopy(tpl.schema)) if tpl else engine.default_schema()
        if not tpl and not schema["welcome"]["title"]:
            schema["welcome"]["title"] = title or "فرم بدون عنوان"
        s = Survey.objects.create(workspace=m.workspace, created_by=request.user, title=title or (tpl.title if tpl else "فرم بدون عنوان"),
                                  draft=schema, has_unpublished=True,
                                  folder_id=request.POST.get("folder") if str(request.POST.get("folder", "")).isdigit() else None)
        if tpl:
            Template.objects.filter(pk=tpl.pk).update(uses=tpl.uses + 1)
        return redirect("surveys:edit", pk=s.pk)
    cat = request.GET.get("cat", "")
    tpls = Template.objects.filter(is_active=True)
    if cat:
        tpls = tpls.filter(category=cat)
    return render(request, "surveys/new.html", {"m": m, "ok": ok, "plan": plan, "templates": tpls, "cats": Template.CATS,
                                                "cat": cat, "folder": request.GET.get("folder", "")})


@login_required
@require_POST
def action(request, pk):
    s, m = get_survey(request, pk, "edit")
    act = request.POST.get("act")
    if act == "rename":
        t = request.POST.get("title", "").strip()[:200]
        if t:
            s.title = t
            s.save(update_fields=["title", "updated_at"])
    elif act == "duplicate":
        ok, plan = can_create_survey(m.workspace)
        if not ok:
            messages.error(request, "به سقف تعداد فرم پلن رسیده‌اید.")
            return redirect("surveys:dashboard")
        n = Survey.objects.create(workspace=s.workspace, folder=s.folder, created_by=request.user, title=f"{s.title} (کپی)",
                                  draft=copy.deepcopy(s.draft), has_unpublished=True)
        for f in ("starts_at", "ends_at", "max_responses", "closed_message", "one_per_device", "verify_mobile", "one_per_mobile",
                  "save_partial", "hidden_fields", "notify_email"):
            setattr(n, f, getattr(s, f))
        n.save()
        messages.success(request, "کپی ساخته شد.")
    elif act == "delete":
        require_role(m, "manage") if s.created_by_id != request.user.id else None
        s.is_deleted = True
        s.status = "closed"
        s.save(update_fields=["is_deleted", "status", "updated_at"])
        messages.success(request, f"«{s.title}» حذف شد.")
    elif act == "move":
        f = request.POST.get("folder", "")
        s.folder = Folder.objects.filter(pk=f, workspace=s.workspace).first() if f.isdigit() else None
        s.save(update_fields=["folder", "updated_at"])
    elif act == "template" and request.user.is_staff:
        from django.utils.text import slugify
        base = slugify(s.title, allow_unicode=True)[:70] or f"tpl-{s.pk}"
        slug, i = base, 2
        while Template.objects.filter(slug=slug).exists():
            slug, i = f"{base}-{i}", i + 1
        Template.objects.create(title=s.title, slug=slug, schema=s.draft, description="", is_active=False)
        messages.success(request, "قالب ساخته شد (غیرفعال). از پنل مدیریت ← قالب‌های آماده دسته و توضیحش را تنظیم و فعالش کنید.")
    elif act in ("open", "close"):
        if act == "open" and not s.published:
            messages.error(request, "اول فرم را منتشر کنید.")
        else:
            s.status = "published" if act == "open" else "closed"
            s.save(update_fields=["status", "updated_at"])
    return redirect(request.POST.get("next") or "surveys:dashboard")


@login_required
@require_POST
def folders(request):
    m = current_membership(request)
    require_role(m, "edit")
    act = request.POST.get("act")
    if act == "create":
        name = request.POST.get("name", "").strip()[:80]
        if name:
            Folder.objects.create(workspace=m.workspace, name=name)
    elif act == "rename":
        f = get_object_or_404(Folder, pk=request.POST.get("id"), workspace=m.workspace)
        f.name = request.POST.get("name", f.name).strip()[:80] or f.name
        f.save()
    elif act == "delete":
        get_object_or_404(Folder, pk=request.POST.get("id"), workspace=m.workspace).delete()
    return redirect("surveys:dashboard")


# ───────────────────────── فرم‌ساز ─────────────────────────
def _plan_flags(plan):
    return {k: plan.has(k) for k in ("logic", "calcs", "file_upload", "export", "remove_branding", "custom_theme", "webhook",
                                     "sms_notify", "password")}


@login_required
def edit(request, pk):
    s, m = get_survey(request, pk, "edit")
    plan = plan_of(s.workspace)
    from apps.common.iran_geo import PROVINCES
    return render(request, "surveys/builder.html", {
        "s": s, "m": m, "plan": plan,
        "boot": json.dumps({
            "id": s.pk, "title": s.title, "code": s.code, "schema": s.draft, "status": s.status, "version": s.version,
            "has_unpublished": s.has_unpublished, "types": {k: {"label": v[0], "group": v[1]} for k, v in engine.TYPES.items()},
            "plan": _plan_flags(plan), "plan_name": plan.name, "provinces": list(PROVINCES.keys()),
            "urls": {"save": reverse("surveys:api_save", args=[s.pk]), "publish": reverse("surveys:api_publish", args=[s.pk]),
                     "image": reverse("surveys:api_image", args=[s.pk]), "preview": reverse("surveys:preview", args=[s.code]),
                     "settings": reverse("surveys:settings", args=[s.pk]), "share": reverse("surveys:share", args=[s.pk]),
                     "results": reverse("surveys:results", args=[s.pk]), "billing": reverse("billing:billing")},
        }, ensure_ascii=False),
    })


@login_required
@require_POST
def api_save(request, pk):
    s, m = get_survey(request, pk, "edit")
    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "داده‌ی نامعتبر"}, status=400)
    plan = plan_of(s.workspace)
    schema = engine.clean_schema(data.get("schema"), allow_logic=plan.logic, allow_calcs=plan.calcs)
    if not plan.file_upload:
        schema["questions"] = [q for q in schema["questions"] if q["type"] != "file"]
    if not plan.custom_theme:
        schema["theme"]["bg_image"] = ""
    title = str(data.get("title") or s.title).strip()[:200] or s.title
    s.draft, s.title, s.has_unpublished = schema, title, True
    s.save(update_fields=["draft", "title", "has_unpublished", "updated_at"])
    return JsonResponse({"ok": True, "schema": schema, "saved_at": timezone.now().isoformat()})


@login_required
@require_POST
def api_publish(request, pk):
    s, m = get_survey(request, pk, "edit")
    qs = [q for q in s.draft.get("questions", []) if q["type"] in engine.ANSWERABLE]
    if not qs:
        return JsonResponse({"error": "فرم دست‌کم یک سؤال لازم دارد."}, status=400)
    problems = []
    for q in s.draft["questions"]:
        if not q["title"].strip():
            problems.append("سؤالی بدون عنوان هست.")
        if q["type"] in ("choice", "dropdown") and not q["opt"].get("choices"):
            problems.append(f"سؤال «{q['title'][:30]}» گزینه ندارد.")
        if q["type"] == "matrix" and (not q["opt"].get("rows") or not q["opt"].get("cols")):
            problems.append(f"سؤال ماتریسی «{q['title'][:30]}» ردیف یا ستون ندارد.")
    if problems:
        return JsonResponse({"error": " ".join(sorted(set(problems))[:4])}, status=400)
    s.published = s.draft
    s.version += 1
    s.has_unpublished = False
    if s.status == "draft":
        s.status = "published"
    s.published_at = timezone.now()
    s.save()
    return JsonResponse({"ok": True, "version": s.version, "status": s.status, "url": request.build_absolute_uri(s.get_absolute_url())})


@login_required
@require_POST
def api_image(request, pk):
    s, m = get_survey(request, pk, "edit")
    f = request.FILES.get("file")
    if not f:
        return JsonResponse({"error": "فایلی نیامد"}, status=400)
    ext = f.name.rsplit(".", 1)[-1].lower() if "." in f.name else ""
    if ext not in ("jpg", "jpeg", "png", "webp", "gif") or f.size > 3 * 1024 * 1024:
        return JsonResponse({"error": "فقط تصویر JPG، PNG، WebP یا GIF تا ۳ مگابایت."}, status=400)
    from PIL import Image
    try:
        Image.open(f).verify()
        f.seek(0)
    except Exception:
        return JsonResponse({"error": "تصویر خراب است."}, status=400)
    from django.core.files.storage import default_storage
    from django.utils.text import get_valid_filename
    name = default_storage.save(f"survey-images/{s.pk}/{get_valid_filename(f.name)}", f)
    return JsonResponse({"url": default_storage.url(name)})


@login_required
def settings_view(request, pk):
    s, m = get_survey(request, pk, "edit")
    plan = plan_of(s.workspace)
    if request.method == "POST":
        p = request.POST
        s.starts_at = parse_jalali_dt(p.get("starts_at", "")) if p.get("starts_at", "").strip() else None
        s.ends_at = parse_jalali_dt(p.get("ends_at", "")) if p.get("ends_at", "").strip() else None
        try:
            s.max_responses = max(0, int(p.get("max_responses") or 0))
        except ValueError:
            s.max_responses = 0
        s.closed_message = p.get("closed_message", "")[:250]
        s.one_per_device = bool(p.get("one_per_device"))
        s.verify_mobile = bool(p.get("verify_mobile"))
        s.one_per_mobile = bool(p.get("one_per_mobile")) and s.verify_mobile
        s.save_partial = bool(p.get("save_partial"))
        s.hidden_fields = ",".join(h.strip() for h in p.get("hidden_fields", "").split(",") if h.strip().replace("_", "").isalnum())[:300]
        s.notify_email = p.get("notify_email", "").strip()[:254]
        s.password = p.get("password", "").strip()[:50] if plan.password else ""
        s.notify_sms = bool(p.get("notify_sms")) and plan.sms_notify
        s.notify_mobile = p.get("notify_mobile", "").strip()[:11]
        s.webhook_url = p.get("webhook_url", "").strip()[:500] if plan.webhook else ""
        if s.webhook_url and not s.webhook_url.startswith("https://"):
            s.webhook_url = ""
            messages.warning(request, "آدرس وب‌هوک باید با https شروع شود.")
        s.save()
        messages.success(request, "تنظیمات ذخیره شد.")
        return redirect("surveys:settings", pk=s.pk)
    return render(request, "surveys/settings.html", {"s": s, "m": m, "plan": plan, "tab": "settings"})


@login_required
def share(request, pk):
    s, m = get_survey(request, pk, "view")
    url = request.build_absolute_uri(s.get_absolute_url())
    return render(request, "surveys/share.html", {"s": s, "m": m, "url": url, "tab": "share", "plan": plan_of(s.workspace),
                                                  "embed": request.build_absolute_uri("/embed.js")})


@login_required
def qr(request, pk):
    s, m = get_survey(request, pk, "view")
    url = request.build_absolute_uri(s.get_absolute_url())
    fmt = "png" if request.GET.get("format") == "png" else "svg"
    out = segno.make(url, error="m")
    from io import BytesIO
    buf = BytesIO()
    if fmt == "png":
        out.save(buf, kind="png", scale=12, border=2, dark="#16303A")
        resp = HttpResponse(buf.getvalue(), content_type="image/png")
    else:
        out.save(buf, kind="svg", scale=8, border=2, dark="#16303A", xmldecl=False)
        resp = HttpResponse(buf.getvalue(), content_type="image/svg+xml")
    if request.GET.get("download"):
        resp["Content-Disposition"] = f'attachment; filename="qr-{s.code}.{fmt}"'
    return resp
