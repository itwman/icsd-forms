"""
ثبت «منابع» پنل: هر مدل یک Resource دارد که می‌گوید در فهرست چه ستون‌هایی، چه فیلترها و جستجویی،
در فرم چه بخش‌هایی و چه زیرفرم‌هایی (inline) داشته باشد. صفحه‌های فهرست/افزودن/ویرایش/حذف از روی همین ساخته می‌شوند.
"""
from django.db import models
from django.urls import NoReverseMatch, reverse

REGISTRY = {}          # key → Resource instance
BY_MODEL = {}          # model class → Resource instance


class Inline:
    """زیرفرم داخل فرم والد (مثل قابلیت‌های محصول، گزینه‌های سؤال)."""

    def __init__(self, model, fields, title=None, fk=None, sortable=None, extra=1, stacked=False, max_num=None):
        self.model, self.fields, self.fk = model, fields, fk
        self.title = title or model._meta.verbose_name_plural
        self.sortable = sortable if sortable is not None else ("order" if "order" in fields else None)
        self.extra, self.stacked, self.max_num = extra, stacked, max_num

    @property
    def prefix(self):
        return self.model._meta.model_name


class Child:
    """فهرست فرزندان مرتبط زیر فرم (مثل درس‌های یک دوره) با لینک ویرایش و دکمه‌ی افزودن."""

    def __init__(self, resource_key, title, lookup, initial=None, columns=None):
        self.resource_key, self.title = resource_key, title
        self.lookup = lookup            # تابع obj → dict فیلتر
        self.initial = initial or {}    # تابع obj → dict مقدار پیش‌فرض برای «افزودن»
        self.columns = columns


class Resource:
    model = None
    key = ""
    title = ""                 # جمع، برای منو و عنوان صفحه
    title_single = ""
    icon = "doc"
    group = "content"
    help = ""
    list_display = ()          # نام فیلد یا متد Resource
    search = ()
    filters = ()               # فیلدهای بولی، choices یا FK
    ordering = None
    sortable = None            # نام فیلد ترتیب → کشیدن و رها کردن در فهرست
    toggles = ()               # فیلدهای بولی که در فهرست با یک کلیک عوض می‌شوند
    quick_choices = ()         # فیلدهای choices که در فهرست قابل تغییرند (مثل وضعیت)
    fieldsets = None           # [("عنوان", ["فیلد", ...]), ...]؛ None = همه‌ی فیلدهای قابل ویرایش
    exclude = ()
    readonly = ()              # فقط نمایش در فرم
    inlines = ()
    children = ()
    seo = None                 # {"body": "body", "title": "title", "prefix": "/blog/"}
    thumb = None               # نام فیلد تصویر برای ستون کوچک
    can_add = can_edit = can_delete = True
    can_duplicate = False
    singleton = False
    per_page = 30
    select_related = ()
    badge = None               # تابع → عدد کنار منو
    view_perm_only = False     # فقط مشاهده (مثل بازدیدها)
    prepopulate = {}           # {"slug": "title"}
    hidden_in_menu = False

    def __init__(self):
        meta = self.model._meta
        self.app_label, self.model_name = meta.app_label, meta.model_name
        self.title = self.title or str(meta.verbose_name_plural)
        self.title_single = self.title_single or str(meta.verbose_name)
        self.key = self.key or f"{self.app_label}-{self.model_name}"
        if self.view_perm_only:
            self.can_add = False
        if self.sortable is None and any(f.name == "order" for f in meta.fields):
            self.sortable = "order"

    # ─── مجوزها ───
    def perm(self, user, action):
        if not (user.is_active and user.is_staff):
            return False
        if self.view_perm_only and action in ("add", "change", "delete"):
            return user.is_superuser and action == "delete"
        if action == "add" and not self.can_add or action == "delete" and not self.can_delete:
            return False
        return user.has_perm(f"{self.app_label}.{action}_{self.model_name}")

    def can_view(self, user):
        return self.perm(user, "view") or self.perm(user, "change")

    # ─── داده ───
    def queryset(self, request):
        qs = self.model._default_manager.all()
        if self.select_related:
            qs = qs.select_related(*self.select_related)
        if self.ordering:
            qs = qs.order_by(*self.ordering)
        return qs

    def get_object(self, request, pk):
        return self.queryset(request).get(pk=pk)

    def get_singleton(self):
        return self.model.load() if hasattr(self.model, "load") else self.model._default_manager.get_or_create(pk=1)[0]

    # ─── قلاب‌های ذخیره ───
    def before_save(self, request, obj, form, is_new):
        pass

    def after_save(self, request, obj, form, is_new):
        pass

    # ─── آدرس‌ها ───
    def url(self, name, *args):
        return reverse(f"panel:{name}", args=[self.key, *args])

    def list_url(self):
        return reverse("panel:list", args=[self.key])

    def add_url(self):
        return reverse("panel:add", args=[self.key])

    def edit_url(self, obj):
        if self.singleton:
            return reverse("panel:list", args=[self.key])
        return reverse("panel:edit", args=[self.key, obj.pk])

    def view_on_site(self, obj):
        try:
            return obj.get_absolute_url() if hasattr(obj, "get_absolute_url") else None
        except (NoReverseMatch, AttributeError, ValueError):
            return None

    # ─── ستون‌ها ───
    def columns(self):
        cols = []
        for name in self.list_display or ("__str__",):
            fn = getattr(self, name, None)
            if callable(fn) and hasattr(fn, "label"):
                cols.append((name, getattr(fn, "label", name), fn))
                continue
            if name == "__str__":
                cols.append((name, self.title_single, None))
                continue
            if name == "pk":
                cols.append((name, "#", None))
                continue
            f = self.model._meta.get_field(name)
            cols.append((name, str(f.verbose_name), None))
        return cols

    def field_by_path(self, path):
        model, f = self.model, None
        for part in path.split("__"):
            f = model._meta.get_field(part)
            if f.is_relation:
                model = f.related_model
        return f

    def exclude_for(self, request):
        """فیلدهایی که این کاربر نباید ویرایش کند."""
        return ()

    def filter_fields(self):
        out = []
        for name in self.filters:
            f = self.field_by_path(name)
            if isinstance(f, models.BooleanField):
                out.append((name, str(f.verbose_name), [("1", "بله"), ("0", "خیر")]))
            elif f.choices:
                out.append((name, str(f.verbose_name), [(str(k), v) for k, v in f.choices if k != ""]))
            elif f.is_relation:
                rel = f.related_model._default_manager.all()[:200]
                out.append((name, str(f.verbose_name), [(str(o.pk), str(o)) for o in rel]))
        return out

    def form_fieldsets(self, form):
        if self.fieldsets:
            return self.fieldsets
        names = [n for n in form.fields if n not in self.seo_fields()]
        return [("اطلاعات", names)]

    def seo_fields(self):
        return ("focus_keyword", "seo_title", "meta_description", "canonical_url", "noindex") if self.seo else ()


def label(text):
    """دکوراتور برچسب ستون: @label("وضعیت")"""
    def deco(fn):
        fn.label = text
        return fn
    return deco


def register(cls):
    inst = cls()
    REGISTRY[inst.key] = inst
    BY_MODEL[inst.model] = inst
    return cls


def for_model(model_or_obj):
    m = model_or_obj if isinstance(model_or_obj, type) else type(model_or_obj)
    return BY_MODEL.get(m)


GROUPS = [
    ("site", "سامانه"),
    ("forms", "فرم‌ها و پاسخ‌ها"),
    ("billing", "پلن و پرداخت"),
    ("people", "کاربران و دسترسی"),
]
