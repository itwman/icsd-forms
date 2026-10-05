from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_POST

from apps.teams.utils import current_membership, require_role
from .gateways import GatewayError, Zarinpal
from .models import FEATURES, Payment, Plan, Subscription
from .utils import activate, plan_of, usage


@login_required
def billing(request):
    m = current_membership(request)
    ws = m.workspace
    plan = plan_of(ws)
    sub = Subscription.objects.filter(workspace=ws).first()
    u = usage(ws)

    def pct(a, b):
        return min(100, round(a * 100 / b)) if b else 0
    return render(request, "billing/billing.html", {
        "m": m, "ws": ws, "plan": plan, "sub": sub, "usage": u,
        "bars": [("فرم‌ها", u["surveys"], plan.max_surveys, pct(u["surveys"], plan.max_surveys)),
                 ("پاسخ این ماه", u["responses"], plan.max_responses_month, pct(u["responses"], plan.max_responses_month)),
                 ("اعضای تیم", u["members"], plan.max_members, pct(u["members"], plan.max_members))],
        "plans": Plan.objects.filter(is_active=True), "features": FEATURES,
        "payments": Payment.objects.filter(workspace=ws)[:20],
    })


@login_required
@require_POST
def checkout(request):
    m = current_membership(request)
    require_role(m, "owner")
    plan = get_object_or_404(Plan, slug=request.POST.get("plan"), is_active=True)
    months = 12 if request.POST.get("period") == "yearly" else 1
    amount = plan.price_yearly if months == 12 else plan.price_monthly
    if not amount:
        messages.info(request, "این پلن رایگان است.")
        return redirect("billing:billing")
    pay = Payment.objects.create(workspace=m.workspace, user=request.user, plan=plan, months=months, amount=amount)
    try:
        gw = Zarinpal()
        pay.authority = gw.request(amount, request.build_absolute_uri(reverse("billing:callback")),
                                   f"اشتراک {plan.name} — {m.workspace.name}", request.user.mobile)
        pay.save(update_fields=["authority"])
        return redirect(gw.pay_url(pay.authority))
    except GatewayError as e:
        pay.status = "failed"
        pay.save(update_fields=["status"])
        messages.error(request, str(e))
        return redirect("billing:billing")


@login_required
def callback(request):
    authority = request.GET.get("Authority", "")
    pay = get_object_or_404(Payment, authority=authority)
    if pay.status == "paid":
        return redirect("billing:billing")
    if request.GET.get("Status") != "OK":
        pay.status = "failed"
        pay.save(update_fields=["status"])
        messages.error(request, "پرداخت انجام نشد یا لغو شد.")
        return redirect("billing:billing")
    res = Zarinpal().verify(pay.amount, authority)
    if res["ok"]:
        pay.status, pay.ref_id, pay.card_pan, pay.paid_at = "paid", res["ref_id"], res["card_pan"], timezone.now()
        pay.save()
        activate(pay)
        messages.success(request, f"پرداخت موفق بود؛ پلن «{pay.plan.name}» فعال شد. کد پیگیری: {pay.ref_id}")
    else:
        pay.status = "failed"
        pay.save(update_fields=["status"])
        messages.error(request, "تأیید پرداخت ناموفق بود. اگر مبلغ کسر شده، تا ۷۲ ساعت برمی‌گردد.")
    return redirect("billing:billing")
