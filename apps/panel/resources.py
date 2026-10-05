"""بخش‌های قابل مدیریت در پنل سوپرادمین فرم‌ساز."""
from django.utils.html import format_html

from apps.accounts.models import User
from apps.billing.models import Payment, Plan, Subscription
from apps.core.models import FAQ, Page, SiteSettings
from apps.surveys.models import Folder, Response, Survey, Template
from apps.teams.models import Membership, Workspace

from .registry import Inline, Resource, label, register


@register
class SettingsR(Resource):
    model = SiteSettings
    key = "settings"
    title = "تنظیمات سامانه"
    icon = "settings"
    group = "site"
    singleton = True
    can_add = can_delete = False
    tabs = True
    fieldsets = [
        ("هویت", ["site_name", "short_name", "tagline", "site_url", "logo", "favicon", "color_primary", "color_accent"]),
        ("تماس و فوتر", ["support_phone", "support_email", "address", "footer_text", "branding_text"]),
        ("سئو", ["meta_description", "head_extra_html"]),
        ("ثبت‌نام، پیامک و درگاه", ["free_signup", "kavenegar_api_key", "kavenegar_otp_template", "kavenegar_notify_template",
                                    "zarinpal_merchant_id", "zarinpal_sandbox"]),
    ]

    def exclude_for(self, request):
        return () if request.user.is_superuser else ("head_extra_html", "kavenegar_api_key", "zarinpal_merchant_id", "zarinpal_sandbox")


@register
class PageR(Resource):
    model = Page
    key = "pages"
    icon = "doc"
    group = "site"
    list_display = ("title", "slug", "is_published", "show_in_footer")
    toggles = ("is_published", "show_in_footer")
    prepopulate = {"slug": "title"}


@register
class FAQR(Resource):
    model = FAQ
    key = "faq"
    icon = "quiz"
    group = "site"
    list_display = ("question", "is_active")
    toggles = ("is_active",)


@register
class TemplateR(Resource):
    model = Template
    key = "templates"
    title = "قالب‌های آماده"
    icon = "layout"
    group = "forms"
    list_display = ("title", "category", "questions_n", "uses", "is_featured", "is_active")
    toggles = ("is_featured", "is_active")
    filters = ("category", "is_active")
    search = ("title", "description")
    prepopulate = {"slug": "title"}
    help = "ساختار هر قالب را راحت‌تر از داخل فرم‌ساز بسازید: یک فرم بسازید و در فهرست «فرم‌ها» عمل «ذخیره به‌عنوان قالب» را بزنید."

    @label("سؤال")
    def questions_n(self, obj):
        return obj.question_count()


@register
class SurveyR(Resource):
    model = Survey
    key = "surveys"
    title = "فرم‌ها"
    icon = "doc"
    group = "forms"
    list_display = ("title", "workspace", "status", "response_count", "updated_at", "link")
    search = ("title", "code", "workspace__name")
    filters = ("status", "is_deleted")
    select_related = ("workspace",)
    can_add = False
    readonly = ("draft", "published", "version", "response_count", "created_by")
    fieldsets = [("فرم", ["title", "workspace", "folder", "code", "status", "is_deleted"]),
                 ("پاسخ‌گیری", ["starts_at", "ends_at", "max_responses", "closed_message", "password", "one_per_device",
                                "verify_mobile", "one_per_mobile", "save_partial", "hidden_fields"]),
                 ("اعلان", ["notify_sms", "notify_mobile", "notify_email", "webhook_url"])]

    @label("لینک")
    def link(self, obj):
        return format_html('<a href="/f/{}/" target="_blank" class="ltr">/f/{}/</a>', obj.code, obj.code)

    def view_on_site(self, obj):
        return f"/f/{obj.code}/"


@register
class ResponseR(Resource):
    model = Response
    key = "responses"
    title = "پاسخ‌ها"
    icon = "inbox"
    group = "forms"
    list_display = ("pk", "survey", "completed_at", "duration", "device", "mobile", "is_test")
    filters = ("device", "is_test")
    search = ("mobile",)
    select_related = ("survey",)
    view_perm_only = True
    per_page = 50


@register
class WorkspaceR(Resource):
    model = Workspace
    key = "workspaces"
    title = "فضاهای کاری"
    icon = "team"
    group = "people"
    list_display = ("name", "owner", "plan", "surveys_n", "created_at")
    search = ("name", "owner__mobile", "owner__first_name", "owner__last_name")
    select_related = ("owner",)
    inlines = [Inline(Membership, ["user", "mobile", "role"], title="اعضا", extra=0)]

    @label("پلن")
    def plan(self, obj):
        from apps.billing.utils import plan_of
        return plan_of(obj).name

    @label("فرم")
    def surveys_n(self, obj):
        return obj.surveys.filter(is_deleted=False).count()


@register
class UserR(Resource):
    model = User
    key = "accounts-user"
    title = "کاربران"
    icon = "users"
    group = "people"
    thumb = "avatar"
    list_display = ("mobile", "full_name", "company", "is_staff", "is_active", "date_joined")
    toggles = ("is_active",)
    search = ("mobile", "first_name", "last_name", "email", "company")
    filters = ("is_staff", "is_active", "groups")
    ordering = ("-date_joined",)
    exclude = ("password", "user_permissions", "last_login", "date_joined")
    fieldsets = [("حساب", ["mobile", "first_name", "last_name", "email", "company", "job_title", "avatar", "is_active", "mobile_verified"]),
                 ("دسترسی پنل", ["is_staff", "is_superuser", "groups"])]

    def exclude_for(self, request):
        return () if request.user.is_superuser else ("is_superuser", "is_staff", "groups")

    @label("نام")
    def full_name(self, obj):
        return obj.get_full_name() or "—"

    def before_save(self, request, obj, form, is_new):
        pw = (request.POST.get("new_password") or "").strip()
        if pw:
            obj.set_password(pw)
        elif is_new:
            obj.set_unusable_password()


@register
class PlanR(Resource):
    model = Plan
    key = "plans"
    title = "پلن‌ها"
    icon = "award"
    group = "billing"
    list_display = ("name", "price_monthly", "price_yearly", "max_surveys", "max_responses_month", "is_default", "is_active")
    toggles = ("is_active", "is_highlighted")
    fieldsets = [("پلن", ["name", "slug", "description", "price_monthly", "price_yearly", "order", "is_default", "is_highlighted", "is_active"]),
                 ("محدودیت‌ها", ["max_surveys", "max_responses_month", "max_members", "max_upload_mb"]),
                 ("امکانات", ["logic", "calcs", "file_upload", "export", "remove_branding", "custom_theme", "webhook", "sms_notify", "password"])]


@register
class SubscriptionR(Resource):
    model = Subscription
    key = "subscriptions"
    title = "اشتراک‌ها"
    icon = "star"
    group = "billing"
    list_display = ("workspace", "plan", "started_at", "expires_at", "active")
    filters = ("plan",)
    search = ("workspace__name",)
    select_related = ("workspace", "plan")
    help = "برای هدیه یا فعال‌سازی دستی پلن، یک اشتراک برای فضای کاری بسازید."

    @label("فعال")
    def active(self, obj):
        return format_html('<span class="yn yn--{}">{}</span>', "y" if obj.is_active else "n", "✓" if obj.is_active else "✕")


@register
class PaymentR(Resource):
    model = Payment
    key = "payments"
    title = "پرداخت‌ها"
    icon = "cart"
    group = "billing"
    list_display = ("pk", "workspace", "plan", "months", "amount", "status", "created_at", "ref_id")
    filters = ("status", "plan")
    search = ("ref_id", "authority", "workspace__name")
    select_related = ("workspace", "plan")
    can_add = False
    readonly = ("workspace", "user", "plan", "months", "amount", "authority", "ref_id", "card_pan", "paid_at")


@register
class FolderR(Resource):
    model = Folder
    key = "folders"
    icon = "folder"
    group = "forms"
    hidden_in_menu = True
    list_display = ("name", "workspace")
