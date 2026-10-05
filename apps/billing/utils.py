from datetime import timedelta

import jdatetime
from django.utils import timezone

from .models import Plan, Subscription


def default_plan():
    p = Plan.objects.filter(is_default=True, is_active=True).first() or Plan.objects.filter(price_monthly=0).first()
    if p is None:
        p = Plan.objects.create(slug="free", name="رایگان", is_default=True, max_surveys=3, max_responses_month=100)
    return p


def plan_of(workspace):
    sub = Subscription.objects.filter(workspace=workspace).select_related("plan").first()
    if sub and sub.is_active and sub.plan.is_active:
        return sub.plan
    return default_plan()


def month_start():
    """ابتدای ماه شمسی جاری (به وقت تهران)."""
    j = jdatetime.date.fromgregorian(date=timezone.localdate())
    g = jdatetime.date(j.year, j.month, 1).togregorian()
    return timezone.make_aware(timezone.datetime(g.year, g.month, g.day))


def usage(workspace):
    from apps.surveys.models import Response, Survey
    return {
        "surveys": Survey.objects.filter(workspace=workspace, is_deleted=False).count(),
        "responses": Response.objects.filter(survey__workspace=workspace, completed_at__gte=month_start()).count(),
        "members": workspace.memberships.count(),
    }


def can_create_survey(workspace):
    plan = plan_of(workspace)
    if not plan.max_surveys:
        return True, plan
    return usage(workspace)["surveys"] < plan.max_surveys, plan


def response_quota_left(workspace):
    plan = plan_of(workspace)
    if not plan.max_responses_month:
        return True
    from apps.surveys.models import Response
    used = Response.objects.filter(survey__workspace=workspace, completed_at__gte=month_start()).count()
    return used < plan.max_responses_month


def activate(payment):
    sub, _ = Subscription.objects.get_or_create(workspace=payment.workspace, defaults={"plan": payment.plan})
    now = timezone.now()
    base = sub.expires_at if (sub.plan_id == payment.plan_id and sub.expires_at and sub.expires_at > now) else now
    sub.plan = payment.plan
    sub.started_at = now if base == now else sub.started_at
    sub.expires_at = base + timedelta(days=31 * payment.months if payment.months < 12 else 365)
    sub.save()
    return sub
