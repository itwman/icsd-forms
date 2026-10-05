from django import template

from apps.common import fa as F

register = template.Library()


@register.filter
def jdate(value, fmt="%Y/%m/%d"):
    return F.jdate(value, fmt)


@register.filter
def jdt(value):
    return F.jdate(value, "%Y/%m/%d %H:%M")


@register.filter
def fa_num(value):
    return F.to_fa(value) if value is not None else ""


@register.filter
def toman(value):
    return F.money(value)


@register.filter
def get(d, k):
    try:
        return d.get(k)
    except AttributeError:
        return None


@register.simple_tag
def jtoday():
    import jdatetime
    from django.utils import timezone
    return F.jdate(timezone.localdate(), "%A %d %B %Y")


@register.filter
def dur(value):
    """مدت بر حسب ثانیه → «۲ دقیقه ۵ ثانیه»"""
    try:
        n = int(value or 0)
    except (TypeError, ValueError):
        return ""
    if n <= 0:
        return "—"
    h, rem = divmod(n, 3600)
    m, s = divmod(rem, 60)
    if h:
        out = f"{h} ساعت" + (f" {m} دقیقه" if m else "")
    elif m:
        out = f"{m} دقیقه" + (f" {s} ثانیه" if s else "")
    else:
        out = f"{s} ثانیه"
    return F.to_fa(out)
