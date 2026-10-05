from django.core.cache import cache
from django.db import models
from django.urls import reverse


class SiteSettings(models.Model):
    site_name = models.CharField("نام سامانه", max_length=80, default="فرم‌ساز ICSD")
    short_name = models.CharField("نام کوتاه", max_length=30, default="ICSD فرم")
    tagline = models.CharField("شعار", max_length=200, default="فرم و پرسشنامه‌ی آنلاین حرفه‌ای، فارسی و بدون کدنویسی")
    site_url = models.URLField("آدرس سامانه", default="https://s.icsd.ir")
    logo = models.ImageField("لوگو", upload_to="brand/", blank=True)
    favicon = models.ImageField("فاوآیکن", upload_to="brand/", blank=True)
    color_primary = models.CharField("رنگ اصلی", max_length=7, default="#1E9E7B")
    color_accent = models.CharField("رنگ تأکید", max_length=7, default="#16A9C7")
    support_phone = models.CharField("تلفن پشتیبانی", max_length=40, blank=True, default="")
    support_email = models.EmailField("ایمیل پشتیبانی", blank=True, default="")
    address = models.CharField("آدرس", max_length=250, blank=True,
                               default="کاشان، پارک علم و فناوری دانشگاه کاشان، طبقه‌ی همکف، واحد ۱۴۴")
    footer_text = models.TextField("متن فوتر", blank=True, default="ساخته‌شده در توسعه هوشمند فرش ایرانیان — کاشان")
    meta_description = models.CharField("توضیح متای صفحه‌ی اصلی", max_length=300, blank=True,
                                        default="ساخت فرم، پرسشنامه، آزمون و نظرسنجی آنلاین فارسی با منطق شرطی، امتیازدهی، گزارش و نمودار.")
    head_extra_html = models.TextField("کد اضافی head", blank=True, help_text="مثل کد تأیید سرچ‌کنسول. فقط مدیر ارشد.")
    branding_text = models.CharField("متن «ساخته‌شده با» زیر فرم‌ها", max_length=80, default="ساخته‌شده با فرم‌ساز ICSD")
    free_signup = models.BooleanField("ثبت‌نام عمومی باز است", default=True)
    kavenegar_api_key = models.CharField("کلید API کاوه‌نگار", max_length=200, blank=True)
    kavenegar_otp_template = models.CharField("الگوی پیامک کد ورود", max_length=50, default="otp")
    kavenegar_notify_template = models.CharField("الگوی پیامک «پاسخ جدید»", max_length=50, default="newresponse",
                                                 help_text="الگو با متغیر token (نام فرم) و token2 (تعداد پاسخ‌ها).")
    zarinpal_merchant_id = models.CharField("مرچنت زرین‌پال", max_length=64, blank=True)
    zarinpal_sandbox = models.BooleanField("زرین‌پال آزمایشی", default=True)

    class Meta:
        verbose_name = verbose_name_plural = "تنظیمات سامانه"

    def __str__(self):
        return self.site_name

    def save(self, *a, **kw):
        self.pk = 1
        super().save(*a, **kw)
        cache.delete("site-settings")

    @classmethod
    def load(cls):
        obj = cache.get("site-settings")
        if obj is None:
            obj, _ = cls.objects.get_or_create(pk=1)
            cache.set("site-settings", obj, 300)
        return obj


class Page(models.Model):
    title = models.CharField("عنوان", max_length=150)
    slug = models.SlugField("نامک", max_length=100, unique=True, allow_unicode=True)
    body = models.TextField("متن (HTML ساده)")
    show_in_footer = models.BooleanField("در فوتر", default=True)
    is_published = models.BooleanField("منتشر شده", default=True)
    order = models.PositiveSmallIntegerField("ترتیب", default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "id"]
        verbose_name = "صفحه"
        verbose_name_plural = "صفحات"

    def __str__(self):
        return self.title

    def get_absolute_url(self):
        return reverse("core:page", args=[self.slug])


class FAQ(models.Model):
    question = models.CharField("سؤال", max_length=250)
    answer = models.TextField("پاسخ")
    order = models.PositiveSmallIntegerField("ترتیب", default=0)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        ordering = ["order", "id"]
        verbose_name = "پرسش متداول"
        verbose_name_plural = "پرسش‌های متداول"

    def __str__(self):
        return self.question
