"""نمایش مقدار هر ستون در فهرست‌ها."""
import os

import jdatetime
from django.db import models
from django.utils import timezone
from django.utils.html import escape, format_html
from django.utils.safestring import mark_safe

from .icons import svg

FA = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
IMG_EXT = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg")


def fa(v):
    return str(v).translate(FA)


def jdt(value, with_time=True):
    if not value:
        return "—"
    if hasattr(value, "hour"):
        value = timezone.localtime(value) if timezone.is_aware(value) else value
        j = jdatetime.datetime.fromgregorian(datetime=value)
        return fa(j.strftime("%Y/%m/%d %H:%M" if with_time else "%Y/%m/%d"))
    return fa(jdatetime.date.fromgregorian(date=value).strftime("%Y/%m/%d"))


def thumb_html(fieldfile, size=40):
    if not fieldfile:
        return mark_safe(f'<span class="thumb thumb--empty" style="width:{size}px;height:{size}px">{svg("image", 16)}</span>')
    try:
        url = fieldfile.url
    except ValueError:
        return ""
    if os.path.splitext(fieldfile.name)[1].lower() in IMG_EXT:
        return format_html('<img class="thumb" src="{}" alt="" loading="lazy" width="{}" height="{}">', url, size, size)
    return mark_safe(f'<span class="thumb thumb--empty">{svg("doc", 16)}</span>')


def cell(resource, obj, name, fn, user):
    if fn is not None:
        v = fn(obj)
        return v if hasattr(v, "__html__") else escape(fa(v) if isinstance(v, int) and not isinstance(v, bool) else v)
    if name == "__str__":
        return escape(str(obj))
    if name == "pk":
        return fa(obj.pk)
    f = resource.model._meta.get_field(name)
    v = getattr(obj, name)
    if isinstance(f, models.BooleanField):
        if name in resource.toggles and resource.perm(user, "change"):
            return format_html('<label class="form-switch m-0"><input class="form-check-input js-toggle" type="checkbox" role="switch" '
                               'data-url="{}" {} aria-label="{}"></label>', resource.url("toggle", obj.pk, name),
                               "checked" if v else "", f.verbose_name)
        return mark_safe(f'<span class="yn yn--{"y" if v else "n"}">{svg("check" if v else "x", 15)}</span>')
    if f.choices:
        if name in resource.quick_choices and resource.perm(user, "change"):
            opts = "".join(format_html('<option value="{}" {}>{}</option>', k, "selected" if k == v else "", lbl)
                           for k, lbl in f.choices)
            return format_html('<select class="form-select form-select-sm js-choice st-{}" data-url="{}">{}</select>',
                               v, resource.url("setchoice", obj.pk, name), mark_safe(opts))
        return format_html('<span class="pill pill--{}">{}</span>', v, getattr(obj, f"get_{name}_display")())
    if isinstance(f, (models.DateTimeField, models.DateField)):
        return jdt(v)
    if isinstance(f, models.FileField):
        return thumb_html(v, 34)
    if v is None or v == "":
        return mark_safe('<span class="muted">—</span>')
    if isinstance(f, (models.IntegerField, models.PositiveIntegerField, models.PositiveSmallIntegerField, models.BigAutoField)):
        return fa(f"{v:,}".replace(",", "٬"))
    s = str(v)
    if isinstance(f, models.ForeignKey):
        return escape(s)
    if len(s) > 70:
        s = s[:68] + "…"
    cls = ' class="ltr"' if name in ("slug", "url", "path", "old_path", "new_path", "mobile", "referrer", "redirect_to", "serial") else ""
    return format_html('<span{}>{}</span>', mark_safe(cls), s)


def plain(resource, obj, name, fn):
    """برای خروجی CSV."""
    if fn is not None:
        v = fn(obj)
        return str(v).replace("<", " <").strip() if not hasattr(v, "__html__") else ""
    if name in ("__str__",):
        return str(obj)
    if name == "pk":
        return obj.pk
    f = resource.model._meta.get_field(name)
    v = getattr(obj, name)
    if f.choices:
        return getattr(obj, f"get_{name}_display")()
    if isinstance(f, (models.DateTimeField, models.DateField)):
        return jdt(v).translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789"))
    if isinstance(f, models.BooleanField):
        return "بله" if v else "خیر"
    return "" if v is None else str(v)
