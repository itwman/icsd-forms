"""ساخت خودکار فرم برای هر Resource با ویجت‌های مناسب پنل (تاریخ شمسی، سوییچ، انتخابگر جستجوپذیر، رسانه، رنگ و ...)."""
import os

import jdatetime
from django import forms
from django.conf import settings
from django.db import models
from django.forms.models import inlineformset_factory, modelform_factory
from django.utils import timezone

from apps.common.fa import EN, FA
from apps.common.forms import JalaliDateField

CODE_FIELDS = {"head_extra_html", "embed_html", "map_embed", "enamad_html", "schema_json", "arvan_video_id"}
LTR_FIELDS = {"slug", "url", "website", "email", "canonical_url", "download_url", "preview_url", "demo_url", "old_path",
              "new_path", "path", "redirect_to", "mobile", "phone", "isbn", "latin_name", "name_en", "role_en", "version",
              "tech_stack", "button_url", "indexnow_key", "zarinpal_merchant_id", "kavenegar_api_key", "kavenegar_sender",
              "canonical", "instagram", "telegram", "linkedin", "aparat", "site_url", "authority", "ref_id", "icon"}


class JalaliDateTimeWidget(forms.TextInput):
    def __init__(self, attrs=None):
        base = {"data-jdp": "", "autocomplete": "off", "class": "form-control jdp", "placeholder": "۱۴۰۵/۰۷/۱۰ ۱۴:۳۰", "dir": "ltr"}
        base.update(attrs or {})
        super().__init__(base)

    def format_value(self, value):
        if not value:
            return ""
        if isinstance(value, str):
            return value
        value = timezone.localtime(value) if timezone.is_aware(value) else value
        return jdatetime.datetime.fromgregorian(datetime=value).strftime("%Y/%m/%d %H:%M").translate(FA)


class JalaliDateTimeField(forms.Field):
    widget = JalaliDateTimeWidget
    default_error_messages = {"invalid": "تاریخ و ساعت نامعتبر است. نمونه: ۱۴۰۵/۰۷/۱۰ ۱۴:۳۰"}

    def to_python(self, value):
        if value in self.empty_values:
            return None
        if not isinstance(value, str):
            return value
        v = value.strip().translate(EN).replace("-", "/")
        try:
            d, _, t = v.partition(" ")
            y, m, dd = (int(p) for p in d.split("/"))
            hh, mm = (int(p) for p in (t or "00:00").split(":")[:2])
            g = jdatetime.datetime(y, m, dd, hh, mm).togregorian()
            return timezone.make_aware(g) if settings.USE_TZ else g
        except (ValueError, TypeError):
            raise forms.ValidationError(self.error_messages["invalid"], code="invalid")


class MediaFileWidget(forms.ClearableFileInput):
    """ورودی فایل با پیش‌نمایش، حذف و «انتخاب از کتابخانه‌ی رسانه»."""
    template_name = "panel/widgets/file.html"

    def __init__(self, attrs=None, image=False):
        super().__init__(attrs)
        self.image = image

    def get_context(self, name, value, attrs):
        ctx = super().get_context(name, value, attrs)
        url = ""
        if value and hasattr(value, "url"):
            try:
                url = value.url
            except ValueError:
                url = ""
        ext = os.path.splitext(str(value or ""))[1].lower()
        ctx["widget"].update({"url": url, "is_image": ext in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"),
                              "fname": os.path.basename(str(value or "")), "pick_name": f"{name}__pick", "image": self.image})
        return ctx


def formfield_for(db_field, **kwargs):
    name = db_field.name
    if isinstance(db_field, models.DateTimeField) and db_field.editable and not (db_field.auto_now or db_field.auto_now_add):
        return JalaliDateTimeField(label=db_field.verbose_name, required=not db_field.blank, help_text=db_field.help_text)
    if isinstance(db_field, models.DateField) and not isinstance(db_field, models.DateTimeField):
        return JalaliDateField(label=db_field.verbose_name, required=not db_field.blank, help_text=db_field.help_text)
    if isinstance(db_field, models.FileField):
        kwargs["widget"] = MediaFileWidget(image=isinstance(db_field, models.ImageField))
        return db_field.formfield(**kwargs)
    ff = db_field.formfield(**kwargs)
    if ff is None:
        return None
    w = ff.widget
    cls = w.attrs.get("class", "")
    if isinstance(db_field, models.BooleanField):
        w.attrs["class"] = "form-check-input"
        w.attrs["role"] = "switch"
    elif isinstance(db_field, models.ManyToManyField):
        w.attrs.update({"class": "form-select ts", "data-ts": "multi"})
    elif isinstance(db_field, models.ForeignKey):
        w.attrs.update({"class": "form-select ts", "data-ts": "one"})
        if db_field.related_model._meta.model_name == "user":
            w.attrs["data-ac"] = "accounts-user"
    elif db_field.choices:
        w.attrs["class"] = "form-select"
    elif isinstance(db_field, models.TextField) or isinstance(w, forms.Textarea):
        if type(db_field).__name__ == "CKEditor5Field":
            return ff
        w.attrs["class"] = "form-control" + (" code" if name in CODE_FIELDS else "")
        w.attrs["rows"] = 8 if name in CODE_FIELDS or name in ("words",) else 3
        if name in CODE_FIELDS:
            w.attrs["dir"] = "ltr"
            w.attrs["spellcheck"] = "false"
    elif isinstance(db_field, models.JSONField):
        w.attrs.update({"class": "form-control code", "dir": "ltr", "rows": 6})
    elif isinstance(db_field, models.CharField) and (name.startswith("color") or name == "color"):
        w.input_type = "color"
        w.attrs["class"] = "form-control form-control-color"
    else:
        w.attrs["class"] = (cls + " form-control").strip()
    if name in LTR_FIELDS or isinstance(db_field, (models.URLField, models.EmailField, models.SlugField)):
        w.attrs["dir"] = "ltr"
    if isinstance(db_field, models.CharField) and db_field.max_length and not db_field.choices:
        w.attrs.setdefault("maxlength", db_field.max_length)
    return ff


class PanelFormMixin:
    """اعمال «انتخاب از کتابخانه‌ی رسانه» روی فیلدهای فایل."""

    def apply_media_picks(self, obj, data):
        root = os.path.realpath(settings.MEDIA_ROOT)
        for f in obj._meta.fields:
            if not isinstance(f, models.FileField) or f.name not in self.fields:
                continue
            pick = (data.get(f"{self.add_prefix(f.name)}__pick") or "").strip()
            if not pick or self.files.get(self.add_prefix(f.name)):
                continue
            rel = pick.replace(settings.MEDIA_URL, "", 1).lstrip("/")
            full = os.path.realpath(os.path.join(root, rel))
            if full.startswith(root + os.sep) and os.path.isfile(full):
                setattr(obj, f.name, rel)


def build_form(resource, fields=None):
    exclude = list(resource.exclude) + list(resource.readonly)
    base = type("PanelForm", (PanelFormMixin, forms.ModelForm), {})
    return modelform_factory(resource.model, form=base, fields=fields or "__all__", exclude=exclude or None,
                             formfield_callback=formfield_for)


def build_formset(parent_model, inline):
    base = type("InlineForm", (PanelFormMixin, forms.ModelForm), {})
    return inlineformset_factory(parent_model, inline.model, form=base, fields=inline.fields, fk_name=inline.fk,
                                 extra=inline.extra, can_delete=True, max_num=inline.max_num,
                                 formfield_callback=formfield_for)
