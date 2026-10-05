from django import template
from django.utils.safestring import mark_safe

from ..cells import fa, jdt
from ..icons import svg

register = template.Library()


@register.simple_tag
def pi(name, size=18, cls=""):
    return mark_safe(svg(name, size, cls))


@register.filter
def pfa(v):
    return fa(v) if v is not None else ""


@register.filter
def pdate(v):
    return jdt(v)


@register.filter
def field_type(bf):
    w = bf.field.widget
    name = type(w).__name__
    if name == "CheckboxInput":
        return "switch"
    if "CKEditor" in name:
        return "rich"
    if name in ("MediaFileWidget",):
        return "file"
    if name == "Textarea" and "code" in w.attrs.get("class", ""):
        return "code"
    return "input"


@register.filter
def is_wide(bf):
    """فیلدهایی که تمام‌عرض نمایش داده می‌شوند."""
    w = type(bf.field.widget).__name__
    return w in ("Textarea", "CKEditor5Widget", "SelectMultiple") or "CKEditor" in w or "description" in bf.name or bf.name in ("body", "about")


@register.filter
def get(d, k):
    try:
        return d.get(k)
    except AttributeError:
        return None


@register.filter
def in_set(v, s):
    return v in s


@register.simple_tag(takes_context=True)
def qs_with(context, **kw):
    """کوئری‌استرینگ فعلی + تغییرات."""
    q = context["request"].GET.copy()
    for k, v in kw.items():
        if v in (None, ""):
            q.pop(k, None)
        else:
            q[k] = v
    q.pop("page", None) if "page" not in kw else None
    return "?" + q.urlencode()
