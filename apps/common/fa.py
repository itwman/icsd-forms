"""ابزار فارسی: ارقام، تاریخ شمسی، مبالغ."""
import jdatetime
from django.utils import timezone

FA = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
EN = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]
DAYS = ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه", "شنبه", "یکشنبه"]


def to_fa(v):
    return str(v).translate(FA)


def to_en(v):
    return str(v or "").translate(EN)


def jdate(value, fmt="%Y/%m/%d"):
    if not value:
        return ""
    if hasattr(value, "hour"):
        value = timezone.localtime(value) if timezone.is_aware(value) else value
        j = jdatetime.datetime.fromgregorian(datetime=value)
    else:
        j = jdatetime.date.fromgregorian(date=value)
    out = j.strftime(fmt.replace("%B", "@M@").replace("%A", "@D@"))
    out = out.replace("@M@", MONTHS[j.month - 1])
    if "@D@" in out:
        g = j.togregorian()
        out = out.replace("@D@", DAYS[g.weekday()])
    return to_fa(out)


def money(n):
    try:
        n = int(n)
    except (TypeError, ValueError):
        return ""
    return to_fa(f"{n:,}".replace(",", "٬"))


def parse_jalali(value):
    """«۱۴۰۵/۰۷/۱۳» → date میلادی؛ نامعتبر → None"""
    v = to_en(value).strip().replace("-", "/").replace(".", "/")
    try:
        y, m, d = (int(p) for p in v.split("/")[:3])
        return jdatetime.date(y, m, d).togregorian()
    except (ValueError, TypeError):
        return None


def parse_jalali_dt(value):
    v = to_en(value).strip().replace("-", "/")
    try:
        d, _, t = v.partition(" ")
        y, m, dd = (int(p) for p in d.split("/"))
        hh, mm = (int(p) for p in (t or "00:00").split(":")[:2])
        g = jdatetime.datetime(y, m, dd, hh, mm).togregorian()
        return timezone.make_aware(g)
    except (ValueError, TypeError):
        return None


def valid_national_code(code):
    c = to_en(code).strip()
    if len(c) != 10 or not c.isdigit() or len(set(c)) == 1:
        return False
    s = sum(int(c[i]) * (10 - i) for i in range(9)) % 11
    chk = int(c[9])
    return (s < 2 and chk == s) or (s >= 2 and chk == 11 - s)


def valid_mobile(m):
    m = to_en(m).strip()
    return len(m) == 11 and m.startswith("09") and m.isdigit()
