"""فهرست، افزودن، ویرایش، حذف، کپی و عملیات گروهی — برای همه‌ی منابع ثبت‌شده."""
import csv
import json
from functools import reduce
from operator import or_

from django.contrib import messages
from django.contrib.admin.models import ADDITION, CHANGE, DELETION, LogEntry
from django.contrib.admin.utils import NestedObjects
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.paginator import Paginator
from django.db import models, router, transaction
from django.db.models import ProtectedError, Q
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect
from django.utils.html import escape
from django.utils.text import slugify
from django.views.decorators.http import require_POST

from .base import get_resource, log, panel_render, staff_required
from .cells import cell, plain, thumb_html
from .forms import build_form, build_formset
from .registry import REGISTRY


def _need(resource, user, action):
    ok = resource.can_view(user) if action == "view" else resource.perm(user, action)
    if not ok:
        raise PermissionDenied


def _filtered(request, resource):
    qs = resource.queryset(request)
    q = request.GET.get("q", "").strip()
    if q and resource.search:
        qs = qs.filter(reduce(or_, [Q(**{f"{f}__icontains": q}) for f in resource.search]))
    active = {}
    for name, _, _ in resource.filter_fields():
        v = request.GET.get(f"f_{name}", "")
        if v == "":
            continue
        active[name] = v
        f = resource.field_by_path(name)
        if isinstance(f, models.BooleanField):
            qs = qs.filter(**{name: v == "1"})
        else:
            qs = qs.filter(**{name: v})
    if active or q:
        qs = qs.distinct()
    order = request.GET.get("o", "")
    concrete = {f.name for f in resource.model._meta.fields}
    if order.lstrip("-") in concrete:
        qs = qs.order_by(order, "-pk")
    elif not qs.ordered:
        qs = qs.order_by("-pk")
    return qs, q, active, order


@staff_required
def list_view(request, key):
    r = get_resource(key)
    _need(r, request.user, "view")
    if r.singleton:
        return redirect("panel:edit", key=key, pk=1)

    if request.method == "POST":
        return _bulk(request, r)

    qs, q, active, order = _filtered(request, r)
    if request.GET.get("export") == "csv":
        return _export(r, qs)

    sortable = bool(r.sortable and not q and not active and not order and r.perm(request.user, "change"))
    page = Paginator(qs, 500 if sortable else r.per_page).get_page(request.GET.get("page"))
    cols = r.columns()
    concrete = {f.name for f in r.model._meta.fields}
    rows = []
    for obj in page.object_list:
        cells = [cell(r, obj, name, fn, request.user) for name, _, fn in cols]
        rows.append({"obj": obj, "cells": cells, "thumb": thumb_html(getattr(obj, r.thumb)) if r.thumb else "",
                     "edit": r.edit_url(obj), "site": r.view_on_site(obj)})
    params = request.GET.copy()
    params.pop("page", None)
    params.pop("o", None)
    return panel_render(request, "panel/list.html", {
        "r": r, "rows": rows, "page": page, "q": q, "active_filters": active, "order": order,
        "columns": [{"name": n, "label": lbl, "sortable": n in concrete} for n, lbl, _ in cols],
        "filters": r.filter_fields(), "sortable": sortable, "qs_base": params.urlencode(),
        "can_add": r.perm(request.user, "add"), "can_delete": r.perm(request.user, "delete"),
        "can_change": r.perm(request.user, "change"),
        "bool_toggles": [(f, str(r.model._meta.get_field(f).verbose_name)) for f in r.toggles],
        "total": page.paginator.count,
    }, active=key)


def _export(r, qs):
    resp = HttpResponse(content_type="text/csv; charset=utf-8")
    resp["Content-Disposition"] = f'attachment; filename="{r.key}.csv"'
    resp.write("﻿")  # تا اکسل فارسی را درست باز کند
    w = csv.writer(resp)
    cols = r.columns()
    w.writerow([lbl for _, lbl, _ in cols])
    for obj in qs[:20000]:
        w.writerow([plain(r, obj, n, fn) for n, _, fn in cols])
    return resp


def _bulk(request, r):
    ids = request.POST.getlist("ids")
    action = request.POST.get("action", "")
    qs = r.queryset(request).filter(pk__in=ids)
    if not ids or not action:
        messages.warning(request, "هیچ ردیفی انتخاب نشده است.")
        return redirect(request.get_full_path())
    if action == "delete":
        _need(r, request.user, "delete")
        return panel_render(request, "panel/confirm_delete.html", {
            "r": r, "objects": list(qs[:200]), "count": qs.count(), "ids": ids, "bulk": True,
            "related": _related_summary(list(qs[:50]))}, active=r.key)
    if action == "delete_confirmed":
        _need(r, request.user, "delete")
        n = 0
        try:
            with transaction.atomic():
                for obj in qs:
                    log(request, obj, DELETION, "حذف گروهی از پنل")
                    obj.delete()
                    n += 1
        except ProtectedError:
            messages.error(request, "برخی ردیف‌ها به داده‌های دیگری وصل‌اند و حذف نمی‌شوند. اول وابستگی‌ها را بردارید.")
            return redirect(r.list_url())
        messages.success(request, f"{n} مورد حذف شد.")
        return redirect(r.list_url())
    if action.startswith(("on:", "off:")):
        _need(r, request.user, "change")
        val, field = action.split(":", 1)
        if field not in r.toggles:
            raise PermissionDenied
        n = 0
        for obj in qs:
            setattr(obj, field, val == "on")
            obj.save()
            log(request, obj, CHANGE, f"{field} → {val}")
            n += 1
        messages.success(request, f"{n} مورد به‌روز شد.")
        return redirect(request.get_full_path())
    if action == "export":
        return _export(r, qs)
    messages.error(request, "عملیات نامعتبر.")
    return redirect(request.get_full_path())


def _related_summary(objs):
    if not objs:
        return []
    collector = NestedObjects(using=router.db_for_write(objs[0].__class__))
    collector.collect(objs)
    out = []
    for model, instances in collector.model_objs.items():
        if model is objs[0].__class__:
            continue
        out.append((model._meta.verbose_name_plural, len(instances)))
    return out


def _auto_slugs(r, inst):
    for target, source in r.prepopulate.items():
        if getattr(inst, target, None):
            continue
        src = getattr(inst, source, "") or getattr(inst, "title", "") or getattr(inst, "name", "") or r.model_name
        f = inst._meta.get_field(target)
        base = slugify(str(src), allow_unicode=True)[: (f.max_length or 50) - 4] or r.model_name
        slug, i = base, 2
        while r.model._default_manager.filter(**{target: slug}).exclude(pk=inst.pk).exists():
            slug, i = f"{base}-{i}", i + 1
        setattr(inst, target, slug)


def _initial_from_get(r, request):
    initial = {}
    names = {f.name for f in r.model._meta.get_fields()}
    for k, v in request.GET.items():
        if k in names:
            initial[k] = v
    return initial


@staff_required
def edit_view(request, key, pk=None):
    r = get_resource(key)
    is_new = pk is None
    if r.singleton:
        obj = r.get_singleton()
        is_new = False
    elif is_new:
        _need(r, request.user, "add")
        obj = r.model()
    else:
        _need(r, request.user, "view")
        obj = get_object_or_404(r.queryset(request), pk=pk)
    can_change = r.perm(request.user, "add" if is_new else "change") and (r.can_edit or is_new)
    if r.singleton:
        can_change = r.perm(request.user, "change")
        if not (can_change or r.perm(request.user, "view")):
            raise PermissionDenied

    exclude = set(r.exclude_for(request))
    Form = build_form(r)
    form_kwargs = {"instance": obj}
    if is_new:
        form_kwargs["initial"] = _initial_from_get(r, request)
    form = Form(request.POST or None, request.FILES or None, **form_kwargs)
    for name in exclude:
        form.fields.pop(name, None)
    for target in r.prepopulate:
        if target in form.fields:
            form.fields[target].required = False   # خالی = ساخت خودکار از عنوان

    formsets = []
    for inl in r.inlines:
        FS = build_formset(r.model, inl)
        fs = FS(request.POST or None, request.FILES or None, instance=obj, prefix=inl.prefix)
        formsets.append((inl, fs))

    if request.method == "POST":
        if not can_change:
            raise PermissionDenied
        if form.is_valid() and all(fs.is_valid() for _, fs in formsets):
            try:
                with transaction.atomic():
                    inst = form.save(commit=False)
                    form.apply_media_picks(inst, request.POST)
                    _auto_slugs(r, inst)
                    r.before_save(request, inst, form, is_new)
                    inst.save()
                    form.save_m2m()
                    for inl, fs in formsets:
                        fs.instance = inst
                        for f in fs.forms:
                            if f.cleaned_data and not f.cleaned_data.get("DELETE"):
                                f.apply_media_picks(f.instance, request.POST)
                        fs.save()
                    r.after_save(request, inst, form, is_new)
            except ValidationError as e:
                form.add_error(None, e)
            else:
                changed = ", ".join(str(form.fields[f].label) for f in form.changed_data if f in form.fields)
                log(request, inst, ADDITION if is_new else CHANGE, ("ایجاد" if is_new else "ویرایش: " + changed) if changed or is_new else "ویرایش")
                messages.success(request, f"«{escape(str(inst))}» ذخیره شد.")
                nxt = request.POST.get("_next", "")
                if nxt == "add" and r.perm(request.user, "add"):
                    return redirect(r.add_url())
                if nxt == "list" and not r.singleton:
                    return redirect(r.list_url())
                return redirect(r.edit_url(inst))
        messages.error(request, "لطفاً خطاهای فرم را برطرف کنید.")

    # چیدمان بخش‌ها
    sections = []
    for title, names in r.form_fieldsets(form):
        fields = [form[n] for n in names if n in form.fields]
        if fields:
            sections.append({"title": title, "fields": fields})
    used = {f.name for s in sections for f in s["fields"]} | set(r.seo_fields())
    rest = [form[n] for n in form.fields if n not in used]
    if rest:
        sections.append({"title": "سایر", "fields": rest})
    seo_fields = [form[n] for n in r.seo_fields() if n in form.fields]

    children = []
    if not is_new:
        for ch in r.children:
            cr = REGISTRY.get(ch.resource_key)
            if not cr or not cr.can_view(request.user):
                continue
            items = cr.queryset(request).filter(**ch.lookup(obj))
            init = ch.initial(obj) if callable(ch.initial) else {}
            add = cr.add_url() + ("?" + "&".join(f"{k}={v}" for k, v in init.items()) if init else "")
            children.append({"title": ch.title, "r": cr, "items": [(o, cr.edit_url(o)) for o in items[:300]],
                             "count": items.count(), "add": add if cr.perm(request.user, "add") else "",
                             "all": cr.list_url()})

    history = []
    if not is_new:
        history = (LogEntry.objects.filter(content_type=ContentType.objects.get_for_model(r.model), object_id=str(obj.pk))
                   .select_related("user").order_by("-action_time")[:12])

    media = form.media
    for _, fs in formsets:
        media += fs.media
    return panel_render(request, "panel/form.html", {
        "r": r, "obj": obj, "is_new": is_new, "form": form, "sections": sections, "seo_fields": seo_fields,
        "formsets": formsets, "children": children, "history": history, "can_change": can_change,
        "can_delete": not is_new and not r.singleton and r.perm(request.user, "delete"),
        "can_duplicate": not is_new and r.can_duplicate and r.perm(request.user, "add"),
        "site_url": None if is_new else r.view_on_site(obj), "media": media,
        "prepopulate": json.dumps(r.prepopulate), "tabs": getattr(r, "tabs", False),
    }, active=key)


@staff_required
def delete_view(request, key, pk):
    r = get_resource(key)
    _need(r, request.user, "delete")
    obj = get_object_or_404(r.queryset(request), pk=pk)
    if request.method == "POST":
        name = str(obj)
        try:
            with transaction.atomic():
                log(request, obj, DELETION, "حذف از پنل")
                obj.delete()
        except ProtectedError:
            messages.error(request, "این مورد به داده‌های دیگری وصل است و حذف نمی‌شود (مثلاً دسته‌ای که هنوز مطلب دارد).")
            return redirect(r.edit_url(obj))
        messages.success(request, f"«{escape(name)}» حذف شد.")
        return redirect(r.list_url())
    return panel_render(request, "panel/confirm_delete.html", {
        "r": r, "objects": [obj], "count": 1, "bulk": False, "related": _related_summary([obj])}, active=key)


@staff_required
@require_POST
def duplicate_view(request, key, pk):
    r = get_resource(key)
    _need(r, request.user, "add")
    src = get_object_or_404(r.queryset(request), pk=pk)
    m2m = {f.name: list(getattr(src, f.name).all()) for f in src._meta.many_to_many}
    obj = r.model.objects.get(pk=src.pk)
    obj.pk = obj.id = None
    obj._state.adding = True
    for f in obj._meta.fields:
        if f.name in ("title", "name") and isinstance(f, models.CharField):
            setattr(obj, f.name, (getattr(obj, f.name) + " (کپی)")[: f.max_length])
        if f.name == "slug":
            base = slugify(f"{src.slug}-copy", allow_unicode=True)[: f.max_length - 4]
            slug, i = base, 2
            while r.model.objects.filter(slug=slug).exists():
                slug, i = f"{base}-{i}", i + 1
            obj.slug = slug
        if f.name in ("is_published", "is_active") and isinstance(f, models.BooleanField):
            setattr(obj, f.name, False)
    obj.save()
    for name, vals in m2m.items():
        getattr(obj, name).set(vals)
    log(request, obj, ADDITION, f"کپی از #{src.pk}")
    messages.success(request, "کپی ساخته شد (منتشرنشده). حالا ویرایشش کنید.")
    return redirect(r.edit_url(obj))


# ─── آژاکس ───
@staff_required
@require_POST
def toggle_api(request, key, pk, field):
    r = get_resource(key)
    _need(r, request.user, "change")
    if field not in r.toggles:
        return JsonResponse({"error": "نامعتبر"}, status=400)
    obj = get_object_or_404(r.queryset(request), pk=pk)
    setattr(obj, field, not getattr(obj, field))
    obj.save()
    log(request, obj, CHANGE, f"{field} → {getattr(obj, field)}")
    return JsonResponse({"value": getattr(obj, field)})


@staff_required
@require_POST
def setchoice_api(request, key, pk, field):
    r = get_resource(key)
    _need(r, request.user, "change")
    if field not in r.quick_choices:
        return JsonResponse({"error": "نامعتبر"}, status=400)
    obj = get_object_or_404(r.queryset(request), pk=pk)
    val = request.POST.get("value", "")
    if val not in dict(r.model._meta.get_field(field).choices):
        return JsonResponse({"error": "مقدار نامعتبر"}, status=400)
    setattr(obj, field, val)
    obj.save()
    log(request, obj, CHANGE, f"{field} → {val}")
    return JsonResponse({"value": val})


@staff_required
@require_POST
def reorder_api(request, key):
    r = get_resource(key)
    _need(r, request.user, "change")
    if not r.sortable:
        return JsonResponse({"error": "این فهرست ترتیب‌پذیر نیست"}, status=400)
    try:
        ids = [int(i) for i in json.loads(request.body or "{}").get("ids", [])]
    except (ValueError, TypeError, json.JSONDecodeError):
        return JsonResponse({"error": "نامعتبر"}, status=400)
    with transaction.atomic():
        for i, pk in enumerate(ids):
            r.model.objects.filter(pk=pk).update(**{r.sortable: (i + 1) * 10})
    return JsonResponse({"ok": True, "count": len(ids)})


@staff_required
def autocomplete_api(request, key):
    r = get_resource(key)
    if not r.can_view(request.user):
        return JsonResponse({"results": []})
    q = request.GET.get("q", "").strip()
    qs = r.queryset(request)
    if q and r.search:
        qs = qs.filter(reduce(or_, [Q(**{f"{f}__icontains": q}) for f in r.search]))
    return JsonResponse({"results": [{"value": o.pk, "text": str(o)} for o in qs[:30]]})
