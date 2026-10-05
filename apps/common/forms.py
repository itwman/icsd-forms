import jdatetime
from django import forms

from .fa import FA, parse_jalali, parse_jalali_dt, to_en


class JalaliDateWidget(forms.TextInput):
    def __init__(self, attrs=None, time=False):
        base = {"data-jdp": "", "autocomplete": "off", "class": "form-control", "dir": "ltr",
                "placeholder": "۱۴۰۵/۰۷/۱۳" + (" ۱۲:۰۰" if time else "")}
        if not time:
            base["data-jdp-only-date"] = ""
        base.update(attrs or {})
        super().__init__(base)
        self.time = time

    def format_value(self, value):
        if not value:
            return ""
        if isinstance(value, str):
            return value
        if hasattr(value, "hour"):
            from django.utils import timezone
            value = timezone.localtime(value) if timezone.is_aware(value) else value
            return jdatetime.datetime.fromgregorian(datetime=value).strftime("%Y/%m/%d %H:%M").translate(FA)
        return jdatetime.date.fromgregorian(date=value).strftime("%Y/%m/%d").translate(FA)


class JalaliDateTimeField(forms.Field):
    def __init__(self, *a, **kw):
        kw.setdefault("widget", JalaliDateWidget(time=True))
        super().__init__(*a, **kw)

    def to_python(self, value):
        if value in self.empty_values:
            return None
        if not isinstance(value, str):
            return value
        v = parse_jalali_dt(value)
        if v is None:
            raise forms.ValidationError("تاریخ و ساعت نامعتبر است. نمونه: ۱۴۰۵/۰۷/۱۳ ۱۲:۰۰")
        return v


class JalaliDateField(forms.Field):
    def __init__(self, *a, **kw):
        kw.setdefault("widget", JalaliDateWidget())
        super().__init__(*a, **kw)

    def to_python(self, value):
        if value in self.empty_values:
            return None
        if not isinstance(value, str):
            return value
        v = parse_jalali(value)
        if v is None:
            raise forms.ValidationError("تاریخ نامعتبر است. نمونه: ۱۴۰۵/۰۷/۱۳")
        return v


def normalize_digits(v):
    return to_en(v)
