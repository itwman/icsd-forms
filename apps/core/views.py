from django.db.models import Sum
from django.shortcuts import get_object_or_404, redirect, render

from apps.billing.models import FEATURES, Plan
from apps.surveys.models import Survey, Template
from .models import FAQ, Page


def home(request):
    if request.GET.get("app") and request.user.is_authenticated:
        return redirect("surveys:dashboard")
    return render(request, "core/home.html", {
        "plans": Plan.objects.filter(is_active=True), "features": FEATURES, "faqs": FAQ.objects.filter(is_active=True),
        "templates": Template.objects.filter(is_active=True, is_featured=True)[:6],
        "stats": {"forms": Survey.objects.filter(is_deleted=False).count(),
                  "responses": Survey.objects.aggregate(n=Sum("response_count"))["n"] or 0},
    })


def pricing(request):
    return render(request, "core/pricing.html", {"plans": Plan.objects.filter(is_active=True), "features": FEATURES,
                                                 "faqs": FAQ.objects.filter(is_active=True)})


def templates(request):
    cat = request.GET.get("cat", "")
    qs = Template.objects.filter(is_active=True)
    if cat:
        qs = qs.filter(category=cat)
    return render(request, "core/templates.html", {"templates": qs, "cats": Template.CATS, "cat": cat})


def page(request, slug):
    p = get_object_or_404(Page, slug=slug, is_published=True)
    return render(request, "core/page.html", {"page": p})


def page_not_found(request, exception=None):
    return render(request, "404.html", status=404)
