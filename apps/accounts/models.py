import random
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone

mobile_validator = RegexValidator(r"^09\d{9}$", "شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.")


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create(self, mobile, password, **extra):
        if not mobile:
            raise ValueError("شماره موبایل الزامی است")
        user = self.model(mobile=mobile, **extra)
        user.set_password(password) if password else user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_user(self, mobile, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create(mobile, password, **extra)

    def create_superuser(self, mobile, password=None, **extra):
        extra.update(is_staff=True, is_superuser=True)
        return self._create(mobile, password, **extra)


class User(AbstractUser):
    username = None
    mobile = models.CharField("موبایل", max_length=11, unique=True, validators=[mobile_validator])
    email = models.EmailField("ایمیل", blank=True, null=True, unique=True)
    first_name = models.CharField("نام", max_length=80, blank=True)
    last_name = models.CharField("نام خانوادگی", max_length=80, blank=True)
    avatar = models.ImageField("تصویر", upload_to="avatars/", blank=True)
    company = models.CharField("شرکت / سازمان", max_length=150, blank=True)
    job_title = models.CharField("سمت", max_length=100, blank=True)
    mobile_verified = models.BooleanField("موبایل تأیید شده", default=False)
    current_workspace = models.ForeignKey("teams.Workspace", verbose_name="فضای کاری فعلی", null=True, blank=True,
                                          on_delete=models.SET_NULL, related_name="+")

    USERNAME_FIELD = "mobile"
    REQUIRED_FIELDS = []
    objects = UserManager()

    class Meta:
        verbose_name = "کاربر"
        verbose_name_plural = "کاربران"

    def __str__(self):
        return self.get_full_name() or self.mobile

    def save(self, *a, **kw):
        if self.email == "":
            self.email = None
        super().save(*a, **kw)

    @property
    def display_name(self):
        return self.get_full_name() or "کاربر " + self.mobile[-4:]


class OTP(models.Model):
    mobile = models.CharField(max_length=11, db_index=True)
    code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    is_used = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "کد یک‌بارمصرف"
        verbose_name_plural = "کدهای یک‌بارمصرف"

    @classmethod
    def issue(cls, mobile):
        recent = cls.objects.filter(mobile=mobile, created_at__gte=timezone.now() - timedelta(seconds=60), is_used=False).first()
        if recent:
            return recent
        return cls.objects.create(mobile=mobile, code=f"{random.SystemRandom().randint(0, 999999):06d}")

    @classmethod
    def verify(cls, mobile, code):
        otp = cls.objects.filter(mobile=mobile, is_used=False).first()
        ttl = getattr(settings, "OTP_TTL_SECONDS", 180)
        if not otp or otp.attempts >= 5 or otp.created_at < timezone.now() - timedelta(seconds=ttl):
            return False
        if otp.code != code:
            otp.attempts += 1
            otp.save(update_fields=["attempts"])
            return False
        otp.is_used = True
        otp.save(update_fields=["is_used"])
        return True
