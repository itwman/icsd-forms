from django.db import models
from django.utils import timezone

FEATURES = [
    ("logic", "منطق شرطی و پرش"),
    ("calcs", "متغیر، امتیاز و محاسبه"),
    ("file_upload", "سؤال آپلود فایل"),
    ("export", "خروجی اکسل"),
    ("remove_branding", "حذف «ساخته‌شده با»"),
    ("custom_theme", "طراحی اختصاصی (رنگ، تصویر پس‌زمینه)"),
    ("webhook", "وب‌هوک"),
    ("sms_notify", "اعلان پیامکی پاسخ جدید"),
    ("password", "فرم رمزدار"),
]


class Plan(models.Model):
    slug = models.SlugField("شناسه", max_length=30, unique=True)
    name = models.CharField("نام پلن", max_length=60)
    description = models.CharField("توضیح کوتاه", max_length=200, blank=True)
    price_monthly = models.PositiveIntegerField("قیمت ماهانه (تومان)", default=0)
    price_yearly = models.PositiveIntegerField("قیمت سالانه (تومان)", default=0)
    max_surveys = models.PositiveIntegerField("حداکثر فرم", default=3, help_text="۰ = نامحدود")
    max_responses_month = models.PositiveIntegerField("حداکثر پاسخ در ماه", default=100, help_text="۰ = نامحدود")
    max_members = models.PositiveSmallIntegerField("حداکثر عضو تیم", default=1, help_text="۰ = نامحدود")
    max_upload_mb = models.PositiveSmallIntegerField("حداکثر حجم هر فایل (مگابایت)", default=5)
    logic = models.BooleanField("منطق شرطی و پرش", default=True)
    calcs = models.BooleanField("متغیر، امتیاز و محاسبه", default=False)
    file_upload = models.BooleanField("سؤال آپلود فایل", default=False)
    export = models.BooleanField("خروجی اکسل", default=False)
    remove_branding = models.BooleanField("حذف «ساخته‌شده با»", default=False)
    custom_theme = models.BooleanField("طراحی اختصاصی", default=False)
    webhook = models.BooleanField("وب‌هوک", default=False)
    sms_notify = models.BooleanField("اعلان پیامکی", default=False)
    password = models.BooleanField("فرم رمزدار", default=False)
    is_default = models.BooleanField("پلن پیش‌فرض (رایگان)", default=False)
    is_highlighted = models.BooleanField("پیشنهاد ویژه در صفحه‌ی قیمت", default=False)
    is_active = models.BooleanField("فعال", default=True)
    order = models.PositiveSmallIntegerField("ترتیب", default=0)

    class Meta:
        ordering = ["order", "price_monthly"]
        verbose_name = "پلن"
        verbose_name_plural = "پلن‌ها"

    def __str__(self):
        return self.name

    @property
    def is_free(self):
        return self.price_monthly == 0

    def has(self, feature):
        return bool(getattr(self, feature, False))

    def feature_list(self):
        return [(lbl, self.has(f)) for f, lbl in FEATURES]


class Subscription(models.Model):
    workspace = models.OneToOneField("teams.Workspace", verbose_name="فضای کاری", on_delete=models.CASCADE, related_name="subscription")
    plan = models.ForeignKey(Plan, verbose_name="پلن", on_delete=models.PROTECT)
    started_at = models.DateTimeField("شروع", default=timezone.now)
    expires_at = models.DateTimeField("انقضا", null=True, blank=True, help_text="خالی = بدون انقضا")
    note = models.CharField("یادداشت", max_length=200, blank=True)

    class Meta:
        verbose_name = "اشتراک"
        verbose_name_plural = "اشتراک‌ها"

    def __str__(self):
        return f"{self.workspace} — {self.plan}"

    @property
    def is_active(self):
        return self.expires_at is None or self.expires_at > timezone.now()


class Payment(models.Model):
    STATUS = [("pending", "در انتظار"), ("paid", "پرداخت شده"), ("failed", "ناموفق")]
    workspace = models.ForeignKey("teams.Workspace", verbose_name="فضای کاری", on_delete=models.CASCADE, related_name="payments")
    user = models.ForeignKey("accounts.User", verbose_name="پرداخت‌کننده", null=True, on_delete=models.SET_NULL)
    plan = models.ForeignKey(Plan, verbose_name="پلن", on_delete=models.PROTECT)
    months = models.PositiveSmallIntegerField("مدت (ماه)", default=1)
    amount = models.PositiveIntegerField("مبلغ (تومان)")
    status = models.CharField("وضعیت", max_length=10, choices=STATUS, default="pending")
    authority = models.CharField("Authority", max_length=64, blank=True, db_index=True)
    ref_id = models.CharField("کد پیگیری", max_length=64, blank=True)
    card_pan = models.CharField("کارت", max_length=24, blank=True)
    created_at = models.DateTimeField("ایجاد", auto_now_add=True)
    paid_at = models.DateTimeField("پرداخت", null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "پرداخت"
        verbose_name_plural = "پرداخت‌ها"

    def __str__(self):
        return f"#{self.pk} {self.workspace} — {self.plan} ({self.get_status_display()})"
