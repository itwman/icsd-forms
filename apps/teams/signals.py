from django.conf import settings
from django.contrib.auth.signals import user_logged_in
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Membership, Workspace


def accept_invites(user):
    for inv in Membership.objects.filter(user__isnull=True, mobile=user.mobile):
        if Membership.objects.filter(workspace=inv.workspace, user=user).exists():
            inv.delete()
        else:
            inv.user = user
            inv.mobile = ""
            inv.save()


def ensure_workspace(user):
    if not Membership.objects.filter(user=user).exists():
        ws = Workspace.objects.create(name=f"فضای کاری {user.first_name or user.mobile[-4:]}", owner=user)
        Membership.objects.create(workspace=ws, user=user, role="owner")
        user.current_workspace = ws
        user.save(update_fields=["current_workspace"])


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def on_user_created(sender, instance, created, **kw):
    if created:
        accept_invites(instance)
        ensure_workspace(instance)


@receiver(user_logged_in)
def on_login(sender, user, request, **kw):
    accept_invites(user)
    ensure_workspace(user)
