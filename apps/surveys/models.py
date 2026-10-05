import secrets
import uuid

from django.conf import settings
from django.db import models
from django.urls import reverse

from .engine import default_schema

ALPH = "abcdefghjkmnpqrstuvwxyz23456789"


def new_code():
    return "".join(secrets.choice(ALPH) for _ in range(6))


class Folder(models.Model):
    workspace = models.ForeignKey("teams.Workspace", verbose_name="فضای کاری", on_delete=models.CASCADE, related_name="folders")
    name = models.CharField("نام پوشه", max_length=80)
    order = models.PositiveSmallIntegerField("ترتیب", default=0)

    class Meta:
        ordering = ["order", "name"]
        verbose_name = "پوشه"
        verbose_name_plural = "پوشه‌ها"

    def __str__(self):
        return self.name


class Survey(models.Model):
    STATUS = [("draft", "پیش‌نویس"), ("published", "منتشر شده"), ("closed", "بسته")]
    workspace = models.ForeignKey("teams.Workspace", verbose_name="فضای کاری", on_delete=models.CASCADE, related_name="surveys")
    folder = models.ForeignKey(Folder, verbose_name="پوشه", null=True, blank=True, on_delete=models.SET_NULL, related_name="surveys")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="سازنده", null=True, on_delete=models.SET_NULL, related_name="+")
    title = models.CharField("عنوان", max_length=200)
    code = models.CharField("کد لینک", max_length=12, unique=True, default=new_code)
    draft = models.JSONField("ساختار (پیش‌نویس)", default=default_schema)
    published = models.JSONField("ساختار منتشرشده", null=True, blank=True)
    version = models.PositiveIntegerField("نسخه", default=0)
    status = models.CharField("وضعیت", max_length=10, choices=STATUS, default="draft")
    has_unpublished = models.BooleanField("تغییر منتشرنشده", default=False)

    # تنظیمات پاسخ‌دهی
    starts_at = models.DateTimeField("شروع پاسخ‌گیری", null=True, blank=True)
    ends_at = models.DateTimeField("پایان پاسخ‌گیری", null=True, blank=True)
    max_responses = models.PositiveIntegerField("حداکثر پاسخ", default=0, help_text="۰ = نامحدود")
    closed_message = models.CharField("پیام فرم بسته", max_length=250, blank=True, default="این فرم دیگر پاسخ نمی‌پذیرد.")
    password = models.CharField("رمز فرم", max_length=50, blank=True)
    one_per_device = models.BooleanField("هر دستگاه فقط یک بار", default=False)
    verify_mobile = models.BooleanField("تأیید موبایل پاسخ‌دهنده با کد پیامکی", default=False)
    one_per_mobile = models.BooleanField("هر موبایل فقط یک بار", default=False)
    save_partial = models.BooleanField("ذخیره‌ی پاسخ‌های نیمه‌کاره", default=True)
    hidden_fields = models.CharField("فیلدهای مخفی (از آدرس)", max_length=300, blank=True,
                                     help_text="نام‌ها با کاما؛ مثل utm_source,ref — از ?ref=... خوانده می‌شوند.")
    notify_sms = models.BooleanField("پیامک برای هر پاسخ جدید", default=False)
    notify_mobile = models.CharField("موبایل دریافت اعلان", max_length=11, blank=True)
    notify_email = models.EmailField("ایمیل دریافت اعلان", blank=True)
    webhook_url = models.URLField("وب‌هوک", max_length=500, blank=True)

    response_count = models.PositiveIntegerField("تعداد پاسخ", default=0)
    is_deleted = models.BooleanField("حذف‌شده", default=False)
    created_at = models.DateTimeField("ایجاد", auto_now_add=True)
    updated_at = models.DateTimeField("به‌روزرسانی", auto_now=True)
    published_at = models.DateTimeField("آخرین انتشار", null=True, blank=True)

    class Meta:
        ordering = ["-updated_at"]
        verbose_name = "فرم"
        verbose_name_plural = "فرم‌ها"

    def __str__(self):
        return self.title

    def get_absolute_url(self):
        return reverse("surveys:fill", args=[self.code])

    @property
    def live(self):
        return self.published or self.draft

    @property
    def hidden_list(self):
        return [h.strip() for h in self.hidden_fields.split(",") if h.strip()][:20]

    def question_count(self):
        from .engine import ANSWERABLE
        return sum(1 for q in (self.draft or {}).get("questions", []) if q.get("type") in ANSWERABLE)


class Response(models.Model):
    survey = models.ForeignKey(Survey, verbose_name="فرم", on_delete=models.CASCADE, related_name="responses")
    token = models.UUIDField("توکن", default=uuid.uuid4, unique=True, editable=False)
    version = models.PositiveIntegerField("نسخه‌ی فرم", default=0)
    answers = models.JSONField("پاسخ‌ها", default=dict)
    variables = models.JSONField("متغیرها", default=dict)
    hidden = models.JSONField("فیلدهای مخفی", default=dict)
    path = models.JSONField("مسیر طی‌شده", default=list)
    ending = models.CharField("صفحه‌ی پایان", max_length=40, blank=True)
    last_question = models.CharField("آخرین سؤال", max_length=40, blank=True)
    started_at = models.DateTimeField("شروع", auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField("آخرین تغییر", auto_now=True)
    completed_at = models.DateTimeField("تکمیل", null=True, blank=True, db_index=True)
    duration = models.PositiveIntegerField("مدت (ثانیه)", default=0)
    device = models.CharField("دستگاه", max_length=10, blank=True)
    ip_hash = models.CharField("هش IP", max_length=64, blank=True)
    mobile = models.CharField("موبایل تأییدشده", max_length=11, blank=True, db_index=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    is_test = models.BooleanField("آزمایشی (پیش‌نمایش)", default=False)

    class Meta:
        ordering = ["-started_at"]
        verbose_name = "پاسخ"
        verbose_name_plural = "پاسخ‌ها"

    def __str__(self):
        return f"{self.survey} — #{self.pk}"

    @property
    def is_complete(self):
        return self.completed_at is not None


class ResponseFile(models.Model):
    survey = models.ForeignKey(Survey, on_delete=models.CASCADE, related_name="files")
    response = models.ForeignKey(Response, null=True, blank=True, on_delete=models.CASCADE, related_name="files")
    question_id = models.CharField(max_length=40)
    file = models.FileField(upload_to="responses/%Y/%m/")
    name = models.CharField(max_length=200)
    size = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "فایل پاسخ"
        verbose_name_plural = "فایل‌های پاسخ"


class Template(models.Model):
    CATS = [("business", "کسب‌وکار"), ("customer", "مشتری و فروش"), ("hr", "منابع انسانی"), ("education", "آموزش"),
            ("event", "رویداد و ثبت‌نام"), ("research", "پژوهش"), ("general", "عمومی")]
    title = models.CharField("عنوان", max_length=150)
    slug = models.SlugField("نامک", max_length=80, unique=True, allow_unicode=True)
    category = models.CharField("دسته", max_length=12, choices=CATS, default="general")
    emoji = models.CharField("نماد", max_length=8, default="📋")
    description = models.CharField("توضیح", max_length=300, blank=True)
    schema = models.JSONField("ساختار", default=default_schema)
    is_featured = models.BooleanField("ویژه", default=False)
    is_active = models.BooleanField("فعال", default=True)
    uses = models.PositiveIntegerField("دفعات استفاده", default=0)
    order = models.PositiveSmallIntegerField("ترتیب", default=0)

    class Meta:
        ordering = ["order", "id"]
        verbose_name = "قالب آماده"
        verbose_name_plural = "قالب‌های آماده"

    def __str__(self):
        return self.title

    def question_count(self):
        from .engine import ANSWERABLE
        return sum(1 for q in self.schema.get("questions", []) if q.get("type") in ANSWERABLE)
