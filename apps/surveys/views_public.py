"""صفحه‌ی عمومی پاسخ‌دهی (/f/<code>/) و API آن: شروع، ذخیره‌ی مرحله‌ای، ارسال نهایی، آپلود فایل، تأیید موبایل."""
import base64
import hashlib
import json
import logging
import threading
import uuid

import requests
from django.conf import settings
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.db.models import F
from django.http import Http404, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.decorators.http import require_POST

from apps.accounts.models import OTP
from apps.accounts.sms import lookup, send_otp
from apps.billing.utils import plan_of, response_quota_left
from apps.common.fa import to_en, valid_mobile
from apps.teams.models import Membership
from . import engine
from .models import Response, ResponseFile, Survey, Template

log = logging.getLogger(__name__)


def _ip_hash(request):
    ip = request.META.get("HTTP_X_REAL_IP") or request.META.get("REMOTE_ADDR", "")
    return hashlib.sha256((ip + settings.SECRET_KEY[:12]).encode()).hexdigest()


def _device(request):
    ua = request.META.get("HTTP_USER_AGENT", "").lower()
    if "ipad" in ua or "tablet" in ua:
        return "tablet"
    if "mobi" in ua or "android" in ua or "iphone" in ua:
        return "mobile"
    return "desktop"


def _closed_reason(s):
    now = timezone.now()
    if s.status != "published" or not s.published:
        return s.closed_message or "این فرم هنوز منتشر نشده یا بسته است."
    if s.starts_at and now < s.starts_at:
        from apps.common.fa import jdate
        return f"پاسخ‌گیری از {jdate(s.starts_at, '%d %B %Y ساعت %H:%M')} شروع می‌شود."
    if s.ends_at and now > s.ends_at:
        return s.closed_message or "مهلت پاسخ‌گویی به این فرم تمام شده است."
    if s.max_responses and s.response_count >= s.max_responses:
        return s.closed_message or "ظرفیت این فرم تکمیل شده است."
    if not response_quota_left(s.workspace):
        return "ظرفیت پاسخ ماهانه‌ی سازنده‌ی این فرم تکمیل شده است."
    return ""


def _is_member(request, s):
    return request.user.is_authenticated and (request.user.is_superuser or Membership.objects.filter(workspace=s.workspace, user=request.user).exists())


def _boot(request, s, schema, mode, extra=None):
    plan = plan_of(s.workspace) if s else None
    from apps.common.iran_geo import PROVINCES
    data = {
        "mode": mode, "schema": schema, "code": s.code if s else "", "title": s.title if s else "",
        "verify_mobile": bool(s and s.verify_mobile and mode == "live"), "password": bool(s and s.password and mode == "live"),
        "one_per_device": bool(s and s.one_per_device and mode == "live"), "save_partial": bool(s and s.save_partial),
        "hidden_fields": s.hidden_list if s else [], "provinces": PROVINCES,
        "branding": not (plan and plan.remove_branding) and schema.get("settings", {}).get("show_branding", True),
        "urls": {} if not s or mode == "template" else {
            "start": reverse("surveys:f_start", args=[s.code]), "save": reverse("surveys:f_save", args=[s.code]),
            "submit": reverse("surveys:f_submit", args=[s.code]), "upload": reverse("surveys:f_upload", args=[s.code]),
            "otp": reverse("surveys:f_otp", args=[s.code]),
        },
    }
    data.update(extra or {})
    return json.dumps(data, ensure_ascii=False).replace("</", "<\\/")


@ensure_csrf_cookie
def fill(request, code):
    s = get_object_or_404(Survey, code=code, is_deleted=False)
    reason = _closed_reason(s)
    if reason:
        return render(request, "surveys/closed.html", {"s": s, "reason": reason, "theme": (s.live or {}).get("theme", engine.DEFAULT_THEME)},
                      status=200)
    schema = s.published
    return render(request, "surveys/fill.html", {"s": s, "schema": schema, "theme": schema["theme"], "boot": _boot(request, s, schema, "live"),
                                                 "embed": request.GET.get("embed") == "1"})


@ensure_csrf_cookie
def preview(request, code):
    s = get_object_or_404(Survey, code=code, is_deleted=False)
    if not _is_member(request, s):
        raise Http404
    schema = s.draft
    return render(request, "surveys/fill.html", {"s": s, "schema": schema, "theme": schema["theme"], "preview": True,
                                                 "boot": _boot(request, s, schema, "preview")})


def template_preview(request, slug):
    t = get_object_or_404(Template, slug=slug, is_active=True)
    schema = engine.clean_schema(t.schema)
    return render(request, "surveys/fill.html", {"s": None, "tpl": t, "schema": schema, "theme": schema["theme"], "preview": True,
                                                 "boot": _boot(request, None, schema, "template")})


# ───────────────────────── API پاسخ‌دهی ─────────────────────────
def _json(request):
    try:
        return json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return {}


def _err(msg, status=400, **kw):
    return JsonResponse({"error": msg, **kw}, status=status)


def _rate(request, key, limit, seconds):
    k = f"rl:{key}:{_ip_hash(request)}"
    n = cache.get(k, 0)
    if n >= limit:
        return False
    cache.set(k, n + 1, seconds)
    return True


def _get_response(s, data):
    try:
        tok = uuid.UUID(str(data.get("token", "")))
    except ValueError:
        return None
    return Response.objects.filter(survey=s, token=tok, completed_at__isnull=True).first()


@csrf_exempt  # فرم جاسازی‌شده (iframe در سایت دیگر) کوکی csrftoken را نمی‌فرستد؛ مجوز این API توکن پاسخ است
@require_POST
def f_start(request, code):
    s = get_object_or_404(Survey, code=code, is_deleted=False)
    data = _json(request)
    test = data.get("mode") == "preview" and _is_member(request, s)
    if not test:
        reason = _closed_reason(s)
        if reason:
            return _err(reason, 403)
        if s.password and data.get("password", "") != s.password:
            return _err("رمز فرم درست نیست.", 403, need_password=True)
        if not _rate(request, f"start:{s.pk}", 60, 3600):
            return _err("تعداد درخواست‌ها زیاد است؛ کمی بعد تلاش کنید.", 429)
        if s.one_per_device and data.get("device_done"):
            return _err("شما قبلاً از این دستگاه به این فرم پاسخ داده‌اید.", 403)
    mobile = ""
    if s.verify_mobile and not test:
        mobile = request.session.get(f"fv:{s.pk}", "")
        if not mobile:
            return _err("ابتدا شماره موبایل خود را تأیید کنید.", 403, need_mobile=True)
        if s.one_per_mobile and Response.objects.filter(survey=s, mobile=mobile, completed_at__isnull=False).exists():
            return _err("با این شماره قبلاً به این فرم پاسخ داده شده است.", 403)
    hidden = {}
    for h in s.hidden_list:
        v = (data.get("hidden") or {}).get(h)
        if v:
            hidden[h] = str(v)[:200]
    r = Response.objects.create(survey=s, version=s.version, hidden=hidden, device=_device(request), ip_hash=_ip_hash(request),
                                mobile=mobile, is_test=test, user=request.user if request.user.is_authenticated else None)
    return JsonResponse({"token": str(r.token)})


@csrf_exempt  # فرم جاسازی‌شده (iframe در سایت دیگر) کوکی csrftoken را نمی‌فرستد؛ مجوز این API توکن پاسخ است
@require_POST
def f_save(request, code):
    s = get_object_or_404(Survey, code=code, is_deleted=False)
    data = _json(request)
    r = _get_response(s, data)
    if not r:
        return _err("نشست پاسخ‌دهی پیدا نشد.", 404)
    if not s.save_partial and not r.is_test:
        return JsonResponse({"ok": True})
    answers = data.get("answers") if isinstance(data.get("answers"), dict) else {}
    if len(json.dumps(answers)) > 200_000:
        return _err("پاسخ‌ها بیش از حد بزرگ است.")
    r.answers = answers
    r.last_question = str(data.get("current", ""))[:40]
    r.save(update_fields=["answers", "last_question", "updated_at"])
    return JsonResponse({"ok": True})


@csrf_exempt  # فرم جاسازی‌شده (iframe در سایت دیگر) کوکی csrftoken را نمی‌فرستد؛ مجوز این API توکن پاسخ است
@require_POST
def f_submit(request, code):
    s = get_object_or_404(Survey, code=code, is_deleted=False)
    data = _json(request)
    r = _get_response(s, data)
    if not r:
        return _err("نشست پاسخ‌دهی پیدا نشد یا قبلاً ارسال شده است.", 404)
    schema = s.draft if r.is_test else s.published
    if not r.is_test:
        reason = _closed_reason(s)
        if reason:
            return _err(reason, 403)
    raw = data.get("answers") if isinstance(data.get("answers"), dict) else {}
    # فایل‌ها: فقط فایل‌هایی که واقعاً برای همین فرم آپلود شده‌اند
    for q in schema.get("questions", []):
        if q["type"] in ("file", "signature") and isinstance(raw.get(q["id"]), dict):
            fid = str(raw[q["id"]].get("id", ""))
            rf = ResponseFile.objects.filter(pk=fid if fid.isdigit() else 0, survey=s, question_id=q["id"]).first()
            raw[q["id"]] = {"id": str(rf.pk), "name": rf.name, "url": rf.file.url} if rf else None
    answers, variables, path, ending, errors = engine.finalize(schema, raw, r.hidden)
    if errors:
        return _err("برخی پاسخ‌ها کامل یا معتبر نیستند.", 422, errors=errors)
    now = timezone.now()
    r.answers, r.variables, r.path, r.ending = answers, variables, path, ending["id"]
    r.completed_at = now
    r.duration = int((now - r.started_at).total_seconds())
    r.save()
    ResponseFile.objects.filter(survey=s, pk__in=[int(v["id"]) for k, v in answers.items()
                                                  if isinstance(v, dict) and str(v.get("id", "")).isdigit()]).update(response=r)
    if not r.is_test:
        Survey.objects.filter(pk=s.pk).update(response_count=F("response_count") + 1)
        _notify(s, r, request)
    text = engine.pipe(ending.get("text", ""), schema, answers, variables, r.hidden)
    title = engine.pipe(ending.get("title", ""), schema, answers, variables, r.hidden)
    return JsonResponse({"ok": True, "ending": {**ending, "text": text, "title": title}, "variables": variables})


@csrf_exempt  # فرم جاسازی‌شده (iframe در سایت دیگر) کوکی csrftoken را نمی‌فرستد؛ مجوز این API توکن پاسخ است
@require_POST
def f_upload(request, code):
    s = get_object_or_404(Survey, code=code, is_deleted=False)
    if not _rate(request, f"up:{s.pk}", 40, 3600):
        return _err("تعداد آپلود زیاد است.", 429)
    qid = request.POST.get("q", "")[:40]
    schema = s.draft if request.POST.get("mode") == "preview" else (s.published or {})
    q = next((x for x in schema.get("questions", []) if x["id"] == qid and x["type"] in ("file", "signature")), None)
    if not q:
        return _err("سؤال نامعتبر است.")
    if q["type"] == "signature":
        data = request.POST.get("data", "")
        if not data.startswith("data:image/png;base64,") or len(data) > 1_500_000:
            return _err("امضا نامعتبر است.")
        content = ContentFile(base64.b64decode(data.split(",", 1)[1]), name=f"signature-{uuid.uuid4().hex[:8]}.png")
        rf = ResponseFile.objects.create(survey=s, question_id=qid, file=content, name="امضا.png", size=content.size)
        return JsonResponse({"id": str(rf.pk), "name": rf.name, "url": rf.file.url})
    f = request.FILES.get("file")
    if not f:
        return _err("فایلی انتخاب نشده است.")
    plan = plan_of(s.workspace)
    max_mb = min(q["opt"].get("max_mb", 5), plan.max_upload_mb)
    ext = f.name.rsplit(".", 1)[-1].lower() if "." in f.name else ""
    if ext not in q["opt"].get("types", []):
        return _err("این نوع فایل مجاز نیست: " + "، ".join(q["opt"].get("types", [])))
    if f.size > max_mb * 1024 * 1024:
        return _err(f"حجم فایل حداکثر {max_mb} مگابایت است.")
    from django.utils.text import get_valid_filename
    f.name = get_valid_filename(f.name)[-120:] or f"file.{ext}"
    rf = ResponseFile.objects.create(survey=s, question_id=qid, file=f, name=f.name, size=f.size)
    return JsonResponse({"id": str(rf.pk), "name": rf.name, "url": rf.file.url})


@require_POST
def f_otp(request, code):
    s = get_object_or_404(Survey, code=code, is_deleted=False)
    data = _json(request)
    mobile = to_en(data.get("mobile", "")).strip()
    if not valid_mobile(mobile):
        return _err("شماره موبایل معتبر نیست.")
    if data.get("code"):
        if OTP.verify(mobile, to_en(data["code"]).strip()):
            request.session[f"fv:{s.pk}"] = mobile
            return JsonResponse({"ok": True, "verified": True})
        return _err("کد نادرست یا منقضی است.")
    if not _rate(request, "fotp", 6, 900):
        return _err("تعداد درخواست کد زیاد است؛ کمی بعد تلاش کنید.", 429)
    otp = OTP.issue(mobile)
    send_otp(mobile, otp.code)
    return JsonResponse({"ok": True, "sent": True})


def embed_js(request):
    base = request.build_absolute_uri("/").rstrip("/")
    js = """(function(){var B=%s;document.querySelectorAll('[data-icsd-form]').forEach(function(el){if(el.dataset.done)return;el.dataset.done=1;
var f=document.createElement('iframe');f.src=B+'/f/'+el.dataset.icsdForm+'/?embed=1'+(el.dataset.params?'&'+el.dataset.params:'');
f.style.cssText='width:100%%;border:0;min-height:'+(el.dataset.height||'560')+'px;border-radius:14px';f.setAttribute('allow','clipboard-write');
f.title='فرم';el.appendChild(f);window.addEventListener('message',function(e){if(e.origin===B&&e.data&&e.data.icsdHeight&&e.source===f.contentWindow){f.style.height=(e.data.icsdHeight+20)+'px';}});});})();""" % json.dumps(base)
    resp = HttpResponse(js, content_type="application/javascript; charset=utf-8")
    resp["Cache-Control"] = "public, max-age=3600"
    return resp


# ───────────────────────── اعلان‌ها ─────────────────────────
def _public_url(url):
    """وب‌هوک فقط به آدرس‌های عمومی اینترنت (نه شبکه‌ی داخلی سرور) ارسال شود."""
    import ipaddress
    import socket
    from urllib.parse import urlparse
    u = urlparse(url)
    if u.scheme != "https" or not u.hostname:
        return False
    try:
        for info in socket.getaddrinfo(u.hostname, u.port or 443):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
    except (socket.gaierror, ValueError):
        return False
    return True



def _notify(s, r, request):
    plan = plan_of(s.workspace)
    if s.notify_sms and plan.sms_notify and valid_mobile(s.notify_mobile or ""):
        from apps.core.models import SiteSettings
        lookup(s.notify_mobile, SiteSettings.load().kavenegar_notify_template, s.title[:30], str(s.response_count + 1), background=True)
    if s.notify_email:
        def _mail():
            try:
                from django.core.mail import send_mail
                schema = s.published or s.draft
                lines = [f"{q['title']}: {engine.display(q, r.answers.get(q['id']), r.answers)}"
                         for q in schema.get("questions", []) if q["type"] in engine.ANSWERABLE and q["id"] in r.answers]
                send_mail(f"پاسخ جدید: {s.title}", "\n".join(lines)[:8000], None, [s.notify_email], fail_silently=True)
            except Exception as e:
                log.warning("mail failed %s", e)
        threading.Thread(target=_mail, daemon=True).start()
    if s.webhook_url and plan.webhook:
        payload = {"survey": {"id": s.pk, "code": s.code, "title": s.title}, "response": {
            "id": r.pk, "token": str(r.token), "completed_at": r.completed_at.isoformat(), "answers": r.answers,
            "variables": r.variables, "hidden": r.hidden, "mobile": r.mobile, "ending": r.ending}}

        def _hook():
            try:
                if not _public_url(s.webhook_url):
                    log.warning("webhook blocked (private address): %s", s.webhook_url)
                    return
                requests.post(s.webhook_url, json=payload, timeout=8, allow_redirects=False,
                              headers={"User-Agent": "ICSD-Forms-Webhook"})
            except requests.RequestException as e:
                log.info("webhook failed %s", e)
        threading.Thread(target=_hook, daemon=True).start()
