from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from django.db.models import Q

from apps.common.forms import normalize_digits


class MobileOrEmailBackend(ModelBackend):
    """ورود با موبایل یا ایمیل + رمز."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        User = get_user_model()
        ident = normalize_digits((username or kwargs.get("mobile") or "").strip())
        if not ident or not password:
            return None
        try:
            user = User.objects.get(Q(mobile=ident) | Q(email__iexact=ident))
        except (User.DoesNotExist, User.MultipleObjectsReturned):
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
