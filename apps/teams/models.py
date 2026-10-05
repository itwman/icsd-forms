from django.conf import settings
from django.db import models


class Workspace(models.Model):
    name = models.CharField("نام فضای کاری", max_length=120)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="مالک", on_delete=models.CASCADE, related_name="owned_workspaces")
    created_at = models.DateTimeField("ایجاد", auto_now_add=True)

    class Meta:
        ordering = ["id"]
        verbose_name = "فضای کاری"
        verbose_name_plural = "فضاهای کاری"

    def __str__(self):
        return self.name


class Membership(models.Model):
    ROLES = [("owner", "مالک"), ("admin", "مدیر"), ("editor", "ویرایشگر"), ("viewer", "فقط مشاهده‌ی نتایج")]
    workspace = models.ForeignKey(Workspace, verbose_name="فضای کاری", on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="کاربر", null=True, blank=True, on_delete=models.CASCADE, related_name="memberships")
    mobile = models.CharField("موبایل دعوت‌شده", max_length=11, blank=True)
    role = models.CharField("نقش", max_length=10, choices=ROLES, default="editor")
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField("ایجاد", auto_now_add=True)

    class Meta:
        ordering = ["id"]
        verbose_name = "عضویت"
        verbose_name_plural = "اعضا"
        constraints = [models.UniqueConstraint(fields=["workspace", "user"], name="uniq_ws_user"),
                       models.UniqueConstraint(fields=["workspace", "mobile"], condition=models.Q(user__isnull=True), name="uniq_ws_invite")]

    def __str__(self):
        return f"{self.user or self.mobile} @ {self.workspace}"

    @property
    def pending(self):
        return self.user_id is None

    @property
    def can_edit(self):
        return self.role in ("owner", "admin", "editor")

    @property
    def can_manage(self):
        return self.role in ("owner", "admin")
